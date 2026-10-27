import { describe, it, after, before } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client'
import { createTestClient } from './helpers.ts'

type TextResult = { isError?: boolean, content: { text: string }[], structuredContent?: any }

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
    return await client.callTool({ name, arguments: args }) as unknown as TextResult
}

async function readJsonResource(client: Client, uri: string) {
    const { contents } = await client.readResource({ uri })
    return JSON.parse((contents[0] as { text: string }).text)
}

describe('Postgrad Study MCP', () => {
    let client: Client
    let dataDir: string

    before(async () => {
        dataDir = await mkdtemp(join(tmpdir(), 'postgrad-study-'))
        client = await createTestClient(dataDir)
    })

    after(async () => {
        await client.close()
        await rm(dataDir, { recursive: true, force: true })
    })

    it('should list modules', async () => {
        const result = await callTool(client, 'listar_modulos')
        assert.deepStrictEqual(result.structuredContent.modulos, ['modulo01', 'modulo03'])
    })

    it('should search notes across modules', async () => {
        const result = await callTool(client, 'buscar_anotacao', { termo: 'RESOURCES' })
        const [first] = result.structuredContent.resultados
        assert.strictEqual(first.arquivo, join('modulo03', 'mcp.md'))
        assert.strictEqual(first.linha, 3)
    })

    it('should restrict search to a module', async () => {
        const result = await callTool(client, 'buscar_anotacao', { termo: 'resources', modulo: 'modulo01' })
        assert.deepStrictEqual(result.structuredContent.resultados, [])
    })

    it('should read a note', async () => {
        const result = await callTool(client, 'ler_anotacao', { arquivo: 'modulo01/redes-neurais.md' })
        assert.match(result.content[0].text, /backpropagation/)
    })

    it('should block reading outside the notes folder', async () => {
        const result = await callTool(client, 'ler_anotacao', { arquivo: '../../package.json' })
        assert.strictEqual(result.isError, true)
        assert.match(result.content[0].text, /fora da pasta/)
    })

    it('should register a doubt and expose it as a resource', async () => {
        await callTool(client, 'registrar_duvida', { modulo: 'modulo03', texto: 'Quando usar resource vs tool?' })
        const duvidas = await readJsonResource(client, 'pos://duvidas')
        assert.strictEqual(duvidas[0].texto, 'Quando usar resource vs tool?')
    })

    it('should track progress without duplicates', async () => {
        await callTool(client, 'marcar_aula_concluida', { modulo: 'modulo03', aula: '05' })
        await callTool(client, 'marcar_aula_concluida', { modulo: 'modulo03', aula: '05' })
        assert.deepStrictEqual(await readJsonResource(client, 'pos://progresso'), { modulo03: ['05'] })
    })

    it('should return the gerar_quiz prompt', async () => {
        const result = await client.getPrompt({ name: 'gerar_quiz', arguments: { modulo: 'modulo03' } })
        const item = result.messages.at(0)?.content as unknown as { text: string }
        assert.match(item.text, /modulo03/)
        assert.match(item.text, /5 perguntas/)
    })
})
