import { readdir, readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { prepareUntrusted, sanitizeText } from './safety.ts';

// Lista fechada: só anotações e código-fonte. .env, .json, chaves etc. nunca são lidos
export const ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', 'venv']);
const MAX_RESULTS = 20;
const MAX_FILE_BYTES = 200_000;

export const config = {
    notesDir: resolve(process.env.NOTES_DIR ?? join(homedir(), 'Documents')),
    dataDir: resolve(process.env.DATA_DIR ?? join(homedir(), '.postgrad-study-mcp')),
};

export type Duvida = { modulo: string; texto: string; criadaEm: string; resolvida: boolean };
export type Progresso = Record<string, string[]>;
export type Resultado = { arquivo: string; linha: number; trecho: string; alertas: string[] };

function isBlockedName(name: string): boolean {
    return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function isAllowedFile(name: string): boolean {
    return !isBlockedName(name) && ALLOWED_EXTENSIONS.has(extname(name).toLowerCase());
}

function isInside(base: string, target: string): boolean {
    return target === base || target.startsWith(base + sep);
}

// Lista os arquivos permitidos; symlinks são ignorados (não são nem arquivo nem pasta para o Dirent)
async function listNoteFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        if (isBlockedName(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await listNoteFiles(fullPath));
        else if (entry.isFile() && isAllowedFile(entry.name)) files.push(fullPath);
    }
    return files;
}

export async function listModules(): Promise<string[]> {
    const entries = await readdir(config.notesDir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory() && !isBlockedName(entry.name))
        .map(entry => entry.name)
        .sort();
}

export async function searchNotes(term: string, modulo?: string): Promise<Resultado[]> {
    const baseDir = modulo ? await resolveInsideNotes(modulo) : config.notesDir;
    const needle = term.toLowerCase();
    const results: Resultado[] = [];

    for (const file of await listNoteFiles(baseDir)) {
        if ((await stat(file)).size > MAX_FILE_BYTES) continue;
        const lines = (await readFile(file, 'utf8')).split('\n');
        for (const [index, line] of lines.entries()) {
            if (!line.toLowerCase().includes(needle)) continue;
            const { text, alertas } = prepareUntrusted(line.trim().slice(0, 200));
            results.push({ arquivo: relative(config.notesDir, file), linha: index + 1, trecho: text, alertas });
            if (results.length >= MAX_RESULTS) return results;
        }
    }
    return results;
}

export async function readNote(path: string): Promise<{ text: string; alertas: string[] }> {
    const fullPath = await resolveInsideNotes(path);
    const segments = relative(config.notesDir, fullPath).split(sep);
    if (segments.some(isBlockedName) || !isAllowedFile(segments.at(-1)!)) {
        throw new Error(`Arquivo não permitido: ${path}. Só são lidos ${[...ALLOWED_EXTENSIONS].join(', ')} fora de pastas ocultas.`);
    }
    const info = await stat(fullPath);
    if (!info.isFile()) throw new Error(`Não é um arquivo: ${path}`);
    if (info.size > MAX_FILE_BYTES) throw new Error(`Arquivo grande demais (${info.size} bytes, limite ${MAX_FILE_BYTES})`);
    return prepareUntrusted(await readFile(fullPath, 'utf8'));
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
