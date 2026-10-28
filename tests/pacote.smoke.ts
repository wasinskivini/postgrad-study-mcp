/**
 * PASSO 5.6 — TESTE DO PACOTE DO NPM
 *
 * Faz o que uma pessoa faria: npm pack gera o .tgz (o prepack compila para
 * dist/), o pacote é instalado numa pasta vazia e o servidor sobe pelo "bin".
 * Pega erros que os outros testes não veem, como um arquivo faltando em
 * "files" ou um import que só funciona com o código-fonte ao lado.
 * Demora (instala as dependências), por isso só roda com npm run test:pack.
 */
import { describe, it, after, before } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// No Windows o npm é um .cmd e só roda via shell.
const npm = (args: string[], cwd: string) =>
    execFileSync('npm', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' })

// npm pack --json devolve uma lista no npm 10 e um objeto por nome no npm 11.
const infoDoPack = (saida: string) => {
    const json = JSON.parse(saida)
    return Array.isArray(json) ? json[0] : Object.values(json)[0] as any
}

describe('pacote do npm', () => {
    let root: string
    let pacote: string
    let client: Client

    before(async () => {
        root = await mkdtemp(join(tmpdir(), 'postgrad-pacote-'))
        const { filename } = infoDoPack(npm(['pack', '--json', '--pack-destination', root], process.cwd()))
        await writeFile(join(root, 'package.json'), '{"private": true}')
        // Sem a busca semântica: @huggingface/transformers é peer opcional e não vem junto.
        npm(['install', '--no-audit', '--no-fund', join(root, filename)], root)
        pacote = join(root, 'node_modules', 'postgrad-study-mcp')
    })

    after(async () => {
        await client?.close()
        await rm(root, { recursive: true, force: true })
    })

    it('should ship only the compiled code', async () => {
        const arquivos = infoDoPack(npm(['pack', '--dry-run', '--json'], process.cwd())).files
            .map((f: { path: string }) => f.path)
        assert.ok(arquivos.includes('dist/index.js'))
        assert.ok(!arquivos.some((f: string) => /^(src|tests)\//.test(f)), arquivos.join(', '))
    })

    it('should start through the bin and list the tools', { timeout: 30_000 }, async () => {
        const { bin } = JSON.parse(await readFile(join(pacote, 'package.json'), 'utf8'))
        const entrada = resolve(pacote, bin['postgrad-study-mcp'])
        assert.match(await readFile(entrada, 'utf8'), /^#!\/usr\/bin\/env node/)

        client = new Client({ name: 'test-pacote', version: '1.0.0' })
        await client.connect(new StdioClientTransport({
            command: 'node',
            args: [entrada],
            env: { ...process.env as Record<string, string>, NOTES_DIR: resolve('tests/fixtures/notas'), DATA_DIR: join(root, 'data') },
            cwd: root,
        }))
        const { tools } = await client.listTools()
        assert.strictEqual(tools.length, 7)
    })
})
