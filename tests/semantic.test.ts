/**
 * PASSO 5.4 — TESTES DA BUSCA SEMÂNTICA (PASSO 6)
 *
 * Duas partes:
 *   sem modelo  → divisão em trechos e similaridade: rodam sempre, em npm test
 *   com modelo  → o servidor de verdade com SEMANTIC_SEARCH=true. Baixa o modelo
 *                 (~145 MB) na primeira vez, por isso só roda com
 *                 npm run test:semantic (TEST_SEMANTIC=1)
 */
import { describe, it, after, before } from 'node:test'
import assert from 'node:assert'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client'
import { createTestClient } from './helpers.ts'
import { buildPdf } from './pdf.ts'
import { dividirEmTrechos, similaridade } from '../src/semantic.ts'

describe('busca semântica: sem modelo', () => {
    it('should split long files into chunks that keep the starting line', () => {
        const lines = Array.from({ length: 40 }, (_, i) => `linha ${i + 1} ${'conteúdo de estudo '.repeat(3)}`)
        const trechos = dividirEmTrechos([{ lines }])
        assert.ok(trechos.length > 1)
        assert.strictEqual(trechos[0].linha, 1)
        // Cada trecho começa exatamente na linha que ele diz.
        for (const trecho of trechos) assert.ok(trecho.texto.startsWith(`linha ${trecho.linha} `))
    })

    it('should keep the PDF page and skip near-empty chunks', () => {
        const trechos = dividirEmTrechos([
            { pagina: 1, lines: ['---', ''] },
            { pagina: 2, lines: ['Embeddings representam texto como vetores.'] },
        ])
        assert.deepStrictEqual(trechos, [{ linha: 1, pagina: 2, texto: 'Embeddings representam texto como vetores.' }])
    })

    it('should compute similarity as the dot product of normalized vectors', () => {
        assert.strictEqual(similaridade([1, 0], [1, 0]), 1)
        assert.strictEqual(similaridade([1, 0], [0, 1]), 0)
    })
})

describe('busca semântica: com modelo', { skip: !process.env.TEST_SEMANTIC && 'rode com npm run test:semantic' }, () => {
    let client: Client
    let root: string

    before(async () => {
        root = await mkdtemp(join(tmpdir(), 'postgrad-semantic-'))
        const notesDir = join(root, 'notas')
        await cp('tests/fixtures/notas', notesDir, { recursive: true })
        await writeFile(join(notesDir, 'modulo01', 'receita.md'), 'Bolo de cenoura: misture farinha, ovos, açúcar e asse por 40 minutos.')
        await writeFile(join(notesDir, 'modulo01', 'aula-rag.pdf'), buildPdf([
            ['Introducao ao curso'],
            ['Embeddings convertem frases em listas de numeros que capturam o significado'],
        ]))
        // MODELS_DIR fora da pasta temporária: o modelo é baixado uma vez e reaproveitado.
        client = await createTestClient(notesDir, join(root, 'data'), {
            SEMANTIC_SEARCH: 'true',
            MODELS_DIR: process.env.MODELS_DIR ?? join(tmpdir(), 'postgrad-study-mcp-modelos'),
        })
    })

    after(async () => {
        await client?.close()
        await rm(root, { recursive: true, force: true })
    })

    // Espera o índice ficar pronto (sem o aviso "em construção").
    async function buscar(pergunta: string, extra: Record<string, unknown> = {}) {
        for (let tentativa = 0; tentativa < 240; tentativa++) {
            const result = await client.callTool({ name: 'buscar_por_significado', arguments: { pergunta, ...extra } }) as any
            if (result.isError) throw new Error(result.content[0].text)
            if (!/em construção/.test(result.content[0].text)) return result
            await new Promise(resolve => setTimeout(resolve, 500))
        }
        throw new Error('índice não ficou pronto a tempo')
    }

    it('should find content by meaning, without the same words', { timeout: 180_000 }, async () => {
        const result = await buscar('como transformar texto em vetores numéricos?')
        const [primeiro] = result.structuredContent.resultados
        assert.strictEqual(primeiro.arquivo, join('modulo01', 'aula-rag.pdf'))
        assert.strictEqual(primeiro.pagina, 2)
        assert.match(result.content[0].text, /<dados_nao_confiaveis/)
    })

    it('should rank unrelated content lower', { timeout: 60_000 }, async () => {
        const result = await buscar('receita de bolo')
        assert.strictEqual(result.structuredContent.resultados[0].arquivo, join('modulo01', 'receita.md'))
    })

    it('should restrict by type', { timeout: 60_000 }, async () => {
        const result = await buscar('embeddings', { tipos: ['anotacoes'] })
        assert.ok(result.structuredContent.resultados.every((r: { arquivo: string }) => !r.arquivo.endsWith('.pdf')))
    })
})
