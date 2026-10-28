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
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
    config, enabledTypes, listNoteFiles, readSearchableLines, resolveInsideNotes,
    typeOf, type Resultado, type Tipo,
} from './service.ts';
import { prepareUntrusted } from './safety.ts';

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

function loadEmbedder(): Promise<Embedder> {
    embedderPromise ??= (async () => {
        const { pipeline, env } = await import('@huggingface/transformers').catch(() => {
            throw new Error('Biblioteca @huggingface/transformers não instalada. Com npx, acrescente "--package=@huggingface/transformers@4.3.1" nos args (veja "Busca por significado" no README); a partir do código-fonte, rode "npm install".');
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
        let inicio = 1;
        const fechar = () => {
            const texto = atual.join('\n').trim();
            // Trechos quase vazios (só "---" ou espaços) não ajudam a busca.
            if (texto.replace(/\s/g, '').length >= 20) trechos.push({ linha: inicio, pagina, texto });
            atual = [];
        };
        for (const [index, line] of lines.entries()) {
            if (!atual.length) inicio = index + 1;
            atual.push(line);
            if (atual.join('\n').length >= CHUNK_CHARS) fechar();
        }
        fechar();
    }
    return trechos;
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

const toBase64 = (vetor: number[]) => Buffer.from(new Float32Array(vetor).buffer).toString('base64');
const fromBase64 = (texto: string) => {
    const bytes = Buffer.from(texto, 'base64');
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
};
// Vetores decodificados ficam em cache para a busca não converter tudo de novo.
const vetores = new Map<string, Float32Array[]>();

async function carregarIndice(): Promise<void> {
    try {
        const salvo = JSON.parse(await readFile(join(config.dataDir, INDEX_FILE), 'utf8'));
        if (salvo.versao !== INDEX_VERSION || salvo.modelo !== `${MODEL}@${MODEL_REVISION}`) return;
        for (const [arquivo, dados] of Object.entries<ArquivoIndexado>(salvo.arquivos)) indice.set(arquivo, dados);
    } catch {
        // Sem índice salvo (primeira vez) ou arquivo corrompido: começa do zero.
    }
}

async function salvarIndice(): Promise<void> {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    const dados = { versao: INDEX_VERSION, modelo: `${MODEL}@${MODEL_REVISION}`, arquivos: Object.fromEntries(indice) };
    await writeFile(join(config.dataDir, INDEX_FILE), JSON.stringify(dados), { mode: 0o600 });
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
    for (const file of arquivos) {
        const arquivo = relative(config.notesDir, file);
        const info = await stat(file).catch(() => undefined);
        const anterior = indice.get(arquivo);
        if (info && !(anterior?.mtimeMs === info.mtimeMs && anterior.size === info.size)) {
            const sections = await readSearchableLines(file).catch(() => []);
            const trechos = dividirEmTrechos(sections).map(t => {
                const { text, alertas } = prepareUntrusted(t.texto);
                return { ...t, texto: text, alertas };
            });
            const novos: ArquivoIndexado['trechos'] = [];
            for (let i = 0; i < trechos.length; i += BATCH_SIZE) {
                const lote = trechos.slice(i, i + BATCH_SIZE);
                const vetoresLote = await embed(lote.map(t => `passage: ${t.texto}`));
                lote.forEach((t, j) => novos.push({ ...t, vetor: toBase64(vetoresLote[j]) }));
            }
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

// ----------------------------------------------------------------------------
// 6.5 — BUSCAR POR SIMILARIDADE
// ----------------------------------------------------------------------------
// Vetores normalizados: o produto escalar é a similaridade de cosseno
// (1 = mesmo sentido, perto de 0 = nada a ver).
export function similaridade(a: ArrayLike<number>, b: ArrayLike<number>): number {
    let soma = 0;
    for (let i = 0; i < a.length; i++) soma += a[i] * b[i];
    return soma;
}

export async function semanticSearch(pergunta: string, modulo?: string, tipos?: Tipo[]): Promise<{ resultados: ResultadoSemantico[]; aviso?: string }> {
    // Passo a): mantém o índice em dia (em segundo plano, sem esperar).
    if (status.estado !== 'construindo' && Date.now() - ultimaAtualizacao > REFRESH_MS) void atualizarIndice();
    if (status.estado === 'erro' && !indice.size) throw new Error(`Busca semântica indisponível: ${status.erro}`);
    const aviso = status.estado === 'construindo'
        ? `Índice semântico em construção (${status.feitos} de ${status.total} arquivos): os resultados podem estar incompletos. Use buscar_anotacao enquanto isso.`
        : undefined;
    if (!indice.size) return { resultados: [], aviso };

    // Passo b): filtros. O módulo passa pela checagem de caminho do PASSO 3.9.
    const prefixo = modulo ? relative(config.notesDir, await resolveInsideNotes(modulo)) + sep : '';
    const permitidos = enabledTypes(tipos?.length ? tipos : SEMANTIC_TYPES).filter(t => SEMANTIC_TYPES.includes(t));

    // Passo c): vetor da pergunta e comparação com cada trecho.
    const [vetorPergunta] = await (await loadEmbedder())([`query: ${pergunta}`]);
    const candidatos: ResultadoSemantico[] = [];
    for (const [arquivo, dados] of indice) {
        if (prefixo && !arquivo.startsWith(prefixo)) continue;
        if (!permitidos.includes(typeOf(arquivo)!)) continue;
        if (!vetores.has(arquivo)) vetores.set(arquivo, dados.trechos.map(t => fromBase64(t.vetor)));
        const vetoresArquivo = vetores.get(arquivo)!;
        dados.trechos.forEach((t, i) => candidatos.push({
            arquivo, linha: t.linha, pagina: t.pagina, alertas: t.alertas,
            // Só os primeiros 500 caracteres vão para o modelo; o resto ele lê
            // com ler_anotacao, se precisar.
            trecho: t.texto.slice(0, 500),
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
    return { resultados, aviso };
}
