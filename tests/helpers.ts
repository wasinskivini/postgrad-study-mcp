/**
 * PASSO 5.1 — O CLIENTE DE TESTE
 *
 * Os testes não chamam as funções do service.ts diretamente: eles sobem o
 * servidor de verdade e conversam com ele pelo protocolo MCP, exatamente como o
 * VS Code faz. Assim o teste cobre o caminho inteiro (PASSO 1 → 2 → 3 → 4).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// notesDir/dataDir apontam para pastas temporárias: os testes nunca tocam nas
// suas anotações ou dados reais. extraEnv permite testar configurações, como
// INCLUDE_PDF=false.
export async function createTestClient (notesDir: string, dataDir: string, extraEnv: Record<string, string> = {}) {
    // O transporte do lado do cliente: inicia "node src/index.ts" como processo
    // filho e fala com ele por stdin/stdout (o mesmo stdio do PASSO 1.1).
    const transport = new StdioClientTransport({
        command: 'node',
        args: [
            '--experimental-strip-types',
            'src/index.ts'
        ],
        env: {
            ...process.env as Record<string, string>,
            NOTES_DIR: notesDir,
            DATA_DIR: dataDir,
            ...extraEnv,
        }
    })

    const client = new Client({
        name: 'test-client',
        version: '1.0.1'
    }, {
        capabilities: {}
    })

    // connect faz o handshake (initialize). Depois disso dá para chamar
    // client.callTool, client.readResource, client.getPrompt...
    await client.connect(transport)
    return client
}
