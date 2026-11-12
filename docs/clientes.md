# Clientes testados

[← Voltar ao README](../README.md)

O servidor segue o padrão MCP, então as **tools** funcionam igual em qualquer cliente. O que muda é como cada cliente mostra os **prompts** (`gerar_quiz`, `plano_de_revisao`) e se oferece **autocompletar** nos argumentos.

| Recurso | VS Code + Copilot | Claude Code | Codex (extensão do VS Code) |
|---|---|---|---|
| As 7 tools | ✅ | ✅ | ✅ |
| Proteções (`.env`, segredos, `.studynotesignore`) | ✅ | ✅ | ✅ |
| Prompts (`/gerar_quiz`, `/plano_de_revisao`) | ✅ | ✅ | ❌ não são exibidos ([por quê](#codex-por-que-os-prompts-não-aparecem)) |
| Autocompletar do módulo no quiz | ✅ | ❌ digite o número ou um trecho do nome | — |

Testado em novembro de 2026, com o VS Code e as extensões da época (Codex: extensão `openai.chatgpt` 26.1106, `codex-cli` 0.167). Clientes mudam rápido: se algo aqui estiver desatualizado, abra uma [issue](https://github.com/wasinskivini/study-notes-mcp/issues/new/choose).

Os exemplos usam `"/Users/seu-usuario/Documents/Estudos"` como `NOTES_DIR`: troque pelo caminho absoluto da sua pasta. Para ligar a [busca por significado](busca-por-significado.md), acrescente `SEMANTIC_SEARCH=true` e o segundo pacote, como mostrado naquele documento.

## VS Code + GitHub Copilot

A configuração está no [passo 3 do README](../README.md#instalação-passo-a-passo). Para usar em todos os projetos ou só em um, veja a [configuração](configuracao.md#todos-os-projetos-ou-só-um).

- Use o chat numa sessão **Local**, no modo **Agent**. Em outros tipos de sessão (Copilot CLI, Claude), os prompts não aparecem ou o servidor só sobe depois da primeira mensagem.
- Prompts: digite `/` e escolha `mcp.study-notes-mcp.gerar_quiz`. Os módulos aparecem como sugestão enquanto você digita, e a quantidade sugere 5, 10, 15 e 20.
- Com muitos servidores MCP ligados, desmarque os que não usa em **Configure Tools** (ícone de ferramentas no chat). Alguns modelos falham com `Tool 'tool_search' is not supported` quando há tools demais.

## Claude Code

No terminal:

```bash
claude mcp add study-notes-mcp --scope user \
  -e NOTES_DIR="/Users/seu-usuario/Documents/Estudos" \
  -- npx -y study-notes-mcp@latest
```

- `--scope user` deixa o servidor disponível em todas as pastas. Para desfazer: `claude mcp remove study-notes-mcp --scope user`.
- Abra uma **conversa nova** depois de configurar: os servidores são carregados no início da sessão. O comando `/mcp` mostra se ele está conectado.
- Prompts: `/mcp__study-notes-mcp__gerar_quiz`. O Claude Code não tem autocompletar e separa os argumentos por espaço, então digite o módulo sem espaços: o número (`/mcp__study-notes-mcp__gerar_quiz 3`), um trecho do nome (`mcp`) ou nada, para o assistente perguntar. O segundo argumento é a quantidade (`3 10` = módulo 3, 10 perguntas).

## Codex

No arquivo `~/.codex/config.toml` (crie se não existir):

```toml
[mcp_servers.study-notes-mcp]
command = "npx"
args = ["-y", "study-notes-mcp@latest"]
env = { NOTES_DIR = "/Users/seu-usuario/Documents/Estudos" }
# Na primeira vez o npx baixa o pacote, o que pode passar do limite padrão.
startup_timeout_sec = 60
```

- Recarregue o VS Code (**Developer: Reload Window**) e abra uma conversa nova. No painel, `/mcp` lista o servidor com **Status: enabled** e **Auth: Unsupported**. "Unsupported" se refere ao login por OAuth, que só existe em servidores remotos: para um servidor local, é o esperado.
- Se o Codex não achar o `npx` (comum com **nvm**), use o caminho completo em `command`, que você vê com `which npx` (ou `where npx` no Windows). Esse caminho muda quando você troca a versão do Node pelo nvm.
- O Codex pede aprovação na primeira chamada de cada tool.

### Codex: por que os prompts não aparecem

O servidor anuncia os prompts normalmente (o log do Codex registra `prompts: Some(PromptsCapability ...)` na conexão), mas a extensão do Codex não os mostra. No código da extensão testada, o pedido de lista de prompts é respondido com uma lista vazia fixa, sem consultar o servidor, e a interface não tem um comando para pedir um prompt (só para chamar tools e ler resources). É uma limitação do cliente, não do servidor, e pode mudar em versões futuras.

Enquanto isso, peça o quiz em texto, que dá o mesmo resultado:

```
Crie um quiz de 5 perguntas sobre o módulo 3 do meu material usando as tools
do study-notes-mcp. Cite a fonte de cada resposta e mostre as respostas no final.
```

## Outros clientes

Qualquer cliente que fale MCP por stdio deve conseguir usar as tools: Claude Desktop, Cursor, Windsurf e outros. A configuração costuma ser a mesma ideia (comando `npx`, argumento `-y study-notes-mcp@latest` e a variável `NOTES_DIR`), mas eles não foram testados. Se você testar, conte numa [issue](https://github.com/wasinskivini/study-notes-mcp/issues/new/choose) para incluirmos aqui.
