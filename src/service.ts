import { readdir, readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { extractText, getDocumentProxy } from 'unpdf';
import { prepareUntrusted, sanitizeText } from './safety.ts';

// Lista fechada por tipo: .env, .json, chaves etc. nunca são lidos
const FILE_TYPES = {
    anotacoes: ['.md', '.txt'],
    codigo: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'],
    pdf: ['.pdf'],
} as const;
export type Tipo = keyof typeof FILE_TYPES;
export const TIPOS = Object.keys(FILE_TYPES) as Tipo[];

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', 'venv']);
const MAX_RESULTS = 20;
const MAX_FILE_BYTES = 200_000;
const MAX_PDF_BYTES = 30_000_000;
export const MAX_PDF_PAGES_PER_READ = 5;

export const config = {
    notesDir: resolve(process.env.NOTES_DIR ?? join(homedir(), 'Documents')),
    dataDir: resolve(process.env.DATA_DIR ?? join(homedir(), '.postgrad-study-mcp')),
    includePdf: process.env.INCLUDE_PDF !== 'false',
};

export type Duvida = { modulo: string; texto: string; criadaEm: string; resolvida: boolean };
export type Progresso = Record<string, string[]>;
export type Resultado = { arquivo: string; linha: number; pagina?: number; trecho: string; alertas: string[] };

// Tipos pedidos (ou todos), sem PDF quando INCLUDE_PDF=false
export function enabledTypes(tipos?: Tipo[]): Tipo[] {
    return (tipos?.length ? tipos : TIPOS).filter(tipo => tipo !== 'pdf' || config.includePdf);
}

function typeOf(name: string): Tipo | undefined {
    const ext = extname(name).toLowerCase();
    return TIPOS.find(tipo => (FILE_TYPES[tipo] as readonly string[]).includes(ext));
}

function isBlockedName(name: string): boolean {
    return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function isAllowedFile(name: string, tipos = enabledTypes()): boolean {
    const tipo = typeOf(name);
    return !isBlockedName(name) && tipo !== undefined && tipos.includes(tipo);
}

// Texto por página; extraído uma vez e reaproveitado enquanto o arquivo não mudar
const pdfCache = new Map<string, { mtimeMs: number; pages: string[] }>();

async function readPdfPages(file: string): Promise<string[]> {
    const info = await stat(file);
    if (info.size > MAX_PDF_BYTES) throw new Error(`PDF grande demais (${info.size} bytes, limite ${MAX_PDF_BYTES})`);
    const cached = pdfCache.get(file);
    if (cached?.mtimeMs === info.mtimeMs) return cached.pages;

    // verbosity 0: o pdf.js não pode escrever avisos no stdout, que é o canal do MCP
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)), { verbosity: 0 });
    try {
        const { text } = await extractText(pdf, { mergePages: false });
        pdfCache.set(file, { mtimeMs: info.mtimeMs, pages: text });
        return text;
    } finally {
        await pdf.cleanup();
    }
}

// "5" ou "5-8" → [início, fim], validado contra o total de páginas
function parsePageRange(paginas: string | undefined, total: number): [number, number] {
    if (!paginas) return [1, Math.min(total, MAX_PDF_PAGES_PER_READ)];
    const [start, end = start] = paginas.split('-').map(Number);
    if (start < 1 || end < start || end > total) {
        throw new Error(`Páginas inválidas: ${paginas}. O PDF tem ${total} página(s).`);
    }
    if (end - start + 1 > MAX_PDF_PAGES_PER_READ) {
        throw new Error(`Máximo de ${MAX_PDF_PAGES_PER_READ} páginas por leitura (pedido: ${paginas}).`);
    }
    return [start, end];
}

function isInside(base: string, target: string): boolean {
    return target === base || target.startsWith(base + sep);
}

// Lista os arquivos permitidos; symlinks são ignorados (não são nem arquivo nem pasta para o Dirent)
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
async function readSearchableLines(file: string): Promise<{ pagina?: number; lines: string[] }[]> {
    if (typeOf(file) === 'pdf') {
        const pages = await readPdfPages(file);
        return pages.map((text, index) => ({ pagina: index + 1, lines: text.split('\n') }));
    }
    if ((await stat(file)).size > MAX_FILE_BYTES) return [];
    return [{ lines: (await readFile(file, 'utf8')).split('\n') }];
}

export async function listModules(): Promise<string[]> {
    const entries = await readdir(config.notesDir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory() && !isBlockedName(entry.name))
        .map(entry => entry.name)
        .sort();
}

export async function searchNotes(term: string, modulo?: string, tipos?: Tipo[]): Promise<Resultado[]> {
    const baseDir = modulo ? await resolveInsideNotes(modulo) : config.notesDir;
    const needle = term.toLowerCase();
    const results: Resultado[] = [];

    for (const file of await listNoteFiles(baseDir, enabledTypes(tipos))) {
        // Um PDF corrompido não pode derrubar a busca inteira
        const sections = await readSearchableLines(file).catch(() => []);
        for (const { pagina, lines } of sections) {
            for (const [index, line] of lines.entries()) {
                if (!line.toLowerCase().includes(needle)) continue;
                const { text, alertas } = prepareUntrusted(line.trim().slice(0, 200));
                results.push({ arquivo: relative(config.notesDir, file), linha: index + 1, pagina, trecho: text, alertas });
                if (results.length >= MAX_RESULTS) return results;
            }
        }
    }
    return results;
}

export async function readNote(path: string, paginas?: string): Promise<{ text: string; alertas: string[] }> {
    const fullPath = await resolveInsideNotes(path);
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

async function readPdf(file: string, paginas?: string): Promise<string> {
    const pages = await readPdfPages(file);
    if (pages.every(page => !page.trim())) {
        throw new Error('PDF sem texto extraível (provavelmente escaneado ou só com imagens).');
    }
    const [start, end] = parsePageRange(paginas, pages.length);
    const body = pages.slice(start - 1, end)
        .map((text, index) => `--- página ${start + index} de ${pages.length} ---\n${text.trim() || '(página sem texto)'}`)
        .join('\n\n');
    const rest = end < pages.length
        ? `\n\n(O PDF tem ${pages.length} páginas; use o parâmetro paginas para ler outras, até ${MAX_PDF_PAGES_PER_READ} por vez.)`
        : '';
    return body + rest;
}

// Impede sair de NOTES_DIR com "../" ou por symlink apontando para fora
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

async function readJson<T>(name: string, fallback: T): Promise<T> {
    try {
        return JSON.parse(await readFile(join(config.dataDir, name), 'utf8'));
    } catch {
        return fallback;
    }
}

async function writeJson(name: string, data: unknown): Promise<void> {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    await writeFile(join(config.dataDir, name), JSON.stringify(data, null, 2), { mode: 0o600 });
}

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
    const aulas = new Set(progresso[key] ?? []);
    aulas.add(clean(aula));
    progresso[key] = [...aulas];
    await writeJson('progresso.json', progresso);
    return progresso;
}
