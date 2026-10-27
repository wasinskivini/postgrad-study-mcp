# postgrad-study-mcp

[![test](https://github.com/wasinskivini/postgrad-study-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/wasinskivini/postgrad-study-mcp/actions/workflows/test.yml)

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) para apoiar os estudos da pós: busca nas suas anotações, no código e nos PDFs das aulas, registra dúvidas, acompanha o progresso e gera quizzes e planos de revisão — disponível em **qualquer projeto** aberto no VS Code (ou em outro cliente MCP).

> **O servidor não traz conteúdo nenhum.** Ele roda no seu computador e busca na **sua** pasta de estudos. Cada pessoa aponta para a própria pasta; ninguém acessa os arquivos de ninguém.

> 🎓 **Projeto educacional.** Criado durante a pós-graduação em Engenharia de Software com IA Aplicada para praticar a construção de servidores MCP e apoiar os estudos. Não é um produto oficial do curso nem da instituição, não tem garantia de funcionamento (veja a [licença](LICENSE)) e não substitui o material e as orientações dos professores.

---

## Instalação (passo a passo)

### 1. Pré-requisitos

- **Node.js 22.18 ou mais novo** — confira com `node -v` (o servidor roda TypeScript direto, sem build)
- **VS Code** com **GitHub Copilot** (o plano Free funciona) ou outro cliente MCP
- **Git**

### 2. Baixe e instale

```bash
git clone https://github.com/wasinskivini/postgrad-study-mcp.git
cd postgrad-study-mcp
npm install
npm test        # opcional: confere se está tudo funcionando
```

Guarde o caminho completo da pasta: rode `pwd` (Mac/Linux) ou `cd` (Windows).

### 3. Monte sua pasta de estudos

Escolha **uma pasta** com o que você quer consultar — ela vira o `NOTES_DIR`. Cada subpasta de primeiro nível é tratada como um módulo. Por exemplo:

```
Pós IA/
  modulo01-fundamentos/     ← suas anotações (.md, .txt)
  modulo03-mcp/             ← PDFs das aulas que você baixou
  repo-do-curso/            ← clone do repositório do curso (código .ts/.js/.py)
```

Não precisa reorganizar nada: aponte para a pasta onde você já guarda o material. Arquivos novos aparecem na próxima busca, sem reiniciar.

> ⚠️ **Material do curso é seu, não do repositório.** PDFs, slides e gravações costumam ser protegidos por direitos autorais: mantenha-os só na sua pasta local e **nunca** faça commit deles aqui ou em outro repositório público.

### 4. Configure o VS Code

Abra `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows/Linux) → **MCP: Open User Configuration** e adicione o servidor dentro de `"servers"`. Configurando no nível de usuário, ele fica disponível em **todos** os projetos.

**Mac / Linux**

```json
{
  "servers": {
    "postgrad-study-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["--experimental-strip-types", "/Users/seu-usuario/postgrad-study-mcp/src/index.ts"],
      "env": {
        "NOTES_DIR": "/Users/seu-usuario/Documents/Pós IA",
        "INCLUDE_PDF": "true"
      }
    }
  }
}
```

**Windows** (use `/` ou `\\` nos caminhos)

```json
{
  "servers": {
    "postgrad-study-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["--experimental-strip-types", "C:/Users/seu-usuario/postgrad-study-mcp/src/index.ts"],
      "env": {
        "NOTES_DIR": "C:/Users/seu-usuario/Documents/Pos IA",
        "INCLUDE_PDF": "true"
      }
    }
  }
}
```

Os caminhos precisam ser **absolutos**: o servidor roda fora da pasta do projeto.

### 5. Inicie e teste

1. `Cmd/Ctrl+Shift+P` → **MCP: List Servers** → `postgrad-study-mcp` → **Start Server**
2. Em **Show Output**, confira se aparece `Discovered 5 tools`
3. Abra o Copilot Chat no modo **Agent** e pergunte algo sobre o seu material

Na primeira chamada de cada tool o VS Code pede permissão — clique em **Allow**. Clicando no bloco "Ran buscar_anotacao" da resposta, dá para ver exatamente o que o servidor devolveu.

### Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `spawn node ENOENT` ou "The command node was not found" | O VS Code não achou o Node no PATH — comum com **nvm**, que só configura o PATH no terminal. Use o caminho absoluto do binário em `command` (veja com `which node` / `where node`) ou abra o VS Code pelo terminal com `code .` |
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Node antigo. Atualize para 22.18+ |
| Servidor aparece mas não acha nada | Confira o `NOTES_DIR` (caminho absoluto, pasta existe). Lembre que a busca é por **texto literal**: tente outra palavra |
| "Language model unavailable" no chat | Problema do Copilot, não do servidor: atualize o VS Code e confira o login/plano do Copilot |
| O modelo responde sem usar o servidor | Seja explícito: "consulte minhas anotações sobre…" ou cite a tool com `#buscar_anotacao` |
| Parei o servidor e ele voltou sozinho | O VS Code reinicia servidores a cada conversa nova. Para desligar de verdade, remova a entrada do `mcp.json` |

---

## Exemplos de uso

Com o servidor rodando, no Copilot Chat (modo **Agent**):

| Você pede | O servidor faz |
|---|---|
| `O que eu anotei sobre embeddings?` | `buscar_anotacao` em anotações, código e PDFs |
| `Busque "chunking" só nos PDFs e leia a página onde aparece` | `buscar_anotacao` com `tipos: ["pdf"]` → `ler_anotacao` com `paginas` |
| `Como foi implementado o registerTool nas aulas? Procure só no código` | `buscar_anotacao` com `tipos: ["codigo"]` → `ler_anotacao` |
| `Registre uma dúvida no modulo03: quando usar resource em vez de tool?` | `registrar_duvida` |
| `Marque a aula 05 do modulo03 como concluída` | `marcar_aula_concluida` |

Os prompts aparecem digitando `/` no chat: `/mcp.postgrad-study-mcp.gerar_quiz` e `/mcp.postgrad-study-mcp.plano_de_revisao`.

### Como o quiz e o plano de revisão funcionam

O servidor **não tem LLM**: um prompt MCP é só uma mensagem pronta. Ao escolher `gerar_quiz`, o servidor valida o módulo e devolve um texto que pede ao modelo do seu chat para buscar suas anotações (com as tools deste servidor) e montar as perguntas. Quem escreve o quiz é o modelo.

Por isso os prompts pedem que **cada resposta venha com a fonte** — `arquivo:linha` ou `arquivo, p. N` — e que o modelo diga "não encontrei" em vez de completar com conhecimento geral. No quiz, as fontes aparecem só junto das respostas, no final, para não entregar o gabarito. Isso não impede o modelo de errar, mas torna qualquer resposta suspeita conferível em segundos.

---

## O que o servidor oferece

| Tipo | Nome | Descrição |
|---|---|---|
| 🔧 Tool | `listar_modulos` | Lista as pastas de módulos dentro de `NOTES_DIR` |
| 🔧 Tool | `buscar_anotacao` | Busca um termo nas anotações, no código e nos PDFs das aulas (até 20 resultados com arquivo, linha, página e trecho), com filtro opcional por `tipos` |
| 🔧 Tool | `ler_anotacao` | Lê uma anotação ou arquivo de código completo, ou um PDF por páginas (até 5 por vez) |
| 🔧 Tool | `registrar_duvida` | Salva uma dúvida para revisar depois |
| 🔧 Tool | `marcar_aula_concluida` | Marca uma aula como concluída |
| 📄 Resource | `pos://duvidas` | Dúvidas registradas (JSON) |
| 📄 Resource | `pos://progresso` | Aulas concluídas por módulo (JSON) |
| 💬 Prompt | `gerar_quiz` | Quiz de múltipla escolha sobre um módulo, baseado nas suas anotações, com a fonte de cada resposta |
| 💬 Prompt | `plano_de_revisao` | Plano de revisão da semana a partir das dúvidas e do progresso, com a fonte de cada indicação |

---

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `NOTES_DIR` | `~/Documents` | Pasta raiz das anotações (cada subpasta é um módulo) |
| `DATA_DIR` | `~/.postgrad-study-mcp` | Onde ficam `duvidas.json` e `progresso.json` |
| `INCLUDE_PDF` | `true` | `false` desliga totalmente a busca e a leitura de PDFs |

Arquivos lidos, por tipo:

| Tipo (`tipos`) | Extensões | Limite |
|---|---|---|
| `anotacoes` | `.md`, `.txt` | 200 KB |
| `codigo` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py` | 200 KB |
| `pdf` | `.pdf` (somente PDFs com texto; escaneados são recusados com aviso) | 30 MB, leitura de até 5 páginas por vez |

### Filtrando por tipo

Não é preciso passar parâmetros: basta pedir no chat e o modelo preenche `tipos` sozinho.

```
Busque "embeddings" só nos PDFs das aulas
Procure "registerTool" só no código
```

Sem filtro, a busca olha todos os tipos. Como ela para em 20 resultados, um termo muito comum pode encher a lista com código e anotações antes de chegar aos PDFs — nesse caso, peça "só nos PDFs".

### PDFs e tokens

O texto dos PDFs é extraído na sua máquina e fica em cache enquanto o arquivo não muda. Só vai para o modelo o que a tool devolve: os trechos da busca (até 20 × 200 caracteres) ou as páginas pedidas em `ler_anotacao` (até 5, ~2 mil tokens). O modelo deve buscar primeiro e depois ler só as páginas indicadas.

---

## Custos

**Rodar o servidor não custa nada.** Ele não usa nenhuma API de IA nem chave, não acessa a internet e não tem LLM: só lê arquivos na sua máquina e devolve texto. Por isso também não há `.env` com credenciais — o [`.env.example`](.env.example) lista as três variáveis, nenhuma secreta.

Quem "pensa" é o modelo do **seu** cliente MCP, cobrado pelo plano dele:

| Onde roda | Custo |
|---|---|
| `postgrad-study-mcp` (busca, PDFs, dúvidas) | Grátis — local |
| Modelo do Copilot Chat | Conforme o seu plano do Copilot. No **Free** há um limite mensal de uso e nada é cobrado; estudantes podem pedir o **Pro** grátis pelo [GitHub Education](https://education.github.com) |
| Outros clientes (Claude, Cursor…) | Conforme o plano/assinatura de cada um |

O servidor limita o que manda ao modelo — até 20 trechos de 200 caracteres por busca, arquivos de texto até 200 KB e PDFs de até 5 páginas por leitura — para não encher o contexto. Se você notar consumo alto, use o filtro `tipos` ou `INCLUDE_PDF=false`.

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

## Atualizando

```bash
cd postgrad-study-mcp
git pull
npm install
```

Depois reinicie o servidor em **MCP: List Servers**.

---

## Desenvolvimento

| Script | Descrição |
|---|---|
| `npm start` | Inicia o servidor |
| `npm run dev` | Inicia com file-watch e inspector do Node.js |
| `npm test` | Roda os testes de integração |
| `npm run typecheck` | Verifica os tipos com `tsc` (o Node só remove os tipos, não os checa) |
| `npm run test:dev` | Testes em modo watch |
| `npm run mcp:inspect` | Abre o MCP Inspector usando as anotações de exemplo de `tests/fixtures` |

Os testes sobem o servidor via stdio com uma cópia temporária de `tests/fixtures/notas` e um `DATA_DIR` temporário, então não tocam nos seus dados reais. Os casos de ataque (`.env`, symlink para fora, pasta oculta, segredo no código, arquivo com injeção e caracteres invisíveis) e os PDFs de teste (com várias páginas, escaneado e com injeção) são criados na hora pelos testes.

A cada push na `main` e em todo pull request, o GitHub Actions roda `typecheck` e `test` no Ubuntu e no macOS, com Node 22 e 24.

### Contribuindo

1. Crie uma branch a partir da `main`
2. Faça as alterações com testes (`tests/mcp.test.ts`)
3. Rode `npm run typecheck && npm test`
4. Abra um pull request

---

## Licença

[ISC](LICENSE)

---

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
  pdf.ts       # Gera PDFs mínimos para os testes
  mcp.test.ts  # Testes de integração
```
