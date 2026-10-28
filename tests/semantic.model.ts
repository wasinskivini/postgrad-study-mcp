/**
 * PASSO 5.5 — TESTES DA BUSCA SEMÂNTICA (PASSO 6), COM O MODELO DE VERDADE
 *
 * Sobe o servidor com SEMANTIC_SEARCH=true. Baixa o modelo (~145 MB) na
 * primeira vez, por isso o arquivo não termina em .test.ts: npm test não o
 * pega, só npm run test:semantic.
 */
import { describe, it, after, before } from 'node:test'
import assert from 'node:assert'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client'
import { createTestClient } from './helpers.ts'
import { buildPdf } from './pdf.ts'

describe('busca semântica: com modelo', () => {
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
