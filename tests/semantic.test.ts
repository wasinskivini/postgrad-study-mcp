/**
 * PASSO 5.4 — TESTES DA BUSCA SEMÂNTICA (PASSO 6), PARTE SEM MODELO
 *
 * Divisão em trechos e similaridade: não precisam do modelo e rodam sempre, em
 * npm test. Os testes com o modelo de verdade ficam em semantic.model.ts.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { dividirEmTrechos, fundir, similaridade } from '../src/semantic.ts'

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

describe('busca híbrida: fundir', () => {
    const achado = (arquivo: string, linha = 1, pagina?: number) => ({ arquivo, linha, pagina, trecho: 'x', alertas: [] })
    const parecido = (arquivo: string, linha: number, similaridade: number) => ({ ...achado(arquivo, linha), similaridade })

    it('should rank higher the file that both searches found', () => {
        const resultado = fundir([achado('a.md'), achado('b.md')], [parecido('b.md', 9, 0.9)])
        assert.strictEqual(resultado[0].arquivo, 'b.md')
    })

    it('should merge the same line found by both searches', () => {
        const resultado = fundir([achado('a.md', 4)], [parecido('a.md', 4, 0.88)])
        assert.strictEqual(resultado.length, 1)
        assert.strictEqual(resultado[0].origem, 'ambas')
        assert.strictEqual(resultado[0].similaridade, 0.88)
    })

    it('should keep results of only one search when the other finds nothing', () => {
        assert.deepStrictEqual(fundir([achado('a.md')], []).map(r => r.origem), ['literal'])
        assert.deepStrictEqual(fundir([], [parecido('a.md', 1, 0.8)]).map(r => r.origem), ['significado'])
    })

    it('should keep at most 3 results per file', () => {
        const literais = [1, 2, 3, 4, 5].map(linha => achado('a.md', linha))
        assert.strictEqual(fundir(literais, [parecido('a.md', 9, 0.9)]).length, 3)
    })
})
