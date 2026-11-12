/**
 * PASSO 5.8 — A PUBLICAÇÃO
 *
 * O MCP Registry recusa o servidor se o server.json e o package.json não
 * baterem. Estes testes pegam os erros mais comuns antes de publicar:
 * nome diferente do mcpName, versões diferentes e descrição longa demais.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFile } from 'node:fs/promises'

const lerJson = async (arquivo: string) => JSON.parse(await readFile(arquivo, 'utf8'))

describe('publicação', () => {
    it('should keep server.json in sync with package.json', async () => {
        const pacote = await lerJson('package.json')
        const servidor = await lerJson('server.json')
        assert.strictEqual(servidor.name, pacote.mcpName, 'server.json "name" precisa ser igual ao "mcpName"')
        assert.match(pacote.mcpName, /^io\.github\.wasinskivini\//, 'com login do GitHub, o nome começa com io.github.<usuário>/')
        assert.strictEqual(servidor.version, pacote.version)
        assert.strictEqual(servidor.packages[0].identifier, pacote.name)
        assert.strictEqual(servidor.packages[0].version, pacote.version)
    })

    it('should keep the Registry description within 100 characters', async () => {
        const { description } = await lerJson('server.json')
        assert.ok(description.length <= 100, `descrição com ${description.length} caracteres`)
    })

    // Uma dependência que exige um Node mais novo que o nosso mínimo funciona
    // nos testes até o dia em que usar algo novo, e aí quebra sem aviso.
    it('should only depend on packages that support the minimum Node version', async () => {
        const versao = (texto: string) => texto.replace(/^>=\s*/, '').split('.').map(Number)
        const maior = (a: number[], b: number[]) => {
            for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
            return false
        }
        const pacote = await lerJson('package.json')
        const minimo = versao(pacote.engines.node)
        for (const dependencia of Object.keys(pacote.dependencies)) {
            const exigido = (await lerJson(`node_modules/${dependencia}/package.json`)).engines?.node
            // Só confere o formato simples ">=X.Y.Z"; outros formatos ficam para a revisão manual.
            if (!exigido || !/^>=\s*\d+(\.\d+){0,2}$/.test(exigido.trim())) continue
            assert.ok(!maior(versao(exigido.trim()), minimo), `${dependencia} exige Node ${exigido}, e o projeto promete ${pacote.engines.node}`)
        }
    })

    it('should list the current version in the CHANGELOG', async () => {
        const { version } = await lerJson('package.json')
        const changelog = await readFile('CHANGELOG.md', 'utf8')
        assert.ok(changelog.includes(`## [${version}]`), `CHANGELOG.md sem a seção da versão ${version}`)
    })
})
