/**
 * ============================================================================
 * PASSO 3 — AS REGRAS: ARQUIVOS, BUSCA, PDFs E DADOS SALVOS
 * ============================================================================
 *
 * Este arquivo é a "lógica de negócio". Ele não sabe nada de MCP: são funções
 * comuns de Node.js, chamadas pelas tools do PASSO 2. Separar assim deixa o
 * código mais fácil de testar e de reaproveitar.
 *
 * Tudo aqui é determinístico: a mesma pergunta sobre os mesmos arquivos dá
 * sempre a mesma resposta. Não há LLM nem acesso à internet (a busca semântica
 * opcional, que baixa um modelo uma vez, fica separada no PASSO 6).
 *
 * Mapa deste arquivo:
 *   3.1  tipos de arquivo (o que pode ser lido)
 *   3.2  limites e configuração (variáveis de ambiente)
 *   3.3  filtros (arquivos e pastas bloqueados, e o .studynotesignore)
 *   3.4  PDFs: extração de texto com cache e intervalo de páginas
 *   3.5  varredura das pastas e lista de módulos
 *   3.6  busca (searchNotes) — usada pela tool buscar_material
 *   3.7  leitura (readNote) — usada pela tool ler_material
 *   3.8  leitura de PDF por páginas
 *   3.9  segurança de caminhos (não sair da pasta de anotações)
 *   3.10 dados salvos: dúvidas e progresso (JSON em DATA_DIR)
 *   3.11 formato do Obsidian: [[links]] e cabeçalho (frontmatter)
 *
 * A busca semântica (opcional) fica separada, no PASSO 6 (semantic.ts).
 */
import { readdir, readFile, writeFile, mkdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
// unpdf: extrai o texto de PDFs usando o pdf.js da Mozilla, sem dependências nativas.
import { extractText, getDocumentProxy } from 'unpdf';
// Proteções aplicadas a todo texto que sai daqui (PASSO 4).
import { prepareUntrusted, sanitizeText } from './safety.ts';

// ----------------------------------------------------------------------------
// 3.1 — TIPOS DE ARQUIVO
// ----------------------------------------------------------------------------
// Lista fechada por tipo: .env, .json, chaves etc. nunca são lidos
// "Lista fechada" (allowlist) é mais segura que "lista de proibidos": qualquer
// extensão que não esteja aqui é recusada, inclusive as que ninguém previu.
const FILE_TYPES = {
    anotacoes: ['.md', '.txt'],
    codigo: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'],
    pdf: ['.pdf'],
} as const;
// Tipo = 'anotacoes' | 'codigo' | 'pdf', derivado das chaves acima.
export type Tipo = keyof typeof FILE_TYPES;
export const TIPOS = Object.keys(FILE_TYPES) as Tipo[];

// ----------------------------------------------------------------------------
// 3.2 — LIMITES E CONFIGURAÇÃO
// ----------------------------------------------------------------------------
// Pastas que nunca são percorridas: dependências, builds e ambientes virtuais
// (muito arquivo, nenhum conteúdo de estudo).
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', 'venv']);
// Limites que controlam quanto texto vai para o modelo (e quantos tokens gasta).
const MAX_RESULTS = 20;
// No máximo 3 resultados por arquivo: um arquivo que repete o termo 50 vezes
// não ocupa sozinho os 20 resultados.
const MAX_RESULTS_PER_FILE = 3;
// Desempate da busca literal (a pontuação vem antes): suas anotações primeiro,
// depois PDFs, por último o código (que costuma repetir os mesmos termos).
const TYPE_PRIORITY: Tipo[] = ['anotacoes', 'pdf', 'codigo'];
const MAX_FILE_BYTES = 200_000;
const MAX_PDF_BYTES = 30_000_000;
export const MAX_PDF_PAGES_PER_READ = 5;

// Configuração lida das variáveis de ambiente, definidas no bloco "env" do
// mcp.json (ou num .env — veja o .env.example). resolve() transforma em
// caminho absoluto, que é o que as checagens do 3.9 comparam.
const dataDir = resolve(process.env.DATA_DIR ?? join(homedir(), '.study-notes-mcp'));
export const config = {
    notesDir: resolve(process.env.NOTES_DIR ?? join(homedir(), 'Documents')),
    dataDir,
    // PDFs ficam ligados, a menos que INCLUDE_PDF seja exatamente "false".
    includePdf: process.env.INCLUDE_PDF !== 'false',
    // Busca semântica (PASSO 6) fica DESLIGADA, a menos que seja exatamente "true".
    semanticSearch: process.env.SEMANTIC_SEARCH === 'true',
    // Onde o modelo de embeddings é guardado depois do download (~310 MB, uma vez só).
    modelsDir: resolve(process.env.MODELS_DIR ?? join(dataDir, 'modelos')),
};

// Mensagens de erro do sistema trazem o caminho absoluto, com o nome do seu
// usuário (/Users/fulano/...). Tudo que vai para o modelo, que roda na nuvem,
// passa por aqui: as pastas configuradas viram rótulos e a pasta pessoal vira ~.
// Os caminhos "reais" também entram (no Mac, /var/... às vezes aparece como
// /private/var/...), e os mais longos são trocados primeiro.
export function semCaminhos(texto: string): string {
    const pastas: [string, string][] = [
        [config.notesDir, '<NOTES_DIR>'], [config.dataDir, '<DATA_DIR>'],
        [config.modelsDir, '<MODELS_DIR>'], [homedir(), '~'],
    ];
    // Caminhos curtos demais ("/" como pasta pessoal num contêiner) trocariam
    // toda barra da mensagem; ficam de fora.
    const trocas = pastas.filter(([pasta]) => pasta.length > 3).flatMap(([pasta, rotulo]) => {
        let real = pasta;
        try { real = realpathSync(pasta); } catch { /* pasta que ainda não existe */ }
        return real === pasta ? [[pasta, rotulo]] : [[pasta, rotulo], [real, rotulo]];
    });
    return trocas
        .sort((a, b) => b[0].length - a[0].length)
        .reduce((acc, [pasta, rotulo]) => acc.replaceAll(pasta, rotulo), texto);
}

// Formatos dos dados que circulam entre as funções.
export type Duvida = { modulo: string; texto: string; criadaEm: string; resolvida: boolean };
// "numero" é a posição na lista (1, 2, 3...). Dúvidas nunca são apagadas, só
// marcadas como resolvidas, então o número de cada uma não muda.
export type DuvidaNumerada = Duvida & { numero: number };
export type Progresso = Record<string, string[]>;
// segredos: quantos foram mascarados no trecho (PASSO 4.2), para o aviso 🔒.
export type Resultado = { arquivo: string; linha: number; pagina?: number; trecho: string; alertas: string[]; segredos?: number };

// ----------------------------------------------------------------------------
// 3.3 — FILTROS
// ----------------------------------------------------------------------------
// Tipos pedidos (ou todos), sem PDF quando INCLUDE_PDF=false
export function enabledTypes(tipos?: Tipo[]): Tipo[] {
    return (tipos?.length ? tipos : TIPOS).filter(tipo => tipo !== 'pdf' || config.includePdf);
}

// Descobre o tipo pela extensão (".PDF" e ".pdf" valem igual). undefined = não permitido.
export function typeOf(name: string): Tipo | undefined {
    const ext = extname(name).toLowerCase();
    return TIPOS.find(tipo => (FILE_TYPES[tipo] as readonly string[]).includes(ext));
}

// Nomes ocultos (começam com ".", como .env e .git) ou pastas ignoradas.
function isBlockedName(name: string): boolean {
    return name.startsWith('.') || IGNORED_DIRS.has(name);
}

// Um arquivo é permitido se não for bloqueado E for de um dos tipos ativos.
function isAllowedFile(name: string, tipos = enabledTypes()): boolean {
    const tipo = typeOf(name);
    return !isBlockedName(name) && tipo !== undefined && tipos.includes(tipo);
}

// .studynotesignore: arquivo opcional na raiz de NOTES_DIR, no estilo do
// .gitignore, com o que o servidor deve ignorar (uma cópia repetida do curso,
// arquivos gerados, uma pasta pessoal). O que casar some das duas buscas, da
// leitura e da lista de módulos. Um padrão por linha:
//   # comentário      linhas em branco e começadas com # não contam
//   tasks.md          sem "/": casa com o nome em qualquer pasta
//   curso-main/       "/" no fim: só pastas
//   curso-main/mod0[1-6]*/   "/" no meio: caminho a partir da raiz de NOTES_DIR
//   *  ?  [abc]       qualquer coisa (menos "/"), um caractere, um da lista
//   **                qualquer coisa, inclusive "/" (ex.: **/rascunhos/)
// Exceções com "!" não são aceitas: a linha é descartada.
const IGNORE_FILE = '.studynotesignore';
type Padrao = { regex: RegExp; soPastas: boolean; ancorado: boolean };
export type Exclusao = (relativo: string, ehPasta?: boolean) => boolean;

// Converte um padrão (glob) numa expressão regular que casa com o texto inteiro.
function globParaRegex(glob: string): RegExp {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') {
            // "**/" também casa com nenhuma pasta: "**/x" pega "x" na raiz.
            if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i++; }
        } else if (c === '*') re += '[^/]*';
        else if (c === '?') re += '[^/]';
        else if (c === '[' && glob.indexOf(']', i + 2) > i) {
            const fim = glob.indexOf(']', i + 2);
            re += `[${glob.slice(i + 1, fim).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
            i = fim;
        } else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${re}$`);
}

// Lê o conteúdo do .studynotesignore e devolve os padrões válidos.
export function lerPadroes(conteudo: string): Padrao[] {
    return conteudo.split(/\r?\n/)
        .map(linha => linha.trim())
        .filter(linha => linha && !linha.startsWith('#') && !linha.startsWith('!'))
        .map(linha => {
            const soPastas = linha.endsWith('/');
            const padrao = linha.replace(/\/+$/, '');
            return { regex: globParaRegex(padrao.replace(/^\//, '')), soPastas, ancorado: padrao.includes('/') };
        });
}

// O arquivo é relido só quando muda (mtimeMs): editar o .studynotesignore vale
// na próxima busca, sem reiniciar o servidor.
let ignorados: { mtimeMs: number; padroes: Padrao[] } | undefined;
// Sem .studynotesignore, nenhum padrão: nada é excluído além das regras do 3.3.
async function carregarPadroes(): Promise<Padrao[]> {
    const arquivo = join(config.notesDir, IGNORE_FILE);
    const info = await stat(arquivo).catch(() => undefined);
    if (!info?.isFile()) { ignorados = undefined; return []; }
    if (ignorados?.mtimeMs !== info.mtimeMs) {
        const conteudo = await readFile(arquivo, 'utf8');
        ignorados = { mtimeMs: info.mtimeMs, padroes: lerPadroes(conteudo) };
        console.error(`${IGNORE_FILE}: ${ignorados.padroes.length} padrão(ões) de exclusão`);
        // Quem vem do .gitignore usa "!" para exceções; aqui elas são descartadas,
        // e sem aviso a pessoa concluiria que o arquivo não funciona.
        const excecoes = conteudo.split(/\r?\n/).filter(linha => linha.trim().startsWith('!')).length;
        if (excecoes) console.error(`${IGNORE_FILE}: ${excecoes} linha(s) com "!" ignorada(s): exceções não são aceitas`);
    }
    return ignorados.padroes;
}

// Devolve a função que diz se um caminho (relativo a NOTES_DIR) está excluído.
// Confere o caminho e cada pasta acima dele: ignorar "curso-main/" exclui tudo
// que está dentro.
export async function carregarExclusao(): Promise<Exclusao> {
    const padroes = await carregarPadroes();
    return (relativo, ehPasta = false) => {
        if (!padroes.length) return false;
        const partes = relativo.split(sep).join('/').split('/');
        return partes.some((nome, i) => {
            const caminho = partes.slice(0, i + 1).join('/');
            const pasta = i < partes.length - 1 || ehPasta;
            return padroes.some(p => (!p.soPastas || pasta) && p.regex.test(p.ancorado ? caminho : nome));
        });
    };
}

// ----------------------------------------------------------------------------
// 3.4 — PDFs: EXTRAÇÃO COM CACHE
// ----------------------------------------------------------------------------
// Texto por página; extraído uma vez e reaproveitado enquanto o arquivo não mudar
// (mesma data de modificação e mesmo tamanho). Extrair é a parte lenta: num
// material com 57 PDFs, ~0,8 s a cada servidor novo, e o VS Code inicia um
// servidor por conversa. Por isso o texto também fica salvo em
// DATA_DIR/cache-pdf.json, e a primeira busca de cada conversa o reaproveita.
// Em memória a chave é o caminho completo; no disco, o caminho relativo a
// NOTES_DIR (o arquivo salvo não leva o nome do seu usuário).
type PdfExtraido = { mtimeMs: number; size: number; pages: string[] };
const pdfCache = new Map<string, PdfExtraido>();
const PDF_CACHE_FILE = 'cache-pdf.json';
// Sobe quando a forma de extrair mudar: um cache de outra versão é ignorado.
const PDF_CACHE_VERSION = 1;
let cacheEmDisco: Promise<void> | undefined;
let gravacaoAgendada: ReturnType<typeof setTimeout> | undefined;

// Lê o cache salvo uma vez por processo. Sem arquivo (primeira vez), de outra
// versão ou corrompido: começa vazio, e os PDFs são extraídos de novo.
function carregarCachePdf(): Promise<void> {
    cacheEmDisco ??= (async () => {
        try {
            const salvo = JSON.parse(await readFile(join(config.dataDir, PDF_CACHE_FILE), 'utf8'));
            if (salvo?.versao !== PDF_CACHE_VERSION) return;
            for (const [arquivo, dados] of Object.entries<PdfExtraido>(salvo.arquivos ?? {})) {
                const file = join(config.notesDir, arquivo);
                if (isInside(config.notesDir, file) && Array.isArray(dados?.pages) && !pdfCache.has(file)) pdfCache.set(file, dados);
            }
        } catch {
            // Sem cache salvo: segue sem ele.
        }
    })();
    return cacheEmDisco;
}

// Grava o cache um segundo depois da última extração: uma busca que extrai 50
// PDFs grava uma vez só. unref: o temporizador não segura o servidor aberto.
// PDFs apagados saem do cache aqui. Falhar ao gravar não atrapalha a busca.
function agendarGravacaoCachePdf(): void {
    if (gravacaoAgendada) return;
    gravacaoAgendada = setTimeout(async () => {
        gravacaoAgendada = undefined;
        try {
            const arquivos: Record<string, PdfExtraido> = {};
            for (const [file, dados] of pdfCache) {
                if (!isInside(config.notesDir, file)) continue;
                if (!(await stat(file).catch(() => undefined))) { pdfCache.delete(file); continue; }
                arquivos[relative(config.notesDir, file)] = dados;
            }
            await gravarAtomico(join(config.dataDir, PDF_CACHE_FILE), JSON.stringify({ versao: PDF_CACHE_VERSION, arquivos }));
        } catch (error) {
            console.error('Não foi possível salvar o cache de PDFs:', semCaminhos(error instanceof Error ? error.message : String(error)));
        }
    }, 1000);
    gravacaoAgendada.unref();
}

// Texto de cada página do PDF. Usa o cache enquanto o arquivo não mudar e recusa
// PDFs grandes demais (limite MAX_PDF_BYTES).
async function readPdfPages(file: string): Promise<string[]> {
    const info = await stat(file);
    if (info.size > MAX_PDF_BYTES) throw new Error(`PDF grande demais (${info.size} bytes, limite ${MAX_PDF_BYTES})`);
    await carregarCachePdf();
    const cached = pdfCache.get(file);
    if (cached?.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.pages;

    // verbosity 0: o pdf.js não pode escrever avisos no stdout, que é o canal do MCP
    // (ver PASSO 1.1: qualquer texto extra no stdout corrompe o protocolo).
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)), { verbosity: 0 });
    try {
        // mergePages: false → um texto por página, para podermos citar "p. N".
        const { text } = await extractText(pdf, { mergePages: false });
        pdfCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, pages: text });
        agendarGravacaoCachePdf();
        return text;
    } finally {
        // Libera a memória do documento, mesmo se a extração falhar.
        await pdf.cleanup();
    }
}

// "5" ou "5-8" → [início, fim], validado contra o total de páginas
// Sem "paginas", devolve as primeiras MAX_PDF_PAGES_PER_READ páginas.
export function parsePageRange(paginas: string | undefined, total: number): [number, number] {
    if (!paginas) return [1, Math.min(total, MAX_PDF_PAGES_PER_READ)];
    // "5" vira [5, 5]; "5-8" vira [5, 8].
    const [start, end = start] = paginas.split('-').map(Number);
    // Number("abc") é NaN, e NaN escaparia das comparações abaixo: sem esta
    // checagem, uma chamada direta com texto inválido devolveria uma leitura vazia.
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > total) {
        throw new Error(`Páginas inválidas: ${paginas}. O PDF tem ${total} página(s).`);
    }
    // Limite de páginas por leitura: controla quantos tokens vão para o modelo.
    if (end - start + 1 > MAX_PDF_PAGES_PER_READ) {
        throw new Error(`Máximo de ${MAX_PDF_PAGES_PER_READ} páginas por leitura (pedido: ${paginas}).`);
    }
    return [start, end];
}

// true se "target" é a própria "base" ou está dentro dela. O "+ sep" evita que
// "/notas-falsas" passe por estar "dentro" de "/notas" só por começar igual.
function isInside(base: string, target: string): boolean {
    return target === base || target.startsWith(base + sep);
}

// ----------------------------------------------------------------------------
// 3.5 — VARREDURA DAS PASTAS E MÓDULOS
// ----------------------------------------------------------------------------
// Lista os arquivos permitidos; symlinks são ignorados (não são nem arquivo nem pasta para o Dirent)
// É recursiva: para cada subpasta, chama a si mesma. Pastas bloqueadas (3.3)
// são puladas inteiras, sem nem entrar nelas.
export async function listNoteFiles(dir: string, tipos: Tipo[]): Promise<string[]> {
    return percorrer(dir, tipos, await carregarExclusao(), true);
}

// Uma subpasta ilegível (sem permissão, ponto de montagem, placeholder do
// iCloud/OneDrive) é pulada, em vez de derrubar a busca inteira: com NOTES_DIR
// em ~/Documents, isso é comum. O aviso vai para o stderr (nunca o stdout, que
// é o canal do MCP), uma vez por pasta, para não repetir a cada busca.
const pastasIgnoradas = new Set<string>();
function avisarPastaIgnorada(dir: string, error: unknown): void {
    const relativo = relative(config.notesDir, dir);
    if (pastasIgnoradas.has(relativo)) return;
    pastasIgnoradas.add(relativo);
    console.error(`Pasta ignorada (${(error as NodeJS.ErrnoException)?.code ?? 'erro'}): ${relativo}`);
}

// A varredura em si: a regra de exclusão é carregada uma vez em listNoteFiles e
// passada adiante, em vez de ser relida em cada subpasta.
// "raiz" é a pasta onde a varredura começa (NOTES_DIR ou o módulo pedido): se
// ela for ilegível, o erro sobe, porque devolver "nada encontrado" enganaria.
async function percorrer(dir: string, tipos: Tipo[], excluido: Exclusao, raiz = false): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(error => {
        if (raiz) throw error;
        avisarPastaIgnorada(dir, error);
        return [];
    });
    const files: string[] = [];
    for (const entry of entries) {
        if (isBlockedName(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        // Pastas excluídas pelo .studynotesignore são puladas inteiras, como as bloqueadas.
        if (excluido(relative(config.notesDir, fullPath), entry.isDirectory())) continue;
        if (entry.isDirectory()) files.push(...await percorrer(fullPath, tipos, excluido));
        else if (entry.isFile() && isAllowedFile(entry.name, tipos)) files.push(fullPath);
    }
    return files;
}

// Linhas de um arquivo; PDFs vêm página a página
// Normaliza os dois formatos para a busca (3.6) tratar tudo igual: uma lista de
// seções, cada uma com suas linhas (e a página, quando é PDF).
export async function readSearchableLines(file: string): Promise<{ pagina?: number; lines: string[] }[]> {
    if (typeOf(file) === 'pdf') {
        const pages = await readPdfPages(file);
        return pages.map((text, index) => ({ pagina: index + 1, lines: text.split('\n') }));
    }
    // Arquivos de texto grandes demais são pulados na busca.
    if ((await stat(file)).size > MAX_FILE_BYTES) return [];
    return [{ lines: (await readFile(file, 'utf8')).split('\n') }];
}

// Pastas que têm pelo menos um arquivo que o servidor lê, em qualquer nível
// abaixo delas. Uma pasta só com .json ou .sh não serve para buscar nem para
// quiz, então não aparece como módulo nem nas sugestões.
// Fica em cache por 10 s: o autocompletar chama isto a cada tecla digitada.
const CACHE_PASTAS_MS = 10_000;
let cachePastas: { quando: number; pastas: Set<string> } | undefined;
export async function pastasComMaterial(): Promise<Set<string>> {
    if (cachePastas && Date.now() - cachePastas.quando < CACHE_PASTAS_MS) return cachePastas.pastas;
    const pastas = new Set<string>();
    for (const file of await listNoteFiles(config.notesDir, enabledTypes())) {
        const partes = relative(config.notesDir, file).split(sep);
        for (let i = 1; i < partes.length; i++) pastas.add(partes.slice(0, i).join(sep));
    }
    cachePastas = { quando: Date.now(), pastas };
    return pastas;
}

// Módulos = subpastas de primeiro nível de NOTES_DIR com material (em ordem alfabética).
export async function listModules(): Promise<string[]> {
    const entries = await readdir(config.notesDir, { withFileTypes: true });
    const excluido = await carregarExclusao();
    const comMaterial = await pastasComMaterial();
    return entries
        .filter(entry => entry.isDirectory() && !isBlockedName(entry.name) && !excluido(entry.name, true) && comMaterial.has(entry.name))
        .map(entry => entry.name)
        .sort();
}

// Nem todo material segue "uma pasta por módulo": um repositório de curso
// clonado vira UMA pasta de primeiro nível, com os módulos de verdade um nível
// abaixo (curso/modulo03-mcp). Por isso o quiz e a busca aceitam qualquer
// subpasta, e estas funções ajudam a achá-las.
const MAX_NIVEL_PASTAS = 3;
// Nomes que parecem módulo ou aula, usados por listar_modulos para apontar
// os módulos que estão dentro de uma pasta de primeiro nível.
const NOME_DE_MODULO = /^(m[oó]dulo|module|aula|lesson|unidade|semana|week)/i;

// Todas as pastas com material até MAX_NIVEL_PASTAS níveis, como caminhos
// relativos a NOTES_DIR (usado pelo autocompletar do gerar_quiz).
export async function listarPastas(): Promise<string[]> {
    const excluido = await carregarExclusao();
    const comMaterial = await pastasComMaterial();
    const pastas: string[] = [];
    async function descer(dir: string, nivel: number): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isDirectory() || isBlockedName(entry.name)) continue;
            const fullPath = join(dir, entry.name);
            const relativo = relative(config.notesDir, fullPath);
            if (excluido(relativo, true) || !comMaterial.has(relativo)) continue;
            pastas.push(relativo);
            if (nivel < MAX_NIVEL_PASTAS) await descer(fullPath, nivel + 1);
        }
    }
    await descer(config.notesDir, 1);
    return pastas.sort();
}

// Subpastas com nome de módulo dentro de um módulo de primeiro nível.
export async function listarSubmodulos(modulo: string): Promise<string[]> {
    const entries = await readdir(join(config.notesDir, modulo), { withFileTypes: true }).catch(() => []);
    const excluido = await carregarExclusao();
    const comMaterial = await pastasComMaterial();
    return entries
        .filter(entry => entry.isDirectory() && NOME_DE_MODULO.test(entry.name) && !isBlockedName(entry.name)
            && !excluido(join(modulo, entry.name), true) && comMaterial.has(join(modulo, entry.name)))
        .map(entry => entry.name)
        .sort();
}

// Forma comparável de um nome de pasta: sem acentos, maiúsculas, espaços e
// pontuação, e sem zeros à esquerda ("Módulo 03-MCP" → "modulo3mcp"). Assim
// "modulo 3", "modulo03" e "Módulo-3" caem no mesmo lugar.
function normalizarNome(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]/g, '').replace(/\d+/g, numero => String(Number(numero)));
}
const MAX_PASTAS_ENCONTRADAS = 10;

// Acha as pastas que o usuário quis dizer com um texto curto, para clientes
// sem autocompletar (no Claude Code, por exemplo, o argumento é digitado à mão):
//   caminho exato          → só ele ("curso/modulo03-mcp")
//   só um número ("3")     → pastas que começam com modulo/aula/unidade... 3
//   outro texto ("mcp")    → pastas cujo nome contém o texto
// As mais rasas vêm primeiro. Mais de uma = quem chamou pergunta ao usuário.
export async function encontrarPastas(texto: string): Promise<string[]> {
    const exata = await validarPasta(texto).catch(() => undefined);
    if (exata) {
        // A pasta existe, mas nada nela é lido: avisa já, em vez de o modelo buscar à toa.
        if (!(await pastasComMaterial()).has(exata)) {
            throw new Error(`A pasta "${exata}" não tem arquivos que o servidor lê (anotações .md e .txt, PDFs ou código). Escolha outra pasta.`);
        }
        return [exata];
    }
    const alvo = normalizarNome(texto);
    if (!alvo) return [];
    const comCaminho = /[\\/]/.test(texto);
    const casa = /^\d+$/.test(alvo)
        ? (pasta: string) => new RegExp(`^(modulo|module|aula|lesson|unidade|semana|week)${alvo}(\\D|$)`).test(normalizarNome(pasta.split(sep).at(-1)!))
        : (pasta: string) => normalizarNome(comCaminho ? pasta : pasta.split(sep).at(-1)!).includes(alvo);
    return (await listarPastas())
        .filter(casa)
        .sort((a, b) => a.split(sep).length - b.split(sep).length || a.localeCompare(b))
        .slice(0, MAX_PASTAS_ENCONTRADAS);
}

// Confere se "caminho" é uma pasta de estudo válida (existe, fica dentro de
// NOTES_DIR, não é oculta nem excluída) e devolve o caminho relativo. Usado
// pelo gerar_quiz: o argumento não pode virar um canal para texto arbitrário.
export async function validarPasta(caminho: string): Promise<string> {
    const fullPath = await resolveInsideNotes(caminho).catch(() => undefined);
    const info = fullPath ? await stat(fullPath).catch(() => undefined) : undefined;
    const relativo = fullPath ? relative(config.notesDir, fullPath) : '';
    if (!fullPath || !info?.isDirectory() || !relativo || relativo.split(sep).some(isBlockedName)
        || (await carregarExclusao())(relativo, true)) {
        throw new Error(`Módulo "${caminho}" não encontrado`);
    }
    return relativo;
}

// Forma de comparação da busca literal: minúsculas e sem acentos, para que
// "funcao" ache "função" (quem digita no chat raramente acentua). Linhas só com
// ASCII (a maioria, inclusive todo o código) pulam a normalização, que é a
// parte cara. Exportada para a janela e os testes usarem a mesma regra.
const NAO_ASCII = /[^\x00-\x7f]/;
export function paraComparar(texto: string): string {
    const minusculo = texto.toLowerCase();
    return NAO_ASCII.test(minusculo) ? minusculo.normalize('NFD').replace(/\p{M}/gu, '') : minusculo;
}

// Posição do termo (já em paraComparar) no texto ORIGINAL. A comparação é feita
// sem acentos, mas o trecho devolvido mantém os acentos: cada caractere do
// original vira 0, 1 ou mais caracteres comparáveis, e o mapa guarda de qual
// posição do original veio cada um.
function posicaoNoOriginal(texto: string, termo: string): number {
    if (!NAO_ASCII.test(texto)) return texto.toLowerCase().indexOf(termo);
    let comparavel = '';
    const origem: number[] = [];
    for (let i = 0; i < texto.length; ) {
        const caractere = String.fromCodePoint(texto.codePointAt(i)!);
        for (const unidade of paraComparar(caractere)) { comparavel += unidade; origem.push(i); }
        i += caractere.length;
    }
    const posicao = comparavel.indexOf(termo);
    return posicao < 0 ? -1 : origem[posicao];
}

// Até 200 caracteres por trecho, centrados no termo. Numa linha longa (um
// parágrafo do Obsidian costuma ser uma linha só), os primeiros 200 caracteres
// podem não conter o que foi buscado. "…" marca onde o trecho foi cortado.
const JANELA = 200;
export function janela(linha: string, termo: string): string {
    if (linha.length <= JANELA) return linha;
    const posicao = posicaoNoOriginal(linha, termo);
    let inicio = posicao < 0 ? 0 : Math.max(0, Math.min(posicao - Math.floor((JANELA - termo.length) / 2), linha.length - JANELA));
    let fim = Math.min(linha.length, inicio + JANELA);
    // Não corta um emoji (ou outro caractere de 2 unidades) ao meio.
    if (inicio > 0 && /[\uDC00-\uDFFF]/.test(linha[inicio])) inicio++;
    if (fim < linha.length && /[\uD800-\uDBFF]/.test(linha[fim - 1])) fim--;
    return `${inicio > 0 ? '…' : ''}${linha.slice(inicio, fim)}${fim < linha.length ? '…' : ''}`;
}

// ----------------------------------------------------------------------------
// 3.6 — BUSCA (usada pela tool buscar_material, PASSO 2.4)
// ----------------------------------------------------------------------------
// Pasta onde buscar ou listar: o módulo pedido (dentro de NOTES_DIR, pelo
// PASSO 3.9) ou NOTES_DIR inteira. Usada pela busca e por listarArquivos, para
// as duas recusarem as mesmas coisas.
async function pastaDoModulo(modulo?: string): Promise<string> {
    if (!modulo) return config.notesDir;
    const pasta = await resolveInsideNotes(modulo);
    // O modelo às vezes passa um arquivo (como veio da busca) no lugar do módulo.
    if (!(await stat(pasta)).isDirectory()) {
        throw new Error(`"${modulo}" é um arquivo, não um módulo. Use uma pasta, como as de listar_modulos; para ler o arquivo, use ler_material.`);
    }
    return pasta;
}

// Arquivos de um módulo, para o modelo saber o que existe antes de ler (o
// quiz, por exemplo, não precisa mais chutar termos de busca). Na ordem da
// busca (anotações, PDFs, código) e com teto: um módulo com 186 arquivos de
// código custaria milhares de tokens só para listar.
export const MAX_ARQUIVOS_LISTADOS = 100;
export type ArquivoListado = { arquivo: string; tipo: Tipo; kb: number };
export async function listarArquivos(modulo?: string, tipos?: Tipo[]): Promise<{ arquivos: ArquivoListado[]; total: number; porTipo: Partial<Record<Tipo, number>> }> {
    const files = (await listNoteFiles(await pastaDoModulo(modulo), enabledTypes(tipos)))
        .sort((a, b) => TYPE_PRIORITY.indexOf(typeOf(a)!) - TYPE_PRIORITY.indexOf(typeOf(b)!) || a.localeCompare(b));
    const porTipo: Partial<Record<Tipo, number>> = {};
    for (const file of files) porTipo[typeOf(file)!] = (porTipo[typeOf(file)!] ?? 0) + 1;
    const arquivos = await Promise.all(files.slice(0, MAX_ARQUIVOS_LISTADOS).map(async file => ({
        arquivo: relative(config.notesDir, file),
        tipo: typeOf(file)!,
        kb: Math.max(1, Math.round(((await stat(file).catch(() => undefined))?.size ?? 0) / 1024)),
    })));
    return { arquivos, total: files.length, porTipo };
}

// Busca LITERAL: procura o termo exato, sem diferenciar maiúsculas/minúsculas
// nem acentos ("funcao" acha "função" e vice-versa).
// Não entende sinônimos ("vetores" não acha "embeddings") — para isso existe a
// busca semântica opcional (PASSO 6).
export async function searchNotes(term: string, modulo?: string, tipos?: Tipo[]): Promise<Resultado[]> {
    // Passo a): onde buscar — o módulo pedido (validado pelo 3.9) ou tudo.
    const baseDir = await pastaDoModulo(modulo);
    const needle = paraComparar(term);

    // Passo b): os arquivos, em ordem de tipo (anotações → PDFs → código) e de
    // pasta. Essa ordem só desempata: quem decide é a pontuação do passo d).
    const files = (await listNoteFiles(baseDir, enabledTypes(tipos)))
        .sort((a, b) => TYPE_PRIORITY.indexOf(typeOf(a)!) - TYPE_PRIORITY.indexOf(typeOf(b)!));

    // Passo c): percorre TODOS os arquivos (sem parar no 20º achado, senão a
    // nota mais relevante podia nem ser vista) e guarda, de cada um, as 3
    // melhores linhas e quantas vezes o termo aparece.
    const candidatos: { file: string; pontos: number; linhas: Achado[] }[] = [];
    for (const file of files) {
        // Um PDF corrompido não pode derrubar a busca inteira
        const sections = await readSearchableLines(file).catch(() => []);
        const linhas: Achado[] = [];
        let ocorrencias = 0;
        // Título só existe em Markdown, e fora de bloco de código: em Python ou
        // num bloco ```bash, "# comentário" não é título.
        const markdown = extname(file).toLowerCase() === '.md';
        for (const { pagina, lines } of sections) {
            let emBlocoDeCodigo = false;
            for (const [index, line] of lines.entries()) {
                if (markdown && /^\s*(```|~~~)/.test(line)) emBlocoDeCodigo = !emBlocoDeCodigo;
                const comparavel = paraComparar(line);
                if (!comparavel.includes(needle)) continue;
                ocorrencias++;
                const titulo = markdown && !emBlocoDeCodigo && /^#{1,6}\s/.test(line);
                linhas.push({ line, linha: index + 1, pagina, pontos: pontosDaLinha(titulo, comparavel, needle) });
                // Mantém só as 3 melhores (empate: a que vem antes no arquivo).
                if (linhas.length > MAX_RESULTS_PER_FILE) {
                    linhas.sort((a, b) => b.pontos - a.pontos);
                    linhas.pop();
                }
            }
        }
        if (!linhas.length) continue;
        // Passo d): a pontuação do arquivo. O termo no nome do arquivo vale mais
        // (quem busca "embedding" quer a nota embeddings.md); depois, a melhor
        // linha (título, palavra inteira) e quantas vezes o termo aparece (em
        // logaritmo e com teto: repetir o termo 200 vezes não faz um arquivo
        // ganhar sozinho).
        // Por fim, o tipo: suas anotações valem mais que PDFs, e PDFs mais que
        // código, que repete os mesmos nomes muitas vezes.
        const noNome = paraComparar(basename(file)).includes(needle) ? PESO_NOME : 0;
        const melhor = Math.max(...linhas.map(l => l.pontos));
        candidatos.push({ file, pontos: noNome + melhor + Math.min(Math.log2(1 + ocorrencias), TETO_REPETICOES) + PESO_TIPO[typeOf(file)!], linhas });
    }

    // Passo e): mais pontos primeiro. O sort é estável: no empate, vale a ordem
    // do passo b). Dentro do arquivo, as melhores linhas primeiro.
    candidatos.sort((a, b) => b.pontos - a.pontos);
    const results: Resultado[] = [];
    for (const { file, linhas } of candidatos) {
        linhas.sort((a, b) => b.pontos - a.pontos || (a.pagina ?? 0) - (b.pagina ?? 0) || a.linha - b.linha);
        for (const { line, linha, pagina } of linhas) {
            // Passo f): passa a linha INTEIRA pelas proteções (PASSO 4.4) e só
            // depois recorta o trecho em volta do termo. Nessa ordem, um segredo
            // perto do corte é mascarado por inteiro, em vez de vazar pela metade
            // sem o prefixo (sk-...) que o identifica.
            const { text, alertas, segredos } = prepareUntrusted(line.trim());
            results.push({ arquivo: relative(config.notesDir, file), linha, pagina, trecho: janela(text, needle), alertas, segredos });
            // Para no limite geral, para não mandar texto demais ao modelo.
            if (results.length >= MAX_RESULTS) return results;
        }
    }
    return results;
}

// Uma linha em que o termo aparece. As proteções (PASSO 4.4) só rodam nas
// linhas escolhidas, no passo f): são as únicas que vão para o modelo.
type Achado = { line: string; linha: number; pagina?: number; pontos: number };

// Pesos da pontuação. Medidos com a avaliação (tests/avaliacao.model.ts) e num
// material de curso real: com qualquer combinação que use o nome do arquivo ou
// o título, a avaliação acerta todos os "termo em vários"; o bônus de tipo
// impede que código, que repete os termos dezenas de vezes, passe na frente
// das anotações. Os valores exatos não foram afinados: o corpus é pequeno.
const PESO_NOME = 3;
const PESO_TITULO = 2;
const PESO_PALAVRA_INTEIRA = 1;
const PESO_TIPO: Record<Tipo, number> = { anotacoes: 2, pdf: 1, codigo: 0 };
// Teto das repetições: log2(1 + 15) = 4, então a partir de 15 linhas com o
// termo, repetir mais não soma. Sem o teto, código que repete um nome dezenas
// de vezes passava na frente da anotação sobre o assunto.
const TETO_REPETICOES = 4;

// Pontos de uma linha: 1 por ter o termo, mais se for título Markdown (# ...,
// decidido em searchNotes)
// e se o termo aparecer como palavra inteira ("git" em "git push", e não em
// "digitar"). Letras acentuadas e números contam como parte da palavra.
function pontosDaLinha(titulo: boolean, comparavel: string, needle: string): number {
    let pontos = 1;
    if (titulo) pontos += PESO_TITULO;
    const letra = /[\p{L}\p{N}_]/u;
    for (let i = comparavel.indexOf(needle); i !== -1; i = comparavel.indexOf(needle, i + 1)) {
        if (!letra.test(comparavel[i - 1] ?? '') && !letra.test(comparavel[i + needle.length] ?? '')) {
            pontos += PESO_PALAVRA_INTEIRA;
            break;
        }
    }
    return pontos;
}

// ----------------------------------------------------------------------------
// 3.7 — LEITURA (usada pela tool ler_material, PASSO 2.5)
// ----------------------------------------------------------------------------
// Ordem das checagens: primeiro só pelo TEXTO do caminho, sem tocar no disco
// (dentro da pasta, nenhum trecho oculto ou bloqueado, extensão permitida,
// fora do .studynotesignore); depois o caminho real (3.9, symlinks) → é
// arquivo → tamanho → lê e protege (4.4). Assim um arquivo bloqueado recebe
// sempre a mesma recusa, exista ou não: perguntar por ".env" não revela se
// há um .env na pasta.
export async function readNote(path: string, paginas?: string): Promise<{ text: string; alertas: string[]; segredos: number }> {
    const pedido = resolve(config.notesDir, path);
    if (!isInside(config.notesDir, pedido)) throw new Error(`Caminho fora da pasta de anotações: ${path}`);
    // Confere CADA parte do caminho: "modulo/.oculta/nota.md" é bloqueado por
    // causa de ".oculta", mesmo que "nota.md" seja uma extensão permitida.
    const segments = relative(config.notesDir, pedido).split(sep);
    if (segments.some(isBlockedName) || !isAllowedFile(segments.at(-1)!)) {
        const extensions = enabledTypes().flatMap(tipo => FILE_TYPES[tipo]).join(', ');
        throw new Error(`Arquivo não permitido: ${path}. Só são lidos ${extensions} fora de pastas ocultas.`);
    }
    if ((await carregarExclusao())(relative(config.notesDir, pedido))) {
        throw new Error(`Arquivo ignorado pelo ${IGNORE_FILE}: ${path}`);
    }
    // Só agora o disco: o caminho real (symlinks) também precisa ficar dentro.
    // O erro do sistema traz o caminho absoluto (com o nome do seu usuário);
    // ele não vai para o modelo, só "não encontrado".
    const fullPath = await resolveInsideNotes(path).catch(error => {
        throw error?.code === 'ENOENT' ? new Error(`Arquivo não encontrado: ${path}`) : error;
    });
    const info = await stat(fullPath);
    if (!info.isFile()) throw new Error(`Não é um arquivo: ${path}`);
    if (typeOf(fullPath) === 'pdf') return prepareUntrusted(await readPdf(fullPath, paginas));
    if (info.size > MAX_FILE_BYTES) throw new Error(`Arquivo grande demais (${info.size} bytes, limite ${MAX_FILE_BYTES})`);
    return prepareUntrusted(await readFile(fullPath, 'utf8'));
}

// ----------------------------------------------------------------------------
// 3.8 — LEITURA DE PDF POR PÁGINAS
// ----------------------------------------------------------------------------
async function readPdf(file: string, paginas?: string): Promise<string> {
    const pages = await readPdfPages(file);
    // PDF escaneado = imagens de páginas, sem texto. Avisa em vez de devolver vazio.
    if (pages.every(page => !page.trim())) {
        throw new Error('PDF sem texto extraível (provavelmente escaneado ou só com imagens).');
    }
    const [start, end] = parsePageRange(paginas, pages.length);
    // Cada página ganha um cabeçalho "--- página N de T ---" para o modelo
    // conseguir citar a página certa.
    const body = pages.slice(start - 1, end)
        .map((text, index) => `--- página ${start + index} de ${pages.length} ---\n${text.trim() || '(página sem texto)'}`)
        .join('\n\n');
    // Se sobraram páginas, avisa o modelo de que existe mais e como pedir.
    const rest = end < pages.length
        ? `\n\n(O PDF tem ${pages.length} páginas; use o parâmetro paginas para ler outras, até ${MAX_PDF_PAGES_PER_READ} por vez.)`
        : '';
    return body + rest;
}

// ----------------------------------------------------------------------------
// 3.9 — SEGURANÇA DE CAMINHOS
// ----------------------------------------------------------------------------
// Impede sair de NOTES_DIR com "../" ou por symlink apontando para fora
// Duas checagens:
//   1ª) pelo texto do caminho: "../../.ssh/id_rsa" resolve para fora → recusa;
//   2ª) pelo caminho REAL (realpath segue symlinks): um atalho dentro da pasta
//       que aponta para fora também é recusado.
export async function resolveInsideNotes(path: string): Promise<string> {
    const fullPath = resolve(config.notesDir, path);
    if (!isInside(config.notesDir, fullPath)) {
        throw new Error(`Caminho fora da pasta de anotações: ${path}`);
    }
    // realpath falha se o caminho não existe; a mensagem do sistema traz o
    // caminho absoluto, que não deve ir para o modelo.
    const [realBase, realTarget] = await Promise.all([realpath(config.notesDir), realpath(fullPath)]).catch(error => {
        throw error?.code === 'ENOENT' ? Object.assign(new Error(`Não encontrado na pasta de anotações: ${path}`), { code: 'ENOENT' }) : error;
    });
    if (!isInside(realBase, realTarget)) {
        throw new Error(`Caminho fora da pasta de anotações: ${path}`);
    }
    return fullPath;
}

// ----------------------------------------------------------------------------
// 3.10 — DADOS SALVOS: DÚVIDAS E PROGRESSO
// ----------------------------------------------------------------------------
// Persistência simples em arquivos JSON dentro de DATA_DIR (fora da pasta de
// anotações, para não misturar seus dados com o material de estudo).

// Lê um JSON; se ainda não existir, usa o valor padrão.
// Um arquivo que existe mas está ilegível (editado à mão com erro, por exemplo)
// NÃO vira lista vazia: a próxima gravação apagaria todas as dúvidas. A tool
// devolve o erro e o arquivo fica intacto até o usuário corrigir.
async function readJson<T>(name: string, fallback: T): Promise<T> {
    const caminho = join(config.dataDir, name);
    let texto: string;
    try {
        texto = await readFile(caminho, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
        throw error;
    }
    try {
        return JSON.parse(texto);
    } catch {
        throw new Error(`O arquivo ${name} em DATA_DIR está com o JSON inválido e não foi alterado. Corrija o erro de formato ou mova o arquivo para outro lugar para começar uma lista nova.`);
    }
}

// Permissões 700 (pasta) e 600 (arquivos): só o seu usuário do sistema lê e escreve.
// Gravação atômica: escreve num arquivo temporário e renomeia. Com o servidor
// aberto em mais de um cliente (VS Code, Claude Code...), outro processo nunca
// lê um arquivo pela metade.
export async function gravarAtomico(caminho: string, conteudo: string): Promise<void> {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    // Nome único por chamada (e não só por processo): duas gravações ao mesmo
    // tempo no mesmo arquivo não podem usar o mesmo temporário.
    const temporario = `${caminho}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temporario, conteudo, { mode: 0o600 });
    try {
        await tentarDeNovo(() => rename(temporario, caminho));
    } catch (error) {
        // Não deixa o temporário para trás; o arquivo original continua intacto.
        await rm(temporario, { force: true });
        throw error;
    }
}

// No Windows, renomear por cima de um arquivo falha (EPERM, EBUSY, EACCES)
// enquanto outro processo o tem aberto: outro cliente lendo as dúvidas, ou o
// antivírus examinando o arquivo. Costuma durar milissegundos, então tenta de
// novo algumas vezes, esperando um pouco mais a cada vez (50, 100, 150... ms).
const ERROS_TEMPORARIOS = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_TENTATIVAS = 5;
export async function tentarDeNovo<T>(acao: () => Promise<T>): Promise<T> {
    for (let tentativa = 1; ; tentativa++) {
        try {
            return await acao();
        } catch (error) {
            const codigo = (error as NodeJS.ErrnoException).code ?? '';
            if (tentativa >= MAX_TENTATIVAS || !ERROS_TEMPORARIOS.has(codigo)) throw error;
            await new Promise(resolve => setTimeout(resolve, 50 * tentativa));
        }
    }
}

// Fila por arquivo: o ciclo inteiro (ler, alterar, gravar) de uma chamada
// termina antes de o da próxima começar. Sem isso, um cliente que chama
// registrar_duvida três vezes em paralelo faz as três lerem a mesma lista, e
// só a última gravação sobrevive. Vale dentro de um processo; dois clientes
// abertos ao mesmo tempo ainda podem, raramente, sobrescrever um ao outro.
const filas = new Map<string, Promise<unknown>>();
function emFila<T>(name: string, acao: () => Promise<T>): Promise<T> {
    const atual = (filas.get(name) ?? Promise.resolve()).catch(() => {}).then(acao);
    // O erro de uma chamada volta para quem chamou, mas não trava a fila.
    filas.set(name, atual.catch(() => {}));
    return atual;
}

async function writeJson(name: string, data: unknown): Promise<void> {
    await gravarAtomico(join(config.dataDir, name), JSON.stringify(data, null, 2));
}

// Remove caracteres invisíveis (PASSO 4.1) ao gravar e ao ler: mesmo que alguém
// edite o JSON à mão, o que volta ao modelo sai limpo.
const clean = (text: string) => sanitizeText(text).text.trim();

// Todas as dúvidas registradas, resolvidas ou não, já limpas de caracteres invisíveis.
export async function getDuvidas(): Promise<Duvida[]> {
    const duvidas = await readJson<Duvida[]>('duvidas.json', []);
    return duvidas.map(d => ({ ...d, modulo: clean(d.modulo), texto: clean(d.texto) }));
}

// Dúvidas com o número de cada uma (1, 2, 3...), como o usuário as vê em ver_estudos.
export async function getDuvidasNumeradas(): Promise<DuvidaNumerada[]> {
    return (await getDuvidas()).map((duvida, index) => ({ ...duvida, numero: index + 1 }));
}

// Marca como resolvida pelo número. Chamar de novo não muda nada (idempotente).
export async function resolverDuvida(numero: number): Promise<DuvidaNumerada> {
    return emFila('duvidas.json', async () => {
        const duvidas = await getDuvidas();
        const duvida = duvidas[numero - 1];
        if (!duvida) throw new Error(`Dúvida #${numero} não existe. Há ${duvidas.length} dúvida(s) registrada(s).`);
        duvida.resolvida = true;
        await writeJson('duvidas.json', duvidas);
        return { ...duvida, numero };
    });
}

// Acrescenta uma dúvida ao final da lista, como não resolvida. O número dela é a
// posição na lista (ver getDuvidasNumeradas).
export async function addDuvida(modulo: string, texto: string): Promise<Duvida> {
    return emFila('duvidas.json', async () => {
        const duvidas = await getDuvidas();
        const duvida = { modulo: clean(modulo), texto: clean(texto), criadaEm: new Date().toISOString(), resolvida: false };
        duvidas.push(duvida);
        await writeJson('duvidas.json', duvidas);
        return duvida;
    });
}

// Aulas concluídas por módulo, ex.: { modulo01: ['aula 1', 'aula 2'] }.
export async function getProgresso(): Promise<Progresso> {
    const progresso = await readJson<Progresso>('progresso.json', {});
    return Object.fromEntries(Object.entries(progresso).map(([modulo, aulas]) => [clean(modulo), aulas.map(clean)]));
}

// Marca a aula como concluída no módulo e devolve o progresso completo.
// Devolve também a chave usada (o módulo já limpo) e o total de aulas dele:
// quem chama não precisa recalcular a chave do jeito que clean() faz.
export async function markAulaConcluida(modulo: string, aula: string): Promise<{ progresso: Progresso; modulo: string; total: number }> {
    return emFila('progresso.json', async () => {
        const progresso = await getProgresso();
        const key = clean(modulo);
        // Set não aceita repetidos: marcar a mesma aula duas vezes não duplica.
        const aulas = new Set(progresso[key] ?? []);
        aulas.add(clean(aula));
        progresso[key] = [...aulas];
        await writeJson('progresso.json', progresso);
        return { progresso, modulo: key, total: progresso[key].length };
    });
}

// ----------------------------------------------------------------------------
// 3.11 — FORMATO DO OBSIDIAN
// ----------------------------------------------------------------------------
// O Obsidian é um app de anotações que guarda cada nota como um .md comum.
// Duas convenções dele aparecem aqui:
//   [[Nome da nota]]  link para outra nota, pelo nome do arquivo (sem .md);
//                     variações: [[nota#seção]], [[nota|apelido]], ![[nota]]
//   frontmatter       bloco entre "---" no topo, com tags e outros metadados

// Até 30 links por leitura: uma nota-índice com centenas de links não pode
// encher a resposta.
const MAX_LINKS = 30;
// Captura só o nome do arquivo: para antes de "#" (seção), "^" (bloco) ou "|" (apelido).
const WIKILINK = /!?\[\[([^[\]|#^\n]+)[^[\]\n]*\]\]/g;

// O Obsidian acha o arquivo pelo nome, em qualquer pasta. Com o mesmo nome em
// duas pastas, fica o caminho mais curto (o mais perto da raiz), como no app.
// "pasta/nota" também vale: casa com o fim do caminho.
function resolverLink(link: string, arquivos: string[]): string | undefined {
    const alvo = link.trim().replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
    const nomes = [`${alvo}.md`, alvo];
    const candidatos = arquivos.filter(arquivo => {
        const caminho = arquivo.toLowerCase();
        return nomes.some(nome => caminho === nome || caminho.endsWith(`/${nome}`));
    });
    candidatos.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    return candidatos[0]?.split('/').join(sep);
}

// Lista os [[links]] de um texto e para qual arquivo cada um aponta (undefined =
// não encontrado). Só entram arquivos que o servidor pode ler: um link para
// .env ou para uma pasta do .studynotesignore aparece como não encontrado.
export async function resolverLinks(texto: string): Promise<{ link: string; arquivo?: string }[]> {
    const links = [...new Set([...texto.matchAll(WIKILINK)].map(m => m[1].trim()))].slice(0, MAX_LINKS);
    if (!links.length) return [];
    const arquivos = (await listNoteFiles(config.notesDir, enabledTypes()))
        .map(file => relative(config.notesDir, file).split(sep).join('/'));
    return links.map(link => ({ link, arquivo: resolverLink(link, arquivos) }));
}

// Troca as linhas do frontmatter por linhas vazias. Usado pela busca por
// significado (PASSO 6): "tags: [rag]" e datas viram ruído no vetor do trecho.
// Linhas vazias, e não removidas, para os números de linha continuarem certos.
// A busca literal continua vendo o frontmatter (procurar "tags: rag" funciona).
export function semFrontmatter(lines: string[]): string[] {
    if (lines[0]?.trim() !== '---') return lines;
    const fim = lines.findIndex((line, i) => i > 0 && (line.trim() === '---' || line.trim() === '...'));
    if (fim < 0) return lines;
    return lines.map((line, i) => (i <= fim ? '' : line));
}
