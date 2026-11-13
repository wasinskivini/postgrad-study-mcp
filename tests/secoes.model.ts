/**
 * PASSO 5.7b — AVALIAÇÃO POR SEÇÃO
 *
 * A avaliação principal (avaliacao.model.ts) usa notas curtas: cada uma vira um
 * trecho só, então ela não enxerga como os arquivos são cortados. Aqui são três
 * notas longas, com várias seções, e perguntas escritas com OUTRAS palavras
 * (nunca o título). Conta como acerto quando o 1º resultado começa dentro da
 * seção certa: o trecho devolvido fala do assunto pedido, e não de dois.
 *
 * Medido ao criar (1.2.0): sem o corte nos títulos, 1 de 18; com ele, 13 de 18
 * (nos erros, o trecho certo começa no título principal, junto da introdução).
 * O limite do teste fica um pouco abaixo, para pequenas diferenças numéricas
 * entre sistemas não derrubarem o CI.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

type Pergunta = { pergunta: string; arquivo: string; secao: string }

describe('avaliação por seção', () => {
    let root: string

    before(async () => {
        root = await mkdtemp(join(tmpdir(), 'study-notes-secoes-'))
        process.env.NOTES_DIR = resolve('tests/fixtures/secoes/notas')
        process.env.DATA_DIR = join(root, 'data')
        process.env.SEMANTIC_SEARCH = 'true'
        process.env.MODELS_DIR = process.env.MODELS_DIR ?? join(tmpdir(), 'study-notes-mcp-modelos')
    })

    after(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('should return the chunk of the right section', { timeout: 180_000 }, async () => {
        const { atualizarIndice, semanticSearch } = await import('../src/semantic.ts')
        await atualizarIndice()
        const perguntas: Pergunta[] = JSON.parse(await readFile('tests/fixtures/secoes/perguntas.json', 'utf8'))
        let acertos = 0
        const erros: string[] = []
        for (const { pergunta, arquivo, secao } of perguntas) {
            const linhas = (await readFile(join('tests/fixtures/secoes/notas', arquivo), 'utf8')).split('\n')
            const inicio = linhas.indexOf(`## ${secao}`) + 1
            assert.ok(inicio > 0, `seção "${secao}" não existe em ${arquivo}`)
            const proxima = linhas.findIndex((l, i) => i >= inicio && l.startsWith('## '))
            const fim = proxima === -1 ? linhas.length : proxima
            const [primeiro] = (await semanticSearch(pergunta)).resultados
            if (primeiro?.arquivo === join(...arquivo.split('/')) && primeiro.linha >= inicio && primeiro.linha <= fim) acertos++
            else erros.push(`"${pergunta}" → esperado ${secao}, veio ${primeiro?.arquivo}:${primeiro?.linha}`)
        }
        console.log(`\nTrecho da seção certa em 1º lugar: ${acertos}/${perguntas.length}${erros.length ? `\n${erros.join('\n')}` : ''}`)
        assert.ok(acertos >= 10, `só ${acertos} de ${perguntas.length}`)
    })
})
