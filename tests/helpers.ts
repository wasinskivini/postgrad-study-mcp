import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function createTestClient (notesDir: string, dataDir: string) {
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
        }
    })

    const client = new Client({
        name: 'test-client',
        version: '1.0.1'
    }, {
        capabilities: {}
    })

    await client.connect(transport)
    return client
}
