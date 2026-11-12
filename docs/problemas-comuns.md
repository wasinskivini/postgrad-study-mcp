# Problemas comuns

[← Voltar ao README](../README.md)

| Sintoma | Causa e solução |
|---|---|
| `spawn npx ENOENT` ou "The command npx was not found" | O VS Code não achou o Node no PATH, o que é comum com **nvm**, que só configura o PATH no terminal. Use o caminho absoluto em `command` (veja com `which npx` ou `where npx`) ou abra o VS Code pelo terminal com `code .` |
| No Windows, o servidor não sobe (`spawn npx ENOENT` ou nada no log) | Alguns clientes não iniciam o `npx.cmd` diretamente. Use `"command": "cmd"` e `"args": ["/c", "npx", "-y", "study-notes-mcp@latest"]`. Detalhes em [clientes testados](clientes.md#windows) |
| Erro de sintaxe ou `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Node antigo. Atualize para 22.18 ou mais novo |
| O servidor aparece, mas não acha nada | Confira o `NOTES_DIR`: caminho absoluto e pasta existente. Sem a [busca por significado](busca-por-significado.md) ligada, a busca é por **texto literal**: tente outra palavra. Confira também se o [`.studynotesignore`](configuracao.md#ignorando-arquivos-e-pastas-studynotesignore) não está escondendo a pasta |
| "Language model unavailable" no chat | Problema do Copilot, não do servidor: atualize o VS Code e confira o login e o plano do Copilot |
| O modelo responde sem usar o servidor | Seja explícito: "consulte minhas anotações sobre…", ou cite a tool com `#buscar_material` |
| Digitando `/` não aparecem `gerar_quiz` nem `plano_de_revisao` | A conversa está numa sessão **Copilot CLI**, que não mostra prompts de MCP. Abra um chat na sessão **Local**, modo **Agent**, e digite `/mcp.study-notes` |
| O chat leu um arquivo que o servidor bloqueia (`.zshrc`, `package.json`...) | Quem leu foi o **próprio Copilot**, com a ferramenta embutida dele (aparece "Read arquivo", não "Ran ler_material"). As proteções deste servidor valem só para o que passa por ele. Para testar o servidor, cite a tool: `#ler_material` |
| No Claude Code, `/gerar_quiz` não mostra opções de módulo | O Claude Code não usa o autocompletar do MCP, e separa os argumentos por espaço. Digite só o número ou um trecho do nome, sem espaços (`/mcp__study-notes-mcp__gerar_quiz 3`), ou deixe vazio para o assistente perguntar |
| `Tool 'tool_search' is not supported with ...` no Copilot | Erro do Copilot quando há tools demais ligadas e o modelo escolhido não aceita a busca interna de tools. Troque o modelo no seletor do chat ou desmarque os servidores que não usa em **Configure Tools** |
| No Codex, `/gerar_quiz` não aparece | A extensão do Codex não exibe prompts de servidores MCP. Peça o quiz em texto. Detalhes em [clientes testados](clientes.md#codex-por-que-os-prompts-não-aparecem) |
| Erro dizendo que `duvidas.json` (ou `progresso.json`) está com o JSON inválido | O arquivo em `DATA_DIR` foi editado com erro de formato. O servidor não o altera para não apagar as suas dúvidas: corrija o erro (um editor como o VS Code aponta a linha) ou mova o arquivo para outro lugar para começar uma lista nova |
| Parei o servidor e ele voltou sozinho | O VS Code reinicia servidores a cada conversa nova. Para desligar de verdade, remova a entrada do `mcp.json` |
| A busca avisa que "a busca por significado não está disponível" | Falta a biblioteca de embeddings ou não deu para baixar o modelo. Veja [como ligar](busca-por-significado.md#como-ligar). Enquanto isso, a busca literal funciona normalmente |

Para ver o que o servidor está fazendo: **MCP: List Servers** → `study-notes-mcp` → **Show Output**. A primeira linha mostra a versão em uso (`Study Notes MCP Server 1.0.2 running on stdio`). No terminal, `npx -y study-notes-mcp@latest --version` mostra a versão mais recente. Clicando no bloco "Ran buscar_material" de uma resposta do chat, dá para ver exatamente o que o servidor devolveu.

Não achou o seu problema aqui? Abra uma [issue](https://github.com/wasinskivini/study-notes-mcp/issues/new/choose), sem colar caminhos ou dados pessoais.
