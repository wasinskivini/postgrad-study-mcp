# postgrad-study-mcp

[![test](https://github.com/wasinskivini/postgrad-study-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/wasinskivini/postgrad-study-mcp/actions/workflows/test.yml)

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) para apoiar os estudos da pós: busca nas suas anotações, no código e nos PDFs das aulas, registra dúvidas, acompanha o progresso e gera quizzes e planos de revisão — disponível em **qualquer projeto** aberto no VS Code (ou em outro cliente MCP).

> **O servidor não traz conteúdo nenhum.** Ele roda no seu computador e busca na **sua** pasta de estudos. Cada pessoa aponta para a própria pasta; ninguém acessa os arquivos de ninguém.

> 🎓 **Projeto educacional.** Criado durante a pós-graduação em Engenharia de Software com IA Aplicada para praticar a construção de servidores MCP e apoiar os estudos. Não é um produto oficial do curso nem da instituição, não tem garantia de funcionamento (veja a [licença](LICENSE)) e não substitui o material e as orientações dos professores.

---

## Instalação (passo a passo)

### 1. Pré-requisitos

- **Node.js 22.18 ou mais novo** — confira com `node -v`
- **VS Code** com **GitHub Copilot** (o plano Free funciona) ou outro cliente MCP

### 2. Não precisa baixar nada

O servidor está no [npm](https://www.npmjs.com/package/postgrad-study-mcp): o VS Code baixa e roda sozinho com `npx` quando você configurar o passo 4. Para mexer no código, veja [A partir do código-fonte](#a-partir-do-código-fonte).

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

```json
{
  "servers": {
    "postgrad-study-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "postgrad-study-mcp@latest"],
      "env": {
        "NOTES_DIR": "/Users/seu-usuario/Documents/Pós IA",
        "INCLUDE_PDF": "true"
      }
    }
  }
}
```

No Windows, use `/` ou `\\` no caminho: `"NOTES_DIR": "C:/Users/seu-usuario/Documents/Pos IA"`. O caminho precisa ser **absoluto**: o servidor roda fora de qualquer projeto.

O `@latest` faz o `npx` conferir se há versão nova a cada início. Na primeira vez ele baixa o pacote e as dependências (alguns MB), por isso o servidor pode demorar alguns segundos para subir.

### 5. Inicie e teste

1. `Cmd/Ctrl+Shift+P` → **MCP: List Servers** → `postgrad-study-mcp` → **Start Server**
2. Em **Show Output**, confira se aparece `Discovered 7 tools`
3. Abra o Copilot Chat no modo **Agent** e pergunte algo sobre o seu material

Na primeira chamada de cada tool o VS Code pede permissão — clique em **Allow**. Clicando no bloco "Ran buscar_material" da resposta, dá para ver exatamente o que o servidor devolveu.

### Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `spawn npx ENOENT` ou "The command npx was not found" | O VS Code não achou o Node no PATH — comum com **nvm**, que só configura o PATH no terminal. Use o caminho absoluto em `command` (veja com `which npx` / `where npx`) ou abra o VS Code pelo terminal com `code .` |
| Erro de sintaxe ou `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Node antigo. Atualize para 22.18+ |
| Servidor aparece mas não acha nada | Confira o `NOTES_DIR` (caminho absoluto, pasta existe). Sem a [busca por significado](#busca-por-significado-opcional) ligada, a busca é por **texto literal**: tente outra palavra |
| "Language model unavailable" no chat | Problema do Copilot, não do servidor: atualize o VS Code e confira o login/plano do Copilot |
| O modelo responde sem usar o servidor | Seja explícito: "consulte minhas anotações sobre…" ou cite a tool com `#buscar_material` |
| Digitando `/` não aparecem `gerar_quiz` nem `plano_de_revisao` | A conversa está numa sessão **Copilot CLI**, que não mostra prompts de MCP. Abra um chat na sessão **Local**, modo **Agent**, e digite `/mcp.postgrad` |
| O chat leu um arquivo que o servidor bloqueia (`.zshrc`, `package.json`...) | Quem leu foi o **próprio Copilot**, com a ferramenta embutida dele (aparece "Read arquivo", não "Ran ler_material"). As proteções deste servidor valem só para o que passa por ele. Para testar o servidor, cite a tool: `#ler_material` |
| Parei o servidor e ele voltou sozinho | O VS Code reinicia servidores a cada conversa nova. Para desligar de verdade, remova a entrada do `mcp.json` |

---

## Exemplos de uso

Com o servidor rodando, no Copilot Chat (modo **Agent**):

| Você pede | O servidor faz |
|---|---|
| `O que eu anotei sobre embeddings?` | `buscar_material` em anotações, código e PDFs |
| `Busque "chunking" só nos PDFs e leia a página onde aparece` | `buscar_material` com `tipos: ["pdf"]` → `ler_material` com `paginas` |
| `Como foi implementado o registerTool nas aulas? Procure só no código` | `buscar_material` com `tipos: ["codigo"]` → `ler_material` |
| `Registre uma dúvida no modulo03: quando usar resource em vez de tool?` | `registrar_duvida` |
| `Marque a aula 05 do modulo03 como concluída` | `marcar_aula_concluida` |
| `Quais dúvidas eu ainda tenho pendentes?` | `ver_estudos` |
| `Já entendi a dúvida 2, pode marcar como resolvida` | `resolver_duvida` |
| `Onde as aulas explicam como transformar texto em números?` | `buscar_material` (com a busca por significado ligada, acha mesmo sem as mesmas palavras) |

Os prompts aparecem digitando `/` no chat: `/mcp.postgrad-study-mcp.gerar_quiz` e `/mcp.postgrad-study-mcp.plano_de_revisao`.

### Como o quiz e o plano de revisão funcionam

O servidor **não tem LLM**: um prompt MCP é só uma mensagem pronta. Ao escolher `gerar_quiz`, o servidor valida o módulo e devolve um texto que pede ao modelo do seu chat para buscar suas anotações (com as tools deste servidor) e montar as perguntas. Quem escreve o quiz é o modelo.

Por isso os prompts pedem que **cada resposta venha com a fonte** — `arquivo:linha` ou `arquivo, p. N` — e que o modelo diga "não encontrei" em vez de completar com conhecimento geral. No quiz, as fontes aparecem só junto das respostas, no final, para não entregar o gabarito. Isso não impede o modelo de errar, mas torna qualquer resposta suspeita conferível em segundos.

No `plano_de_revisao`, o próprio servidor lê as suas dúvidas e o seu progresso e já os coloca no texto do prompt. O modelo só precisa buscar no material onde revisar cada assunto.

---

## O que o servidor oferece

| Tipo | Nome | Descrição |
|---|---|---|
| 🔧 Tool | `listar_modulos` | Lista as pastas de módulos dentro de `NOTES_DIR` |
| 🔧 Tool | `buscar_material` | Busca nas anotações, no código e nos PDFs das aulas (até 20 resultados com arquivo, linha, página e trecho), com filtro opcional por `tipos`. Aceita um nome exato ou uma pergunta; com `SEMANTIC_SEARCH=true`, também acha o assunto por significado |
| 🔧 Tool | `ler_material` | Lê uma anotação ou arquivo de código completo, ou um PDF por páginas (até 5 por vez) |
| 🔧 Tool | `registrar_duvida` | Salva uma dúvida para revisar depois |
| 🔧 Tool | `marcar_aula_concluida` | Marca uma aula como concluída |
| 🔧 Tool | `resolver_duvida` | Marca uma dúvida como resolvida pelo número (`#2`); ela sai do plano de revisão mas continua no histórico |
| 🔧 Tool | `ver_estudos` | Lista as dúvidas não resolvidas e as aulas concluídas (o modelo não consegue abrir resources sozinho, então os mesmos dados também existem como tool) |
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
| `SEMANTIC_SEARCH` | `false` | `true` liga a [busca por significado](#busca-por-significado-opcional) |
| `MODELS_DIR` | `DATA_DIR/modelos` | Onde o modelo de embeddings fica guardado depois do download |

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

Sem filtro, a busca olha todos os tipos, nesta ordem: **anotações, PDFs e por último código**. Ela devolve no máximo 20 resultados, até 3 por arquivo, para um arquivo só não ocupar a lista inteira. Se o limite for atingido, a resposta avisa: aí vale pedir "só nos PDFs" ou "só no módulo X".

### PDFs e tokens

O texto dos PDFs é extraído na sua máquina e fica em cache enquanto o arquivo não muda. Só vai para o modelo o que a tool devolve: os trechos da busca (até 20 × 200 caracteres) ou as páginas pedidas em `ler_material` (até 5, ~2 mil tokens). O modelo deve buscar primeiro e depois ler só as páginas indicadas.

### Busca por significado (opcional)

A busca normal é **literal**: procurar "vetor" não acha um trecho que só fala em "embedding". Com `SEMANTIC_SEARCH=true`, a tool `buscar_material` passa a achar também pelo **assunto**, mesmo com palavras diferentes ou em outro idioma. Não existe uma segunda tool: o servidor roda as duas buscas e junta os resultados, então o modelo não precisa decidir qual usar.

Ela usa **embeddings**, o mesmo "R" do RAG: cada trecho das suas anotações e PDFs vira um vetor de números, e a busca devolve os trechos com o vetor mais parecido com o da pergunta. Quem gera os vetores é um **modelo de embeddings** pequeno ([multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small), licença MIT), que roda **dentro do servidor, no seu computador**. Ele não escreve texto nem responde nada, e não precisa de Ollama nem de chave de API.

Para ligar, a biblioteca de embeddings entra como um segundo pacote no `npx` e a variável `SEMANTIC_SEARCH` no `env`:

```json
"postgrad-study-mcp": {
  "type": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "--package=postgrad-study-mcp@latest",
    "--package=@huggingface/transformers@4.3.1",
    "postgrad-study-mcp"
  ],
  "env": {
    "NOTES_DIR": "/Users/seu-usuario/Documents/Pós IA",
    "INCLUDE_PDF": "true",
    "SEMANTIC_SEARCH": "true"
  }
}
```

A partir do código-fonte, basta o `"SEMANTIC_SEARCH": "true"`: o `npm install` já instala a biblioteca.

O que acontece:

1. **Primeira vez:** o modelo é baixado do Hugging Face (~145 MB, uma vez só) e guardado em `MODELS_DIR`. É o **único acesso à internet** do servidor. Seus arquivos nunca são enviados: os vetores são calculados localmente.
2. **Indexação:** o servidor divide anotações e PDFs em trechos de ~800 caracteres e gera o vetor de cada um, em segundo plano. Na primeira vez leva alguns minutos (~8 minutos para ~1.900 arquivos num Mac com Apple Silicon); enquanto isso a busca avisa que o índice está incompleto e a busca literal continua funcionando.
3. **Depois:** o índice fica salvo em `DATA_DIR/indice-semantico.json`. Nas próximas vezes só arquivos novos ou alterados são processados (segundos).

Código **não** entra no índice: nomes como `registerTool` já são termos exatos, e a busca literal resolve melhor.

**Por que juntar as duas buscas.** Cada uma erra onde a outra acerta. A literal acha `registerTool` e `OPENAI_API_KEY`, mas não entende sinônimos; a semântica acha o assunto com outras palavras, mas muitas vezes deixa de fora o arquivo que tem o nome exato. A junção usa *Reciprocal Rank Fusion*: cada busca dá a cada resultado a nota `1 / (60 + posição)`, e as notas se somam. Arquivos que as duas buscas acharam sobem na lista. Se a busca por significado falhar (biblioteca ausente, sem internet para baixar o modelo), a resposta traz só a literal, com um aviso.

**Quanto isso melhora?** Medido em dois lugares:
- No material do autor (~1.900 arquivos), para 10 nomes exatos: de 22 arquivos que a busca literal encontra, a semântica sozinha traz 8 e a híbrida traz 15. Esse material é privado e não está no repositório.
- No corpus de teste do repositório (12 arquivos, 20 perguntas, rodando `npm run test:semantic`): a literal acerta o arquivo em 1º lugar em 6 de 20 perguntas, e a semântica e a híbrida em 18 de 20. Com tão poucos arquivos, a híbrida só empata com a semântica; o corpus serve para detectar regressões, não para provar ganho.

Custos e limites: a biblioteca ([transformers.js](https://huggingface.co/docs/transformers.js)) ocupa ~470 MB, por isso **não** vem junto com o pacote: só baixa quem acrescentar o segundo `--package`. Sem ela, o resto do servidor funciona normalmente e `buscar_por_significado` explica o que falta. Cada busca devolve até 8 trechos de 500 caracteres.

---

## Custos

**Rodar o servidor não custa nada.** Ele não usa nenhuma API de IA nem chave, não acessa a internet e não tem LLM: só lê arquivos na sua máquina e devolve texto. A única exceção é opcional: com `SEMANTIC_SEARCH=true`, ele baixa uma vez o modelo de embeddings, que depois roda localmente e de graça. Por isso também não há `.env` com credenciais — o [`.env.example`](.env.example) lista as três variáveis, nenhuma secreta.

Quem "pensa" é o modelo do **seu** cliente MCP, cobrado pelo plano dele:

| Onde roda | Custo |
|---|---|
| `postgrad-study-mcp` (busca, PDFs, dúvidas, busca semântica) | Grátis — local |
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
- As `instructions` do servidor e os prompts dizem ao modelo para tratar o conteúdo como dados e só falar de prompt injection quando houver uma linha `⚠️ ALERTA`
- `registrar_duvida` recusa textos com padrões de injeção, para nada ser "plantado" no histórico que depois volta via `ver_estudos` e `plano_de_revisao`
- Busca semântica (opcional): o modelo é baixado de um commit fixo do Hugging Face (uma versão nova publicada lá não é baixada sem querer), e o índice salvo em `DATA_DIR` guarda o texto já com segredos redigidos e com permissão `600`
- Argumentos das tools têm tamanho máximo e não aceitam caracteres invisíveis; `gerar_quiz` só aceita módulos que existem
- Tools anotadas com `readOnlyHint`, para o cliente distinguir leitura de escrita; as de escrita só alteram os JSONs em `DATA_DIR` (criados com permissão `600`)

> Essas proteções valem para o que passa por este servidor. O Copilot tem ferramentas próprias (ler arquivos, terminal) que não passam por aqui; para controlar o que elas podem fazer, use as configurações de aprovação de tools do VS Code.

> Não coloque em `NOTES_DIR` material sigiloso ou com dados pessoais: mesmo com essas camadas, o que for lido vai para o modelo.

---

## Entendendo o código

O código é comentado como um **roteiro de leitura em passos**: cada arquivo é um passo, e cada ponto importante dentro dele tem um número (2.4, 3.6...). Os comentários citam esses números, então dá para seguir uma chamada de um arquivo para o outro.

### Estrutura

```
src/
  index.ts     # PASSO 1 — ponto de entrada: liga o servidor ao transporte stdio
  mcp.ts       # PASSO 2 — o que o servidor oferece: tools, resources e prompts
  service.ts   # PASSO 3 — as regras: tipos de arquivo, busca, leitura, PDFs, dados salvos
  safety.ts    # PASSO 4 — as proteções: caracteres invisíveis, segredos, prompt injection
  semantic.ts  # PASSO 6 — (opcional) busca por significado com embeddings
tests/
  helpers.ts   # PASSO 5.1 — cliente MCP de teste (sobe o servidor de verdade)
  pdf.ts       # PASSO 5.2 — gera PDFs mínimos para os testes
  mcp.test.ts  # PASSO 5.3 — testes de ponta a ponta
  semantic.test.ts # PASSO 5.4 — busca semântica sem o modelo (trechos, similaridade)
  semantic.model.ts # PASSO 5.5 — busca semântica com o modelo de verdade
  avaliacao.model.ts # PASSO 5.7 — mede o acerto das buscas (literal, semântica e híbrida)
  pacote.smoke.ts  # PASSO 5.6 — instala o pacote do npm numa pasta vazia e sobe o servidor
  fixtures/    # anotações de exemplo
```

### Ordem de leitura sugerida

| Passo | Arquivo | O que você aprende |
|---|---|---|
| 1 | [src/index.ts](src/index.ts) | Como um servidor MCP sobe e por que o stdout é sagrado (1.1 a 1.5) |
| 2 | [src/mcp.ts](src/mcp.ts) | Como declarar tools (2.3 a 2.8), resources (2.9) e prompts (2.10); instructions (2.1) e validação (2.2) |
| 3 | [src/service.ts](src/service.ts) | Tipos, limites e filtros (3.1 a 3.3), PDFs (3.4, 3.8), busca (3.6), leitura (3.7), segurança de caminhos (3.9), dados (3.10) |
| 4 | [src/safety.ts](src/safety.ts) | As camadas contra vazamento e prompt injection (4.1 a 4.5) |
| 5 | [tests/](tests/) | Como testar um servidor MCP pelo próprio protocolo |
| 6 | [src/semantic.ts](src/semantic.ts) | (Opcional) Embeddings na prática: dividir em trechos, indexar, buscar por similaridade (6.1 a 6.5) e juntar com a busca literal (6.6) |

### O caminho de uma busca, passo a passo

Quando você pergunta *"o que eu anotei sobre RAG nos PDFs?"*:

```
Copilot ── tools/call buscar_material {consulta:"RAG", tipos:["pdf"]} ──►  PASSO 1.1  chega pelo stdin
                                                                        PASSO 2.2  Zod valida os argumentos
                                                                        PASSO 2.4  handler da tool
                                                                        PASSO 6.6  buscaHibrida (literal + por significado)
                                                                        PASSO 3.6    └ searchNotes (a busca literal)
                                                                        PASSO 3.9    └ módulo dentro da pasta?
                                                                        PASSO 3.5    └ lista os arquivos permitidos (3.3)
                                                                        PASSO 3.4    └ extrai o texto dos PDFs (com cache)
                                                                        PASSO 4.4    └ cada trecho: invisíveis, alertas, segredos
                                                                        PASSO 4.5  delimita como <dados_nao_confiaveis>
Copilot ◄──────────────────── resultado (texto + structuredContent) ──  PASSO 1.1  sai pelo stdout
```

Depois disso o modelo decide se lê as páginas (`ler_material` → PASSO 2.5 → 3.7 → 3.9 → 3.8 → 4.4 → 4.5) e escreve a resposta.

---

## Atualizando

Com `postgrad-study-mcp@latest` no `mcp.json`, basta reiniciar o servidor em **MCP: List Servers**: o `npx` baixa a versão nova sozinho.

---

## A partir do código-fonte

Para estudar o código, contribuir ou testar mudanças antes de publicar:

```bash
git clone https://github.com/wasinskivini/postgrad-study-mcp.git
cd postgrad-study-mcp
npm install
npm test
```

No `mcp.json`, troque `command` e `args` pelo Node rodando o TypeScript direto (sem build):

```json
"command": "node",
"args": ["/Users/seu-usuario/postgrad-study-mcp/src/index.ts"]
```

Para atualizar: `git pull && npm install` e reinicie o servidor.

---

## Desenvolvimento

| Script | Descrição |
|---|---|
| `npm start` | Inicia o servidor direto do TypeScript |
| `npm run build` | Compila para JavaScript em `dist/` (o que vai para o npm; roda sozinho no `npm pack`/`npm publish`) |
| `npm run dev` | Inicia com file-watch e inspector do Node.js |
| `npm test` | Roda os testes de integração |
| `npm run typecheck` | Verifica os tipos com `tsc` (o Node só remove os tipos, não os checa) |
| `npm run test:dev` | Testes em modo watch |
| `npm run test:semantic` | Testes da busca semântica e a avaliação das buscas, com o modelo de verdade (baixa ~145 MB na primeira vez) |
| `npm run test:pack` | Gera o pacote do npm, instala numa pasta vazia e sobe o servidor por ele |
| `npm run mcp:inspect` | Abre o MCP Inspector usando as anotações de exemplo de `tests/fixtures` |

Os testes sobem o servidor via stdio com uma cópia temporária de `tests/fixtures/notas` e um `DATA_DIR` temporário, então não tocam nos seus dados reais. Os casos de ataque (`.env`, symlink para fora, pasta oculta, segredo no código, arquivo com injeção e caracteres invisíveis) e os PDFs de teste (com várias páginas, escaneado e com injeção) são criados na hora pelos testes.

A cada push na `main` e em todo pull request, o GitHub Actions roda `typecheck` e `test` no Ubuntu, no macOS e no Windows, com Node 22 e 24. Dois jobs separados testam o pacote do npm (todos os testes contra o `dist/` compilado, com `TEST_DIST=1`, mais o `test:pack`) e a busca semântica com o modelo de verdade.

### Contribuindo

Contribuições são bem-vindas! O passo a passo completo — fork, branch, convenções do código, testes e pull request — está no **[CONTRIBUTING.md](CONTRIBUTING.md)**. Em resumo:

1. Faça um fork e crie uma branch (`feat/…`, `fix/…`, `docs/…`)
2. Siga as convenções (separação mcp/service/safety, comentários de passo, testes para tudo)
3. Rode `npm run typecheck && npm test`
4. Abra um pull request — o template traz um checklist

Para bugs e ideias, use as [issues](https://github.com/wasinskivini/postgrad-study-mcp/issues/new/choose). Falhas de segurança **não** vão em issue pública: veja o [SECURITY.md](SECURITY.md).

---

## Licença

[ISC](LICENSE)
