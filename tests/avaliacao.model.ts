/**
 * PASSO 5.7 — AVALIAÇÃO DA BUSCA
 *
 * Mede se a busca acha o arquivo certo. Sem medir, trocar o tamanho dos trechos
 * ou o modelo vira opinião. A conta é simples: para cada pergunta de
 * tests/fixtures/avaliacao/perguntas.json, em que posição aparece o arquivo
 * esperado? Duas réguas: em 1º lugar ("top 1", a exigente) e entre os 5
 * primeiros ("top 5"). Com só 12 arquivos o top 5 é frouxo, por isso a regra
 * do teste vale para o top 1.
 *
 * As mesmas perguntas passam por três buscas:
 *   literal   → só o texto exato (PASSO 3.6)
 *   semântica → só o significado (PASSO 6.5)
 *   híbrida   → as duas juntas (PASSO 6.6), a que a tool buscar_material usa
 *
 * As perguntas são de três tipos: nome exato (onde a literal brilha), outras
 * palavras e outro idioma (onde a semântica brilha). Se a híbrida não ganhar de
 * nenhuma das duas sozinha, juntá-las não valeu a pena.
 *
 * Roda com npm run test:semantic: usa o modelo de verdade (~145 MB na primeira vez).
 * O corpus é pequeno (12 arquivos escritos para o teste): serve para comparar
 * mudanças na busca, não para prometer um percentual no seu material.
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

type Pergunta = { pergunta: string; esperado: string; tipo: string }
// A lista de arquivos devolvida por uma busca, do 1º ao 5º resultado.
type Busca = (pergunta: string) => Promise<string[]>

describe('avaliação da busca', () => {
    let root: string
    let perguntas: Pergunta[]
    const buscas: Record<'literal' | 'semantica' | 'hibrida', Busca> = {} as never

    before(async () => {
        root = await mkdtemp(join(tmpdir(), 'postgrad-avaliacao-'))
        // A configuração é lida das variáveis de ambiente quando o service.ts é
        // carregado; por isso elas são definidas ANTES do import dinâmico.
        process.env.NOTES_DIR = resolve('tests/fixtures/avaliacao/notas')
        process.env.DATA_DIR = join(root, 'data')
        process.env.SEMANTIC_SEARCH = 'true'
        process.env.MODELS_DIR = process.env.MODELS_DIR ?? join(tmpdir(), 'postgrad-study-mcp-modelos')
        const { searchNotes } = await import('../src/service.ts')
        const { atualizarIndice, semanticSearch, buscaHibrida } = await import('../src/semantic.ts')
        await atualizarIndice()
        perguntas = JSON.parse(await readFile('tests/fixtures/avaliacao/perguntas.json', 'utf8'))

        const arquivos = (resultados: { arquivo: string }[]) => resultados.slice(0, 5).map(r => r.arquivo)
        buscas.literal = async p => arquivos(await searchNotes(p))
        buscas.semantica = async p => arquivos((await semanticSearch(p)).resultados)
        buscas.hibrida = async p => arquivos((await buscaHibrida(p)).resultados)
    })

    after(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('should find the right file more often with the hybrid search', { timeout: 180_000 }, async () => {
        // acertos[busca][régua][grupo]: régua é 'top1' ou 'top5'; grupo é o tipo da pergunta ou 'todas'.
        const acertos: Record<string, Record<string, Record<string, number>>> = {}
        const totais: Record<string, number> = {}
        const erros: string[] = []
        for (const { pergunta, esperado, tipo } of perguntas) {
            totais[tipo] = (totais[tipo] ?? 0) + 1
            totais.todas = (totais.todas ?? 0) + 1
            for (const [nome, buscar] of Object.entries(buscas)) {
                const arquivos = await buscar(pergunta)
                const alvo = join(...esperado.split('/'))
                for (const [regua, achou] of [['top1', arquivos[0] === alvo], ['top5', arquivos.includes(alvo)]] as const) {
                    acertos[nome] ??= { top1: {}, top5: {} }
                    for (const grupo of [tipo, 'todas']) acertos[nome][regua][grupo] = (acertos[nome][regua][grupo] ?? 0) + (achou ? 1 : 0)
                }
                if (nome === 'hibrida' && arquivos[0] !== alvo) erros.push(`"${pergunta}" → esperado ${esperado}, veio ${arquivos[0]}`)
            }
        }

        // A tabela aparece na saída do teste (comentários do TAP).
        const grupos = Object.keys(totais).sort((a, b) => (a === 'todas' ? 1 : b === 'todas' ? -1 : a.localeCompare(b)))
        for (const regua of ['top1', 'top5'] as const) {
            const linhas = grupos.map(grupo => `${grupo.padEnd(16)} ${Object.keys(buscas).map(nome => `${nome} ${acertos[nome][regua][grupo] ?? 0}/${totais[grupo]}`.padEnd(18)).join('')}`)
            console.log(`\nAcerto no ${regua === 'top1' ? '1º lugar' : 'top 5'} (${perguntas.length} perguntas)\n${linhas.join('\n')}`)
        }
        if (erros.length) console.log(`\nA híbrida não pôs em 1º lugar:\n${erros.join('\n')}`)

        const total = totais.todas
        const { literal, semantica, hibrida } = acertos
        assert.ok(hibrida.top1.todas >= literal.top1.todas, 'a híbrida deve ganhar da literal')
        assert.ok(hibrida.top1.todas >= semantica.top1.todas, 'a híbrida deve ganhar da semântica')
        assert.ok(hibrida.top5.todas / total >= 0.9, `híbrida acertou só ${hibrida.top5.todas} de ${total} no top 5`)
    })
})
