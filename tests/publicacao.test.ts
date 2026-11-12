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

    it('should list the current version in the CHANGELOG', async () => {
        const { version } = await lerJson('package.json')
        const changelog = await readFile('CHANGELOG.md', 'utf8')
        assert.ok(changelog.includes(`## [${version}]`), `CHANGELOG.md sem a seção da versão ${version}`)
    })
})
