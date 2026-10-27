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
 * sempre a mesma resposta. Não há LLM nem acesso à internet.
 *
 * Mapa deste arquivo:
 *   3.1  tipos de arquivo (o que pode ser lido)
 *   3.2  limites e configuração (variáveis de ambiente)
 *   3.3  filtros (arquivos e pastas bloqueados)
 *   3.4  PDFs: extração de texto com cache e intervalo de páginas
 *   3.5  varredura das pastas e lista de módulos
 *   3.6  busca (searchNotes) — usada pela tool buscar_anotacao
 *   3.7  leitura (readNote) — usada pela tool ler_anotacao
 *   3.8  leitura de PDF por páginas
 *   3.9  segurança de caminhos (não sair da pasta de anotações)
 *   3.10 dados salvos: dúvidas e progresso (JSON em DATA_DIR)
 */
import { readdir, readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
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
const MAX_FILE_BYTES = 200_000;
const MAX_PDF_BYTES = 30_000_000;
export const MAX_PDF_PAGES_PER_READ = 5;

// Configuração lida das variáveis de ambiente, definidas no bloco "env" do
// mcp.json (ou num .env — veja o .env.example). resolve() transforma em
// caminho absoluto, que é o que as checagens do 3.9 comparam.
export const config = {
    notesDir: resolve(process.env.NOTES_DIR ?? join(homedir(), 'Documents')),
    dataDir: resolve(process.env.DATA_DIR ?? join(homedir(), '.postgrad-study-mcp')),
    // PDFs ficam ligados, a menos que INCLUDE_PDF seja exatamente "false".
    includePdf: process.env.INCLUDE_PDF !== 'false',
};

// Formatos dos dados que circulam entre as funções.
export type Duvida = { modulo: string; texto: string; criadaEm: string; resolvida: boolean };
export type Progresso = Record<string, string[]>;
export type Resultado = { arquivo: string; linha: number; pagina?: number; trecho: string; alertas: string[] };

// ----------------------------------------------------------------------------
// 3.3 — FILTROS
// ----------------------------------------------------------------------------
// Tipos pedidos (ou todos), sem PDF quando INCLUDE_PDF=false
export function enabledTypes(tipos?: Tipo[]): Tipo[] {
    return (tipos?.length ? tipos : TIPOS).filter(tipo => tipo !== 'pdf' || config.includePdf);
}

// Descobre o tipo pela extensão (".PDF" e ".pdf" valem igual). undefined = não permitido.
function typeOf(name: string): Tipo | undefined {
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

// ----------------------------------------------------------------------------
// 3.4 — PDFs: EXTRAÇÃO COM CACHE
// ----------------------------------------------------------------------------
// Texto por página; extraído uma vez e reaproveitado enquanto o arquivo não mudar
// A chave é o caminho; mtimeMs (data de modificação) detecta se o PDF mudou.
// O cache vive enquanto o processo vive (o VS Code reinicia o servidor a cada
// conversa nova, então na prática ele vale durante uma conversa).
const pdfCache = new Map<string, { mtimeMs: number; pages: string[] }>();

async function readPdfPages(file: string): Promise<string[]> {
    const info = await stat(file);
    if (info.size > MAX_PDF_BYTES) throw new Error(`PDF grande demais (${info.size} bytes, limite ${MAX_PDF_BYTES})`);
    const cached = pdfCache.get(file);
    if (cached?.mtimeMs === info.mtimeMs) return cached.pages;

    // verbosity 0: o pdf.js não pode escrever avisos no stdout, que é o canal do MCP
    // (ver PASSO 1.1: qualquer texto extra no stdout corrompe o protocolo).
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)), { verbosity: 0 });
    try {
        // mergePages: false → um texto por página, para podermos citar "p. N".
        const { text } = await extractText(pdf, { mergePages: false });
        pdfCache.set(file, { mtimeMs: info.mtimeMs, pages: text });
        return text;
    } finally {
        // Libera a memória do documento, mesmo se a extração falhar.
        await pdf.cleanup();
    }
}

// "5" ou "5-8" → [início, fim], validado contra o total de páginas
// Sem "paginas", devolve as primeiras MAX_PDF_PAGES_PER_READ páginas.
function parsePageRange(paginas: string | undefined, total: number): [number, number] {
    if (!paginas) return [1, Math.min(total, MAX_PDF_PAGES_PER_READ)];
    // "5" vira [5, 5]; "5-8" vira [5, 8].
    const [start, end = start] = paginas.split('-').map(Number);
    if (start < 1 || end < start || end > total) {
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
async function listNoteFiles(dir: string, tipos: Tipo[]): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        if (isBlockedName(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await listNoteFiles(fullPath, tipos));
        else if (entry.isFile() && isAllowedFile(entry.name, tipos)) files.push(fullPath);
    }
    return files;
}

// Linhas de um arquivo; PDFs vêm página a página
// Normaliza os dois formatos para a busca (3.6) tratar tudo igual: uma lista de
// seções, cada uma com suas linhas (e a página, quando é PDF).
async function readSearchableLines(file: string): Promise<{ pagina?: number; lines: string[] }[]> {
    if (typeOf(file) === 'pdf') {
        const pages = await readPdfPages(file);
        return pages.map((text, index) => ({ pagina: index + 1, lines: text.split('\n') }));
    }
    // Arquivos de texto grandes demais são pulados na busca.
    if ((await stat(file)).size > MAX_FILE_BYTES) return [];
    return [{ lines: (await readFile(file, 'utf8')).split('\n') }];
}

// Módulos = subpastas de primeiro nível de NOTES_DIR (em ordem alfabética).
export async function listModules(): Promise<string[]> {
    const entries = await readdir(config.notesDir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory() && !isBlockedName(entry.name))
        .map(entry => entry.name)
        .sort();
}

// ----------------------------------------------------------------------------
// 3.6 — BUSCA (usada pela tool buscar_anotacao, PASSO 2.4)
// ----------------------------------------------------------------------------
// Busca LITERAL: procura o termo exato, sem diferenciar maiúsculas/minúsculas.
// Não entende sinônimos ("vetores" não acha "embeddings") — isso exigiria
// embeddings, ou seja, busca semântica.
export async function searchNotes(term: string, modulo?: string, tipos?: Tipo[]): Promise<Resultado[]> {
    // Passo a): onde buscar — o módulo pedido (validado pelo 3.9) ou tudo.
    const baseDir = modulo ? await resolveInsideNotes(modulo) : config.notesDir;
    const needle = term.toLowerCase();
    const results: Resultado[] = [];

    // Passo b): para cada arquivo permitido...
    for (const file of await listNoteFiles(baseDir, enabledTypes(tipos))) {
        // Um PDF corrompido não pode derrubar a busca inteira
        const sections = await readSearchableLines(file).catch(() => []);
        // Passo c): ...para cada linha (de cada página, se for PDF)...
        for (const { pagina, lines } of sections) {
            for (const [index, line] of lines.entries()) {
                if (!line.toLowerCase().includes(needle)) continue;
                // Passo d): achou! Corta em 200 caracteres e passa pelas
                // proteções (PASSO 4.4) antes de guardar o resultado.
                const { text, alertas } = prepareUntrusted(line.trim().slice(0, 200));
                results.push({ arquivo: relative(config.notesDir, file), linha: index + 1, pagina, trecho: text, alertas });
                // Passo e): para no limite, para não mandar texto demais ao modelo.
                if (results.length >= MAX_RESULTS) return results;
            }
        }
    }
    return results;
}

// ----------------------------------------------------------------------------
// 3.7 — LEITURA (usada pela tool ler_anotacao, PASSO 2.5)
// ----------------------------------------------------------------------------
// Ordem das checagens: caminho dentro da pasta (3.9) → nenhum trecho oculto ou
// bloqueado → extensão permitida → é arquivo → tamanho → lê e protege (4.4).
export async function readNote(path: string, paginas?: string): Promise<{ text: string; alertas: string[] }> {
    const fullPath = await resolveInsideNotes(path);
    // Confere CADA parte do caminho: "modulo/.oculta/nota.md" é bloqueado por
    // causa de ".oculta", mesmo que "nota.md" seja uma extensão permitida.
    const segments = relative(config.notesDir, fullPath).split(sep);
    if (segments.some(isBlockedName) || !isAllowedFile(segments.at(-1)!)) {
        const extensions = enabledTypes().flatMap(tipo => FILE_TYPES[tipo]).join(', ');
        throw new Error(`Arquivo não permitido: ${path}. Só são lidos ${extensions} fora de pastas ocultas.`);
    }
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
async function resolveInsideNotes(path: string): Promise<string> {
    const fullPath = resolve(config.notesDir, path);
    if (!isInside(config.notesDir, fullPath)) {
        throw new Error(`Caminho fora da pasta de anotações: ${path}`);
    }
    const [realBase, realTarget] = await Promise.all([realpath(config.notesDir), realpath(fullPath)]);
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

// Lê um JSON; se ainda não existir (ou estiver corrompido), usa o valor padrão.
async function readJson<T>(name: string, fallback: T): Promise<T> {
    try {
        return JSON.parse(await readFile(join(config.dataDir, name), 'utf8'));
    } catch {
        return fallback;
    }
}

// Permissões 700 (pasta) e 600 (arquivos): só o seu usuário do sistema lê e escreve.
async function writeJson(name: string, data: unknown): Promise<void> {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    await writeFile(join(config.dataDir, name), JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Remove caracteres invisíveis (PASSO 4.1) ao gravar e ao ler: mesmo que alguém
// edite o JSON à mão, o que volta ao modelo sai limpo.
const clean = (text: string) => sanitizeText(text).text.trim();

export async function getDuvidas(): Promise<Duvida[]> {
    const duvidas = await readJson<Duvida[]>('duvidas.json', []);
    return duvidas.map(d => ({ ...d, modulo: clean(d.modulo), texto: clean(d.texto) }));
}

export async function addDuvida(modulo: string, texto: string): Promise<Duvida> {
    const duvidas = await getDuvidas();
    const duvida = { modulo: clean(modulo), texto: clean(texto), criadaEm: new Date().toISOString(), resolvida: false };
    duvidas.push(duvida);
    await writeJson('duvidas.json', duvidas);
    return duvida;
}

export async function getProgresso(): Promise<Progresso> {
    const progresso = await readJson<Progresso>('progresso.json', {});
    return Object.fromEntries(Object.entries(progresso).map(([modulo, aulas]) => [clean(modulo), aulas.map(clean)]));
}

export async function markAulaConcluida(modulo: string, aula: string): Promise<Progresso> {
    const progresso = await getProgresso();
    const key = clean(modulo);
    // Set não aceita repetidos: marcar a mesma aula duas vezes não duplica.
    const aulas = new Set(progresso[key] ?? []);
    aulas.add(clean(aula));
    progresso[key] = [...aulas];
    await writeJson('progresso.json', progresso);
    return progresso;
}
