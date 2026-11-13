/**
 * ============================================================================
 * PASSO 6 — BUSCA SEMÂNTICA (OPCIONAL: SEMANTIC_SEARCH=true)
 * ============================================================================
 *
 * A busca do PASSO 3.6 é literal: "vetor" não acha "embedding". Aqui a busca é
 * por SIGNIFICADO, usando embeddings — o mesmo "R" do RAG estudado no curso.
 *
 * Embedding = uma lista de números (um vetor) que representa o significado de
 * um texto. Textos sobre o mesmo assunto geram vetores próximos, mesmo com
 * palavras diferentes. Quem gera os vetores é um MODELO DE EMBEDDINGS: um
 * modelo pequeno, que roda no seu computador e não escreve texto nem responde
 * nada. O servidor continua sem LLM: quem responde ainda é o modelo do chat.
 *
 * Fluxo:
 *   ao iniciar → divide cada anotação/PDF em trechos → gera o vetor de cada um
 *               → salva o índice em DATA_DIR (as próximas vezes só processam
 *                 arquivos novos ou alterados)
 *   ao buscar  → gera o vetor da pergunta → compara com todos os trechos
 *               → devolve os mais parecidos
 *
 * Só anotações e PDFs entram no índice. Código continua só na busca literal:
 * nomes como registerTool já são termos exatos, e o índice ficaria duas vezes
 * maior.
 *
 * Mapa deste arquivo:
 *   6.1  o modelo e os limites
 *   6.2  carregar o modelo (download único)
 *   6.3  dividir arquivos em trechos
 *   6.4  o índice: construir, atualizar e salvar
 *   6.5  buscar por similaridade
 *   6.6  busca híbrida: junta a busca literal e esta (usada pela tool buscar_material)
 */
import { readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
    carregarExclusao, config, enabledTypes, gravarAtomico, listNoteFiles, readSearchableLines, resolveInsideNotes,
    searchNotes, semCaminhos, semFrontmatter, typeOf, type Resultado, type Tipo,
} from './service.ts';
import { prepareUntrusted, redactSecrets } from './safety.ts';

// ----------------------------------------------------------------------------
// 6.1 — O MODELO E OS LIMITES
// ----------------------------------------------------------------------------
// multilingual-e5-small: entende português e inglês, gera vetores de 384
// números e tem licença MIT. A versão quantizada (q8) tem ~120 MB.
// A revision fixa um commit do repositório do modelo: se alguém publicar uma
// versão nova (ou maliciosa) no Hugging Face, ela não é baixada sem querer.
const MODEL = 'Xenova/multilingual-e5-small';
const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
// Muda quando o formato do índice ou o modelo mudam: o índice antigo é refeito.
const INDEX_VERSION = 1;
const INDEX_FILE = 'indice-semantico.json';
export const SEMANTIC_TYPES: Tipo[] = ['anotacoes', 'pdf'];
// ~800 caracteres por trecho: grande o bastante para ter contexto, pequeno o
// bastante para o vetor representar um assunto só.
const CHUNK_CHARS = 800;
const BATCH_SIZE = 16;
const MAX_SEMANTIC_RESULTS = 8;
const MAX_SEMANTIC_PER_FILE = 2;
// O índice é verificado de novo (arquivos novos/alterados) no máximo a cada 5 min.
const REFRESH_MS = 5 * 60_000;

export type Trecho = { linha: number; pagina?: number; texto: string; alertas: string[] };
export type ResultadoSemantico = Resultado & { similaridade: number };
type Embedder = (texts: string[]) => Promise<number[][]>;
type ArquivoIndexado = { mtimeMs: number; size: number; trechos: (Trecho & { vetor: string })[] };

// ----------------------------------------------------------------------------
// 6.2 — CARREGAR O MODELO
// ----------------------------------------------------------------------------
// import() dinâmico: a biblioteca (~470 MB instalada) é dependência OPCIONAL e
// só é carregada quando SEMANTIC_SEARCH=true. Se não estiver instalada, o resto
// do servidor funciona normalmente.
//
// O modelo e5 foi treinado com prefixos: "query: " para perguntas e
// "passage: " para trechos. Sem eles a qualidade cai.
let embedderPromise: Promise<Embedder> | undefined;

// Carrega o modelo uma única vez e devolve a função que transforma textos em
// vetores. A promessa fica guardada: as buscas seguintes reaproveitam o modelo.
function loadEmbedder(): Promise<Embedder> {
    embedderPromise ??= (async () => {
        const { pipeline, env } = await import('@huggingface/transformers').catch(() => {
            throw new Error('Biblioteca @huggingface/transformers não instalada. Com npx, acrescente "--package=@huggingface/transformers@4.3.2" nos args (veja "Busca por significado" no README); a partir do código-fonte, rode "npm install".');
        });
        // Único acesso à internet do servidor: baixar o modelo na primeira vez.
        // Depois ele fica em MODELS_DIR e é lido do disco. Seus arquivos nunca
        // são enviados: os vetores são calculados aqui, localmente.
        env.cacheDir = config.modelsDir;
        const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8', revision: MODEL_REVISION });
        return async (texts: string[]) => {
            // mean pooling + normalize: um vetor de tamanho 1 por texto, o que
            // permite comparar dois vetores com um simples produto escalar (6.5).
            const output = await extractor(texts, { pooling: 'mean', normalize: true });
            return output.tolist() as number[][];
        };
    })();
    // Se falhar (sem internet no primeiro uso, por exemplo), tenta de novo na próxima vez.
    embedderPromise.catch(() => { embedderPromise = undefined; });
    return embedderPromise;
}

// ----------------------------------------------------------------------------
// 6.3 — DIVIDIR ARQUIVOS EM TRECHOS ("chunking")
// ----------------------------------------------------------------------------
// Junta linhas seguidas até ~CHUNK_CHARS caracteres. Cada trecho guarda a linha
// onde começa (e a página, em PDFs) para a fonte poder ser citada.
// Exportada para os testes (não depende do modelo).
export function dividirEmTrechos(sections: { pagina?: number; lines: string[] }[]): Omit<Trecho, 'alertas'>[] {
    const trechos: Omit<Trecho, 'alertas'>[] = [];
    for (const { pagina, lines } of sections) {
        let atual: string[] = [];
        // Tamanho de atual.join('\n'), somado aos poucos em vez de recalculado a cada linha.
        let tamanho = 0;
        let inicio = 1;
        const fechar = () => {
            const texto = atual.join('\n').trim();
            // Trechos quase vazios (só "---" ou espaços) não ajudam a busca.
            if (texto.replace(/\s/g, '').length >= 20) trechos.push({ linha: inicio, pagina, texto });
            atual = [];
            tamanho = 0;
        };
        for (const [index, line] of lines.entries()) {
            // Uma linha maior que um trecho (um parágrafo inteiro do Obsidian)
            // vira vários trechos. Sem isso, o modelo de embeddings, que lê no
            // máximo ~512 tokens, ignoraria em silêncio o resto do parágrafo.
            // As outras linhas são agrupadas como sempre: os trechos delas não
            // mudam, e os índices já salvos continuam valendo.
            if (line.length > CHUNK_CHARS) {
                fechar();
                for (const pedaco of partirLinha(line)) {
                    inicio = index + 1;
                    atual = [pedaco];
                    fechar();
                }
                continue;
            }
            if (!atual.length) inicio = index + 1;
            tamanho += (atual.length ? 1 : 0) + line.length;
            atual.push(line);
            if (tamanho >= CHUNK_CHARS) fechar();
        }
        fechar();
    }
    return trechos;
}

// Corta uma linha longa em pedaços de até CHUNK_CHARS, de preferência no fim de
// uma frase; senão, no último espaço; e só no último caso no meio de uma palavra.
function partirLinha(line: string): string[] {
    const pedacos: string[] = [];
    let resto = line;
    while (resto.length > CHUNK_CHARS) {
        const janela = resto.slice(0, CHUNK_CHARS);
        const fimDeFrase = Math.max(janela.lastIndexOf('. '), janela.lastIndexOf('? '), janela.lastIndexOf('! '));
        let corte = fimDeFrase >= CHUNK_CHARS / 2 ? fimDeFrase + 1 : janela.lastIndexOf(' ');
        if (corte < CHUNK_CHARS / 2) corte = CHUNK_CHARS;
        pedacos.push(resto.slice(0, corte));
        resto = resto.slice(corte).trimStart();
    }
    if (resto) pedacos.push(resto);
    return pedacos;
}

// ----------------------------------------------------------------------------
// 6.4 — O ÍNDICE
// ----------------------------------------------------------------------------
// Fica em memória (Map) e em DATA_DIR/indice-semantico.json. Os vetores são
// salvos em base64 (Float32), bem menor que uma lista de números em JSON.
// O texto salvo já passou pelo PASSO 4.4: segredos chegam redigidos ao índice.
const indice = new Map<string, ArquivoIndexado>();
export const status = { estado: 'parado' as 'parado' | 'construindo' | 'pronto' | 'erro', feitos: 0, total: 0, erro: '' };
let construcao: Promise<void> | undefined;
let ultimaAtualizacao = 0;

// No arquivo do índice, cada vetor vira texto base64 (números de 4 bytes): fica
// várias vezes menor do que uma lista de números em JSON.
const toBase64 = (vetor: number[]) => Buffer.from(new Float32Array(vetor).buffer).toString('base64');
// Uma Float32Array só pode começar num endereço múltiplo de 4. O Node costuma
// alinhar os Buffers pequenos, mas não garante: fora do alinhamento, copia.
const fromBase64 = (texto: string) => {
    const bytes = Buffer.from(texto, 'base64');
    if (bytes.byteOffset % 4 === 0) return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    return new Float32Array(new Uint8Array(bytes).buffer);
};
// Vetores decodificados ficam em cache para a busca não converter tudo de novo.
const vetores = new Map<string, Float32Array[]>();

// Lê o índice salvo em DATA_DIR. Se ele for de outra versão ou de outro modelo,
// é ignorado e refeito, porque vetores de modelos diferentes não se comparam.
async function carregarIndice(): Promise<void> {
    try {
        const salvo = JSON.parse(await readFile(join(config.dataDir, INDEX_FILE), 'utf8'));
        if (salvo.versao !== INDEX_VERSION || salvo.modelo !== `${MODEL}@${MODEL_REVISION}`) return;
        for (const [arquivo, dados] of Object.entries<ArquivoIndexado>(salvo.arquivos)) indice.set(arquivo, dados);
    } catch {
        // Sem índice salvo (primeira vez) ou arquivo corrompido: começa do zero.
    }
}

// Grava o índice em DATA_DIR com permissão 600: ele contém trechos das suas
// anotações, então só o seu usuário do sistema deve ler.
// Gravação atômica (PASSO 3.10): outro processo nunca lê o índice pela metade.
async function salvarIndice(): Promise<void> {
    const dados = { versao: INDEX_VERSION, modelo: `${MODEL}@${MODEL_REVISION}`, arquivos: Object.fromEntries(indice) };
    await gravarAtomico(join(config.dataDir, INDEX_FILE), JSON.stringify(dados));
}

// Percorre os arquivos e processa só o que é novo ou mudou (data e tamanho).
// Roda em segundo plano: o servidor continua respondendo enquanto isso.
async function construirIndice(): Promise<void> {
    status.estado = 'construindo';
    if (!indice.size) await carregarIndice();
    const embed = await loadEmbedder();
    const arquivos = await listNoteFiles(config.notesDir, enabledTypes(SEMANTIC_TYPES));
    const existentes = new Set(arquivos.map(file => relative(config.notesDir, file)));
    // Arquivos apagados saem do índice.
    for (const arquivo of indice.keys()) {
        if (!existentes.has(arquivo)) { indice.delete(arquivo); vetores.delete(arquivo); }
    }
    status.total = arquivos.length;
    status.feitos = 0;
    let alterados = 0;
    // Vetor já calculado para cada texto: material de curso costuma ter cópias
    // (a mesma aula em duas pastas), e um texto idêntico gera o mesmo vetor.
    // Reaproveitar evita rodar o modelo de novo, que é a parte lenta.
    const porTexto = new Map<string, string>();
    for (const dados of indice.values()) for (const t of dados.trechos) porTexto.set(t.texto, t.vetor);
    for (const file of arquivos) {
        const arquivo = relative(config.notesDir, file);
        const info = await stat(file).catch(() => undefined);
        const anterior = indice.get(arquivo);
        if (info && !(anterior?.mtimeMs === info.mtimeMs && anterior.size === info.size)) {
            const sections = (await readSearchableLines(file).catch(() => []))
                .map(section => (section.pagina ? section : { ...section, lines: semFrontmatter(section.lines) }));
            const trechos = dividirEmTrechos(sections).map(t => {
                const { text, alertas } = prepareUntrusted(t.texto);
                return { ...t, texto: text, alertas };
            });
            // Só os textos ainda sem vetor passam pelo modelo, em lotes.
            const faltando = [...new Set(trechos.map(t => t.texto).filter(texto => !porTexto.has(texto)))];
            for (let i = 0; i < faltando.length; i += BATCH_SIZE) {
                const lote = faltando.slice(i, i + BATCH_SIZE);
                const vetoresLote = await embed(lote.map(texto => `passage: ${texto}`));
                lote.forEach((texto, j) => porTexto.set(texto, toBase64(vetoresLote[j])));
            }
            const novos = trechos.map(t => ({ ...t, vetor: porTexto.get(t.texto)! }));
            indice.set(arquivo, { mtimeMs: info.mtimeMs, size: info.size, trechos: novos });
            vetores.delete(arquivo);
            // Salva de tempos em tempos: se o servidor for encerrado no meio, o
            // trabalho já feito não se perde.
            if (++alterados % 50 === 0) await salvarIndice();
        }
        status.feitos++;
    }
    if (alterados) await salvarIndice();
    status.estado = 'pronto';
    ultimaAtualizacao = Date.now();
    console.error(`Índice semântico pronto: ${indice.size} arquivo(s), ${alterados} processado(s) agora`);
}

// Inicia (ou reaproveita) a construção. Erros ficam no status, sem derrubar o
// servidor; a próxima tentativa só vem depois de REFRESH_MS (ex.: a internet
// voltou para baixar o modelo), senão cada busca recomeçaria e esconderia o erro.
export function atualizarIndice(): Promise<void> {
    construcao ??= construirIndice()
        .catch(error => {
            status.estado = 'erro';
            status.erro = error instanceof Error ? error.message : String(error);
            ultimaAtualizacao = Date.now();
            console.error('Falha no índice semântico:', status.erro);
        })
        .finally(() => { construcao = undefined; });
    return construcao;
}

// Uma foto do índice para o resource estudos://indice: dá para ver se ele está
// pronto, o progresso e o último erro sem precisar fazer uma busca. Sem vetores
// nem textos: só números.
export function estadoDoIndice() {
    let trechos = 0;
    for (const dados of indice.values()) trechos += dados.trechos.length;
    return {
        ligada: true,
        estado: status.estado,
        progresso: { feitos: status.feitos, total: status.total },
        arquivosNoIndice: indice.size,
        trechos,
        atualizadoEm: ultimaAtualizacao ? new Date(ultimaAtualizacao).toISOString() : null,
        ...(status.estado === 'erro' ? { erro: status.erro } : {}),
    };
}

// ----------------------------------------------------------------------------
// 6.5 — BUSCAR POR SIMILARIDADE
// ----------------------------------------------------------------------------
// Vetores normalizados: o produto escalar é a similaridade de cosseno
// (1 = mesmo sentido, perto de 0 = nada a ver).
export function similaridade(a: ArrayLike<number>, b: ArrayLike<number>): number {
    // Vetores de tamanhos diferentes (índice de outro modelo, arquivo meio
    // gravado) dariam NaN e embaralhariam a ordem em silêncio: contam como 0.
    if (a.length !== b.length) return 0;
    let soma = 0;
    for (let i = 0; i < a.length; i++) soma += a[i] * b[i];
    return soma;
}

// Devolve os trechos mais parecidos com a pergunta, do mais para o menos parecido
// (passos a a d abaixo). Se o índice ainda está sendo montado, responde com o que
// já existe e um aviso.
export async function semanticSearch(pergunta: string, modulo?: string, tipos?: Tipo[]): Promise<{ resultados: ResultadoSemantico[]; aviso?: string }> {
    // Passo a): mantém o índice em dia (em segundo plano, sem esperar).
    if (status.estado !== 'construindo' && Date.now() - ultimaAtualizacao > REFRESH_MS) void atualizarIndice();
    if (status.estado === 'erro' && !indice.size) throw new Error(`Busca semântica indisponível: ${status.erro}`);
    // Antes de listar os arquivos o total ainda é 0: "0 de 0" confundiria.
    const progresso = status.total ? `${status.feitos} de ${status.total} arquivos` : 'preparando';
    const aviso = status.estado === 'construindo'
        ? `Índice semântico em construção (${progresso}): os resultados por significado podem estar incompletos`
        : undefined;
    if (!indice.size) return { resultados: [], aviso };

    // Passo b): filtros. O módulo passa pela checagem de caminho do PASSO 3.9.
    const prefixo = modulo ? relative(config.notesDir, await resolveInsideNotes(modulo)) + sep : '';
    const permitidos = enabledTypes(tipos?.length ? tipos : SEMANTIC_TYPES).filter(t => SEMANTIC_TYPES.includes(t));
    // O índice só tira arquivos excluídos na próxima atualização (até 5 min);
    // conferir aqui faz o .studynotesignore valer na hora.
    const excluido = await carregarExclusao();

    // Passo c): vetor da pergunta e comparação com cada trecho.
    const [vetorPergunta] = await (await loadEmbedder())([`query: ${pergunta}`]);
    const candidatos: ResultadoSemantico[] = [];
    for (const [arquivo, dados] of indice) {
        if (prefixo && !arquivo.startsWith(prefixo)) continue;
        if (!permitidos.includes(typeOf(arquivo)!) || excluido(arquivo)) continue;
        if (!vetores.has(arquivo)) vetores.set(arquivo, dados.trechos.map(t => fromBase64(t.vetor)));
        const vetoresArquivo = vetores.get(arquivo)!;
        dados.trechos.forEach((t, i) => candidatos.push({
            arquivo, linha: t.linha, pagina: t.pagina, alertas: t.alertas,
            // Texto inteiro por enquanto: o corte em 500 caracteres vem depois de
            // mascarar os segredos (passo e).
            trecho: t.texto,
            similaridade: Math.round(similaridade(vetorPergunta, vetoresArquivo[i]) * 1000) / 1000,
        }));
    }
    // Passo d): os mais parecidos primeiro, sem repetição. Material de curso
    // costuma ter cópias (a mesma aula em duas pastas): um texto idêntico entra
    // uma vez só, e cada arquivo ocupa no máximo 2 vagas.
    candidatos.sort((a, b) => b.similaridade - a.similaridade);
    const resultados: ResultadoSemantico[] = [];
    const textosVistos = new Set<string>();
    const porArquivo = new Map<string, number>();
    for (const candidato of candidatos) {
        const chave = candidato.trecho.replace(/\s+/g, ' ').trim();
        const usados = porArquivo.get(candidato.arquivo) ?? 0;
        if (textosVistos.has(chave) || usados >= MAX_SEMANTIC_PER_FILE) continue;
        textosVistos.add(chave);
        porArquivo.set(candidato.arquivo, usados + 1);
        resultados.push(candidato);
        if (resultados.length >= MAX_SEMANTIC_RESULTS) break;
    }
    // Passo e): mascara de novo os segredos, com os padrões atuais (o índice
    // salvo pode ter sido feito com padrões mais antigos), sobre o trecho
    // inteiro, e só então corta: só os primeiros 500 caracteres vão para o
    // modelo; o resto ele lê com ler_material, se precisar. Só os escolhidos
    // passam por aqui (no máximo MAX_SEMANTIC_RESULTS), não o índice todo.
    for (const resultado of resultados) {
        const { text, segredos } = redactSecrets(resultado.trecho);
        resultado.trecho = text.slice(0, 500);
        resultado.segredos = segredos;
    }
    return { resultados, aviso };
}

// ----------------------------------------------------------------------------
// 6.6 — BUSCA HÍBRIDA (usada pela tool buscar_material, PASSO 2.4)
// ----------------------------------------------------------------------------
// Por que juntar as duas buscas? Quem pergunta quer "achar isso no meu material";
// escolher entre literal e semântica é detalhe de implementação. Cada uma erra
// onde a outra acerta:
//   literal    → acha nomes exatos (registerTool, OPENAI_API_KEY), não entende sinônimos
//   semântica  → acha o assunto com outras palavras, mas ignora o nome exato
//
// A junção usa Reciprocal Rank Fusion (RRF): cada lista dá a cada resultado a
// pontuação 1 / (60 + posição), e as pontuações se somam. Não precisa comparar
// "similaridade 0.83" com "linha que contém o termo", que não têm a mesma escala.
export type Origem = 'literal' | 'significado' | 'ambas';
export type ResultadoHibrido = Resultado & { origem: Origem; similaridade?: number };

// 60 é o valor clássico do RRF: amortece a diferença entre o 1º e o 5º lugar.
const RRF_K = 60;
const MAX_HYBRID_RESULTS = 20;
const MAX_HYBRID_PER_FILE = 3;

// Função pura (sem arquivos nem modelo): é testada sozinha.
export function fundir(literais: Resultado[], semanticos: ResultadoSemantico[]): ResultadoHibrido[] {
    // Pontos de quem ficou na posição N de uma lista: 1º lugar vale 1/61, 2º vale 1/62...
    const pontos = (posicao: number) => 1 / (RRF_K + posicao);
    // Onde duas buscas concordam (mesmo arquivo e mesma página), o resultado sobe.
    const lugar = (r: Resultado) => `${r.arquivo}|${r.pagina ?? ''}`;
    const melhorPosicao = (lista: Resultado[]) => {
        const mapa = new Map<string, number>();
        lista.forEach((r, i) => { if (!mapa.has(lugar(r))) mapa.set(lugar(r), i + 1); });
        return mapa;
    };
    const naLiteral = melhorPosicao(literais);
    const naSemantica = melhorPosicao(semanticos);
    // Bônus: os pontos que o mesmo arquivo/página fez na OUTRA busca (0 se ela não achou).
    const bonus = (r: Resultado, outra: Map<string, number>) => outra.has(lugar(r)) ? pontos(outra.get(lugar(r))!) : 0;

    // A chave inclui a linha: o mesmo trecho achado pelas duas buscas vira um só.
    const itens = new Map<string, { resultado: ResultadoHibrido; nota: number }>();
    literais.forEach((r, i) => {
        itens.set(`${lugar(r)}|${r.linha}`, { resultado: { ...r, origem: 'literal' }, nota: pontos(i + 1) + bonus(r, naSemantica) });
    });
    semanticos.forEach((r, i) => {
        const chave = `${lugar(r)}|${r.linha}`;
        const existente = itens.get(chave);
        // Dois pedaços da mesma linha longa têm a mesma chave: o primeiro (mais
        // bem colocado) fica, e o segundo não é "achado pelas duas buscas".
        if (existente?.resultado.origem === 'significado') return;
        if (existente) {
            existente.resultado.origem = 'ambas';
            existente.resultado.similaridade = r.similaridade;
        } else {
            itens.set(chave, { resultado: { ...r, origem: 'significado' }, nota: pontos(i + 1) + bonus(r, naLiteral) });
        }
    });

    // Maior nota primeiro; no empate, a ordem de inserção (literal antes). Depois
    // aplica o limite por arquivo, para um arquivo só não ocupar a lista inteira.
    const ordenados = [...itens.values()].sort((a, b) => b.nota - a.nota);
    const porArquivo = new Map<string, number>();
    const resultados: ResultadoHibrido[] = [];
    for (const { resultado } of ordenados) {
        const usados = porArquivo.get(resultado.arquivo) ?? 0;
        if (usados >= MAX_HYBRID_PER_FILE) continue;
        porArquivo.set(resultado.arquivo, usados + 1);
        resultados.push(resultado);
        if (resultados.length >= MAX_HYBRID_RESULTS) break;
    }
    return resultados;
}

// A busca literal sempre roda. A semântica só entra com SEMANTIC_SEARCH=true e,
// se falhar (biblioteca ausente, sem internet para baixar o modelo), a busca não
// quebra: devolve o resultado literal com um aviso do que faltou.
export async function buscaHibrida(consulta: string, modulo?: string, tipos?: Tipo[]): Promise<{ resultados: ResultadoHibrido[]; aviso?: string }> {
    const literais = await searchNotes(consulta, modulo, tipos);
    const soLiteral = (aviso?: string) => ({ resultados: literais.map((r): ResultadoHibrido => ({ ...r, origem: 'literal' })), aviso });
    if (!config.semanticSearch) return soLiteral();
    // Código só tem busca literal: pedir só 'codigo' dispensa a semântica.
    const tiposSemanticos = (tipos?.length ? tipos : SEMANTIC_TYPES).filter(t => SEMANTIC_TYPES.includes(t));
    if (!tiposSemanticos.length) return soLiteral();
    try {
        const { resultados: semanticos, aviso } = await semanticSearch(consulta, modulo, tiposSemanticos);
        return { resultados: fundir(literais, semanticos), aviso };
    } catch (error) {
        // O motivo vai dentro de um resultado de sucesso, sem passar pelo
        // errorResult: a mensagem pode trazer o caminho de MODELS_DIR.
        const motivo = semCaminhos(error instanceof Error ? error.message : String(error));
        return soLiteral(`A busca por significado não está disponível e só a literal foi usada. ${motivo}`);
    }
}
