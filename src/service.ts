import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const NOTE_EXTENSIONS = ['.md', '.txt'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const MAX_RESULTS = 20;

export const config = {
    notesDir: resolve(process.env.NOTES_DIR ?? join(homedir(), 'Documents')),
    dataDir: resolve(process.env.DATA_DIR ?? join(homedir(), '.pos-estudos-mcp')),
};

export type Duvida = { modulo: string; texto: string; criadaEm: string; resolvida: boolean };
export type Progresso = Record<string, string[]>;

// Lista todos os arquivos de anotação, ignorando pastas de build/dependências e ocultas
async function listNoteFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await listNoteFiles(fullPath));
        else if (NOTE_EXTENSIONS.some(ext => entry.name.endsWith(ext))) files.push(fullPath);
    }
    return files;
}

export async function listModules(): Promise<string[]> {
    const entries = await readdir(config.notesDir, { withFileTypes: true });
    return entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name))
        .map(entry => entry.name)
        .sort();
}

export async function searchNotes(term: string, modulo?: string) {
    const baseDir = modulo ? resolveInsideNotes(modulo) : config.notesDir;
    const needle = term.toLowerCase();
    const results: { arquivo: string; linha: number; trecho: string }[] = [];

    for (const file of await listNoteFiles(baseDir)) {
        const lines = (await readFile(file, 'utf8')).split('\n');
        for (const [index, line] of lines.entries()) {
            if (!line.toLowerCase().includes(needle)) continue;
            results.push({
                arquivo: relative(config.notesDir, file),
                linha: index + 1,
                trecho: line.trim().slice(0, 200),
            });
            if (results.length >= MAX_RESULTS) return results;
        }
    }
    return results;
}

export async function readNote(path: string): Promise<string> {
    return readFile(resolveInsideNotes(path), 'utf8');
}

// Impede ler arquivos fora de NOTES_DIR (ex: "../../.ssh/id_rsa")
function resolveInsideNotes(path: string): string {
    const fullPath = resolve(config.notesDir, path);
    if (fullPath !== config.notesDir && !fullPath.startsWith(config.notesDir + sep)) {
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
    await mkdir(config.dataDir, { recursive: true });
    await writeFile(join(config.dataDir, name), JSON.stringify(data, null, 2));
}

export async function getDuvidas(): Promise<Duvida[]> {
    return readJson<Duvida[]>('duvidas.json', []);
}

export async function addDuvida(modulo: string, texto: string): Promise<Duvida> {
    const duvidas = await getDuvidas();
    const duvida = { modulo, texto, criadaEm: new Date().toISOString(), resolvida: false };
    duvidas.push(duvida);
    await writeJson('duvidas.json', duvidas);
    return duvida;
}

export async function getProgresso(): Promise<Progresso> {
    return readJson<Progresso>('progresso.json', {});
}

export async function markAulaConcluida(modulo: string, aula: string): Promise<Progresso> {
    const progresso = await getProgresso();
    const aulas = new Set(progresso[modulo] ?? []);
    aulas.add(aula);
    progresso[modulo] = [...aulas];
    await writeJson('progresso.json', progresso);
    return progresso;
}
