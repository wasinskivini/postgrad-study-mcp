/**
 * PASSO 5.4 — TESTES DA BUSCA SEMÂNTICA (PASSO 6), PARTE SEM MODELO
 *
 * Divisão em trechos e similaridade: não precisam do modelo e rodam sempre, em
 * npm test. Os testes com o modelo de verdade ficam em semantic.model.ts.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { dividirEmTrechos, fundir, similaridade } from '../src/semantic.ts'
import { config, janela, semCaminhos, semFrontmatter, tentarDeNovo } from '../src/service.ts'
import { homedir } from 'node:os'
import { join } from 'node:path'

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

describe('busca semântica: linhas longas', () => {
    it('should split a line longer than a chunk, keeping every word', () => {
        const frase = 'O gradiente desce pela rede camada a camada. '
        const linha = frase.repeat(210).trim()
        const trechos = dividirEmTrechos([{ lines: ['# Aula', linha, 'depois'] }])
        const daLinha = trechos.filter(t => t.linha === 2)
        assert.ok(daLinha.length > 1, `${daLinha.length} trecho(s)`)
        assert.ok(daLinha.every(t => t.texto.length <= 800), daLinha.map(t => t.texto.length).join(', '))
        // Nada se perde no corte: juntando os pedaços, volta a linha inteira.
        assert.strictEqual(daLinha.map(t => t.texto).join(' '), linha)
        // O corte cai no fim de uma frase, não no meio de uma palavra.
        assert.ok(daLinha.slice(0, -1).every(t => t.texto.endsWith('.')))
    })

    // Sem linhas longas, os trechos precisam ser idênticos aos da versão
    // anterior: é o que mantém válidos os índices já salvos.
    it('should keep the chunks of normal lines as they were', () => {
        const versaoAnterior = (lines: string[]) => {
            const trechos: { linha: number; texto: string }[] = []
            let atual: string[] = []
            let inicio = 1
            const fechar = () => {
                const texto = atual.join('\n').trim()
                if (texto.replace(/\s/g, '').length >= 20) trechos.push({ linha: inicio, texto })
                atual = []
            }
            for (const [index, line] of lines.entries()) {
                if (!atual.length) inicio = index + 1
                atual.push(line)
                if (atual.join('\n').length >= 800) fechar()
            }
            fechar()
            return trechos
        }
        const linhas = Array.from({ length: 120 }, (_, i) => `linha ${i} ` + 'com texto de estudo '.repeat(i % 7) + (i % 11 === 0 ? '' : '.'))
        const novos = dividirEmTrechos([{ lines: linhas }]).map(({ linha, texto }) => ({ linha, texto }))
        assert.deepStrictEqual(novos, versaoAnterior(linhas))
    })
})

describe('busca híbrida: fundir', () => {
    const achado = (arquivo: string, linha = 1, pagina?: number) => ({ arquivo, linha, pagina, trecho: 'x', alertas: [] })
    const parecido = (arquivo: string, linha: number, similaridade: number) => ({ ...achado(arquivo, linha), similaridade })

    it('should rank higher the file that both searches found', () => {
        const resultado = fundir([achado('a.md'), achado('b.md')], [parecido('b.md', 9, 0.9)])
        assert.strictEqual(resultado[0].arquivo, 'b.md')
    })

    it('should not mark two pieces of the same long line as found by both searches', () => {
        const resultado = fundir([], [parecido('a.md', 7, 0.9), parecido('a.md', 7, 0.8)])
        assert.strictEqual(resultado.length, 1)
        assert.strictEqual(resultado[0].origem, 'significado')
        assert.strictEqual(resultado[0].similaridade, 0.9)
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

describe('formato do Obsidian: semFrontmatter', () => {
    it('should blank the frontmatter and keep the line numbers', () => {
        const lines = ['---', 'tags: [rag]', '---', '# Aula', 'texto']
        assert.deepStrictEqual(semFrontmatter(lines), ['', '', '', '# Aula', 'texto'])
    })

    it('should keep notes without frontmatter, or with an unclosed one, as they are', () => {
        assert.deepStrictEqual(semFrontmatter(['# Aula', '---', 'x']), ['# Aula', '---', 'x'])
        assert.deepStrictEqual(semFrontmatter(['---', 'sem fim']), ['---', 'sem fim'])
    })
})

// Gravação no Windows (PASSO 3.10): sem Windows à mão, o teste simula o erro.
describe('dados salvos: tentarDeNovo', () => {
    const erro = (code: string) => Object.assign(new Error(code), { code })

    it('should retry while the file is temporarily locked', async () => {
        let chamadas = 0
        const resultado = await tentarDeNovo(async () => {
            if (++chamadas < 3) throw erro('EPERM')
            return 'gravado'
        })
        assert.strictEqual(resultado, 'gravado')
        assert.strictEqual(chamadas, 3)
    })

    it('should give up after five attempts, and not retry other errors', async () => {
        let chamadas = 0
        await assert.rejects(tentarDeNovo(async () => { chamadas++; throw erro('EBUSY') }), /EBUSY/)
        assert.strictEqual(chamadas, 5)
        chamadas = 0
        await assert.rejects(tentarDeNovo(async () => { chamadas++; throw erro('ENOSPC') }), /ENOSPC/)
        assert.strictEqual(chamadas, 1)
    })
})

// Nenhum caminho absoluto vai para o modelo (PASSO 3.2).
describe('mensagens de erro: semCaminhos', () => {
    it('should replace the configured folders and the home folder', () => {
        assert.strictEqual(semCaminhos(`EACCES: '${join(config.notesDir, 'modulo01')}'`), `EACCES: '${join('<NOTES_DIR>', 'modulo01')}'`)
        assert.strictEqual(semCaminhos(`falhou em ${join(config.dataDir, 'duvidas.json')}`), `falhou em ${join('<DATA_DIR>', 'duvidas.json')}`)
        assert.strictEqual(semCaminhos(`ENOENT: ${join(homedir(), 'outra', 'pasta')}`), `ENOENT: ${join('~', 'outra', 'pasta')}`)
        assert.strictEqual(semCaminhos('mensagem sem caminho'), 'mensagem sem caminho')
    })
})

// Busca literal (PASSO 3.6): o trecho acompanha o termo.
describe('busca literal: janela', () => {
    it('should keep short lines as they are', () => {
        assert.strictEqual(janela('linha curta com o termo', 'termo'), 'linha curta com o termo')
    })

    it('should center long lines on the term and mark the cuts', () => {
        const linha = 'lorem ipsum '.repeat(50) + 'o termo BACKPROPAGATION aparece aqui ' + 'dolor sit '.repeat(30)
        const trecho = janela(linha, 'backpropagation')
        assert.ok(trecho.includes('BACKPROPAGATION'), trecho)
        assert.ok(trecho.startsWith('…') && trecho.endsWith('…'))
        assert.ok(trecho.length <= 202, `${trecho.length} caracteres`)
        // Termo no começo: sem "…" no início.
        assert.ok(!janela('BACKPROPAGATION ' + 'x '.repeat(200), 'backpropagation').startsWith('…'))
    })

    it('should not split a two-unit character (emoji) at the cut', () => {
        for (let deslocamento = 0; deslocamento < 4; deslocamento++) {
            const linha = 'a'.repeat(deslocamento) + '😀'.repeat(150) + ' termo ' + '😀'.repeat(150)
            const trecho = janela(linha, 'termo')
            assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(trecho), `meio emoji com deslocamento ${deslocamento}`)
        }
    })
})

