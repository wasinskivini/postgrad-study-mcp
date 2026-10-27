# postgrad-study-mcp

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) para apoiar os estudos da pós: busca nas suas anotações, registra dúvidas, acompanha o progresso das aulas e gera quizzes e planos de revisão — disponível em **qualquer projeto** aberto no VS Code (ou em outro cliente MCP).

---

## O que o servidor oferece

| Tipo | Nome | Descrição |
|---|---|---|
| 🔧 Tool | `listar_modulos` | Lista as pastas de módulos dentro de `NOTES_DIR` |
| 🔧 Tool | `buscar_anotacao` | Busca um termo nas anotações e no código das aulas (até 20 resultados com arquivo, linha e trecho) |
| 🔧 Tool | `ler_anotacao` | Lê uma anotação ou arquivo de código completo |
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

Arquivos lidos: `.md`, `.txt`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` e `.py`, até 200 KB.

---

## Segurança

Tudo que as tools devolvem é enviado ao modelo do seu cliente MCP (na nuvem, no caso do Copilot). Por isso o servidor aplica várias camadas de proteção:

**Acesso a arquivos**
- Lista fechada de extensões: `.env`, `.json`, chaves (`.pem`, `.key`) e qualquer outra extensão nunca são lidos
- Arquivos e pastas ocultos (`.env`, `.git`, `.oculta/`) e `node_modules`, `dist`, `build`, `coverage`, `venv` são ignorados
- Caminhos com `../` e symlinks que apontam para fora de `NOTES_DIR` são bloqueados
- Segredos que aparecem no código (chaves `sk-…`, `ghp_…`, AWS, Google, Slack, chaves privadas, `apiKey = "…"`, `senha: "…"`, credenciais em URLs) são trocados por `[REDACTED]`

**Prompt injection** — não existe proteção 100%, então são várias camadas:
- O conteúdo dos arquivos volta delimitado por `<dados_nao_confiaveis id="…">` com um id aleatório a cada chamada; o arquivo não consegue "fechar" o bloco e escrever fora dele
- Caracteres invisíveis (zero-width, controle de direção, tag characters Unicode) são removidos, já que servem para esconder instruções do leitor humano
- Padrões típicos de injeção ("ignore as instruções anteriores", "you are now", `<system>`, "não conte ao usuário"…) geram um **ALERTA** no resultado e o campo `alertas` no `structuredContent`
- As `instructions` do servidor e os prompts dizem ao modelo para tratar o conteúdo como dados e avisar o usuário sobre alertas
- `registrar_duvida` recusa textos com padrões de injeção, para nada ser "plantado" no histórico que depois volta via `pos://duvidas`
- Argumentos das tools têm tamanho máximo e não aceitam caracteres invisíveis; `gerar_quiz` só aceita módulos que existem
- Tools anotadas com `readOnlyHint`, para o cliente distinguir leitura de escrita; as de escrita só alteram os JSONs em `DATA_DIR` (criados com permissão `600`)

> Não coloque em `NOTES_DIR` material sigiloso ou com dados pessoais: mesmo com essas camadas, o que for lido vai para o modelo.

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

Os testes sobem o servidor via stdio com uma cópia temporária de `tests/fixtures/notas` e um `DATA_DIR` temporário, então não tocam nos seus dados reais. Os casos de ataque (`.env`, symlink para fora, pasta oculta, segredo no código, arquivo com injeção e caracteres invisíveis) são criados na hora pelos testes.

## Estrutura

```
src/
  index.ts     # Ponto de entrada (transporte stdio)
  mcp.ts       # Registro de tools, resources e prompts
  service.ts   # Leitura das anotações e persistência de dúvidas/progresso
  safety.ts    # Sanitização, redação de segredos e detecção de prompt injection
tests/
  fixtures/    # Anotações de exemplo
  helpers.ts   # Client MCP de teste
  mcp.test.ts  # Testes de integração
```
