# Problemas comuns

[← Voltar ao README](../README.md)

| Sintoma | Causa e solução |
|---|---|
| `spawn npx ENOENT` ou "The command npx was not found" | O VS Code não achou o Node no PATH, o que é comum com **nvm**, que só configura o PATH no terminal. Use o caminho absoluto em `command` (veja com `which npx` ou `where npx`) ou abra o VS Code pelo terminal com `code .` |
| Erro de sintaxe ou `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Node antigo. Atualize para 22.18 ou mais novo |
| O servidor aparece, mas não acha nada | Confira o `NOTES_DIR`: caminho absoluto e pasta existente. Sem a [busca por significado](busca-por-significado.md) ligada, a busca é por **texto literal**: tente outra palavra. Confira também se o [`.studynotesignore`](configuracao.md#ignorando-arquivos-e-pastas-studynotesignore) não está escondendo a pasta |
| "Language model unavailable" no chat | Problema do Copilot, não do servidor: atualize o VS Code e confira o login e o plano do Copilot |
| O modelo responde sem usar o servidor | Seja explícito: "consulte minhas anotações sobre…", ou cite a tool com `#buscar_material` |
| Digitando `/` não aparecem `gerar_quiz` nem `plano_de_revisao` | A conversa está numa sessão **Copilot CLI**, que não mostra prompts de MCP. Abra um chat na sessão **Local**, modo **Agent**, e digite `/mcp.study-notes` |
| O chat leu um arquivo que o servidor bloqueia (`.zshrc`, `package.json`...) | Quem leu foi o **próprio Copilot**, com a ferramenta embutida dele (aparece "Read arquivo", não "Ran ler_material"). As proteções deste servidor valem só para o que passa por ele. Para testar o servidor, cite a tool: `#ler_material` |
| Parei o servidor e ele voltou sozinho | O VS Code reinicia servidores a cada conversa nova. Para desligar de verdade, remova a entrada do `mcp.json` |
| A busca avisa que "a busca por significado não está disponível" | Falta a biblioteca de embeddings ou não deu para baixar o modelo. Veja [como ligar](busca-por-significado.md#como-ligar). Enquanto isso, a busca literal funciona normalmente |

Para ver o que o servidor está fazendo: **MCP: List Servers** → `study-notes-mcp` → **Show Output**. Clicando no bloco "Ran buscar_material" de uma resposta do chat, dá para ver exatamente o que o servidor devolveu.

Não achou o seu problema aqui? Abra uma [issue](https://github.com/wasinskivini/study-notes-mcp/issues/new/choose), sem colar caminhos ou dados pessoais.
