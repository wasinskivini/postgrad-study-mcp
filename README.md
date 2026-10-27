# postgrad-study-mcp

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) para apoiar os estudos da pós: busca nas suas anotações, registra dúvidas, acompanha o progresso das aulas e gera quizzes e planos de revisão — disponível em **qualquer projeto** aberto no VS Code (ou em outro cliente MCP).

---

## O que o servidor oferece

| Tipo | Nome | Descrição |
|---|---|---|
| 🔧 Tool | `listar_modulos` | Lista as pastas de módulos dentro de `NOTES_DIR` |
| 🔧 Tool | `buscar_anotacao` | Busca um termo nos arquivos `.md` e `.txt` (até 20 resultados com arquivo, linha e trecho) |
| 🔧 Tool | `ler_anotacao` | Lê um arquivo de anotação completo |
| 🔧 Tool | `registrar_duvida` | Salva uma dúvida para revisar depois |
| 🔧 Tool | `marcar_aula_concluida` | Marca uma aula como concluída |
| 📄 Resource | `pos://duvidas` | Dúvidas registradas (JSON) |
| 📄 Resource | `pos://progresso` | Aulas concluídas por módulo (JSON) |
| 💬 Prompt | `gerar_quiz` | Quiz de múltipla escolha sobre um módulo, baseado nas suas anotações |
| 💬 Prompt | `plano_de_revisao` | Plano de revisão da semana a partir das dúvidas e do progresso |

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `NOTES_DIR` | `~/Documents` | Pasta raiz das anotações (cada subpasta é um módulo) |
| `DATA_DIR` | `~/.postgrad-study-mcp` | Onde ficam `duvidas.json` e `progresso.json` |

Pastas ocultas e `node_modules`, `.git`, `dist`, `build` e `coverage` são ignoradas na busca. `ler_anotacao` recusa caminhos fora de `NOTES_DIR`.

---

## Pré-requisitos e instalação

- **Node.js v22.6+** (roda TypeScript direto, sem build)

```bash
npm install
```

## Usando no VS Code (em todos os projetos)

Adicione ao `mcp.json` de usuário (`Cmd+Shift+P` → **MCP: Open User Configuration**):

```json
{
  "servers": {
    "postgrad-study-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["--experimental-strip-types", "/CAMINHO/ABSOLUTO/postgrad-study-mcp/src/index.ts"],
      "env": { "NOTES_DIR": "/CAMINHO/DAS/SUAS/ANOTACOES" }
    }
  }
}
```

> Se o Node foi instalado via **nvm** e o VS Code acusar `spawn node ENOENT`, use o caminho absoluto do binário em `command` (veja com `which node`).

Depois, em **MCP: List Servers**, inicie o `postgrad-study-mcp` e use o Copilot Chat no modo **Agent**:

```
O que eu anotei sobre embeddings?
```

```
Registre uma dúvida no modulo03: quando usar resource em vez de tool?
```

Os prompts aparecem digitando `/` no chat, por exemplo `/mcp.postgrad-study-mcp.gerar_quiz`.

---

## Desenvolvimento

| Script | Descrição |
|---|---|
| `npm start` | Inicia o servidor |
| `npm run dev` | Inicia com file-watch e inspector do Node.js |
| `npm test` | Roda os testes de integração |
| `npm run test:dev` | Testes em modo watch |
| `npm run mcp:inspect` | Abre o MCP Inspector usando as anotações de exemplo de `tests/fixtures` |

Os testes sobem o servidor via stdio com `NOTES_DIR=tests/fixtures/notas` e um `DATA_DIR` temporário, então não tocam nos seus dados reais.

## Estrutura

```
src/
  index.ts     # Ponto de entrada (transporte stdio)
  mcp.ts       # Registro de tools, resources e prompts
  service.ts   # Leitura das anotações e persistência de dúvidas/progresso
tests/
  fixtures/    # Anotações de exemplo
  helpers.ts   # Client MCP de teste
  mcp.test.ts  # Testes de integração
```
