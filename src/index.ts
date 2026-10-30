#!/usr/bin/env node
/**
 * ============================================================================
 * PASSO 1 — PONTO DE ENTRADA (comece a leitura por aqui)
 * ============================================================================
 *
 * Este é o arquivo que o cliente MCP (ex.: VS Code/Copilot) executa:
 *
 *     npx -y postgrad-study-mcp                       (pacote do npm, compilado em dist/)
 *     node /caminho/postgrad-study-mcp/src/index.ts   (direto do código-fonte)
 *
 * A primeira linha (#!) diz ao sistema para rodar o arquivo com o Node quando
 * ele é chamado como comando (o "bin" do package.json).
 *
 * Ele só faz uma coisa: liga o servidor (montado no PASSO 2, em mcp.ts) a um
 * "transporte" — o canal por onde as mensagens do protocolo trafegam.
 *
 * Roteiro de leitura do projeto:
 *   PASSO 1  src/index.ts    → inicialização e transporte (este arquivo)
 *   PASSO 2  src/mcp.ts      → o que o servidor oferece: tools, resources e prompts
 *   PASSO 3  src/service.ts  → as regras: busca, leitura de arquivos/PDFs, dados
 *   PASSO 4  src/safety.ts   → as proteções: segredos e prompt injection
 *   PASSO 5  tests/          → como tudo é testado de ponta a ponta
 *   PASSO 6  src/semantic.ts → (opcional) busca por significado com embeddings
 */

// 1.1 — O transporte stdio: o cliente escreve as requisições no stdin deste
//       processo e lê as respostas no stdout. Por isso NADA além do protocolo
//       pode ser escrito no stdout (logs vão para o stderr, ver 1.3).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// O servidor já com tudo registrado (PASSO 2).
import { server } from "./mcp.ts";
// A configuração lida das variáveis de ambiente (PASSO 3.2).
import { config } from "./service.ts";
// A busca semântica opcional (PASSO 6).
import { atualizarIndice } from "./semantic.ts";

// Liga o servidor ao transporte stdio e, se pedido, começa a montar o índice
// semântico em segundo plano.
async function main() {
    const transport = new StdioServerTransport()
    // 1.2 — Conecta o servidor ao transporte. A partir daqui o servidor espera o
    //       "handshake" do cliente (mensagem initialize), responde com seu nome,
    //       versão, capacidades e instructions, e passa a atender pedidos como
    //       tools/list e tools/call.
    await server.connect(transport)
    // 1.3 — Log no stderr (console.error), nunca no stdout. No VS Code ele aparece
    //       em MCP: List Servers → postgrad-study-mcp → Show Output.
    console.error(`Postgrad Study MCP Server running on stdio (notas: ${config.notesDir})`)
    // 1.4 — Com SEMANTIC_SEARCH=true, começa a montar o índice em segundo plano
    //       (sem await): o servidor já atende pedidos enquanto isso.
    if (config.semanticSearch) void atualizarIndice()
}

// 1.5 — Qualquer erro na inicialização encerra o processo com código 1, para o
//       cliente perceber que o servidor não subiu (em vez de ficar travado).
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
