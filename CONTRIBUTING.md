# Contribuindo com o study-notes-mcp

Obrigado pelo interesse! Este é um projeto educacional da pós, e contribuições de colegas são muito bem-vindas — de correções de texto a tools novas.

## Formas de contribuir

| Você quer… | Faça assim |
|---|---|
| Reportar um problema | Abra uma [issue de bug](../../issues/new/choose) |
| Sugerir uma ideia | Abra uma [issue de ideia](../../issues/new/choose) e descreva o caso de uso antes de programar |
| Corrigir ou melhorar o código/README | Siga o fluxo abaixo e abra um pull request |
| Reportar uma falha de segurança | **Não abra issue pública** — veja o [SECURITY.md](SECURITY.md) |

Para mudanças grandes (uma tool nova, outra forma de busca), abra uma issue primeiro: assim combinamos a ideia antes de você investir tempo no código.

## Rodando a partir do código-fonte

Para estudar o código, contribuir ou testar mudanças antes de publicar:

```bash
git clone https://github.com/wasinskivini/study-notes-mcp.git
cd study-notes-mcp
npm install
npm test
```

No `mcp.json` do VS Code, troque `command` e `args` pelo Node rodando o TypeScript direto, sem build:

```json
"command": "node",
"args": ["/Users/seu-usuario/study-notes-mcp/src/index.ts"]
```

Para atualizar: `git pull && npm install` e reinicie o servidor. Com o código-fonte, a [busca por significado](docs/busca-por-significado.md) só precisa de `"SEMANTIC_SEARCH": "true"`, porque o `npm install` já instala a biblioteca.

### Scripts

| Script | Descrição |
|---|---|
| `npm start` | Inicia o servidor direto do TypeScript |
| `npm run build` | Compila para JavaScript em `dist/`, o que vai para o npm (roda sozinho no `npm pack` e no `npm publish`) |
| `npm run dev` | Inicia com file-watch e o inspector do Node.js |
| `npm test` | Roda os testes de integração |
| `npm run typecheck` | Verifica os tipos com `tsc` (o Node só remove os tipos, não os checa) |
| `npm run test:dev` | Testes em modo watch |
| `npm run test:semantic` | Testes da busca semântica e a avaliação das buscas, com o modelo de verdade (baixa ~145 MB na primeira vez) |
| `npm run test:pack` | Gera o pacote do npm, instala numa pasta vazia e sobe o servidor por ele |
| `npm run mcp:inspect` | Abre o MCP Inspector usando as anotações de exemplo de `tests/fixtures` |

Os testes sobem o servidor via stdio com uma cópia temporária de `tests/fixtures/notas` e um `DATA_DIR` temporário, então não tocam nos seus dados reais.

A cada push na `main` e em todo pull request, o GitHub Actions roda `typecheck` e `test` no Ubuntu, no macOS e no Windows, com Node 22 e 24. Dois jobs separados testam o pacote do npm (todos os testes contra o `dist/` compilado, com `TEST_DIST=1`, mais o `test:pack`) e a busca semântica com o modelo de verdade. As dependências são atualizadas pelo [Dependabot](.github/dependabot.yml) uma vez por mês, num PR testado pelo CI. O `@huggingface/transformers` fica de fora, porque a versão dele está fixada na documentação da busca por significado e muda à mão.

## Fluxo de contribuição

### 1. Faça um fork e clone

Clique em **Fork** no GitHub (cria uma cópia na sua conta) e depois:

```bash
git clone https://github.com/SEU-USUARIO/study-notes-mcp.git
cd study-notes-mcp
npm install
npm run typecheck && npm test   # tudo deve passar antes de você mexer
```

Requisitos: **Node.js 22.18+** e Git.

### 2. Crie uma branch

Nunca trabalhe direto na `main`. Use um prefixo que diga o tipo da mudança:

```bash
git checkout -b feat/nome-curto      # funcionalidade nova
git checkout -b fix/nome-curto       # correção de bug
git checkout -b docs/nome-curto      # só documentação
```

### 3. Entenda o código antes de mudar

O código é comentado como um **roteiro de leitura em passos** (1 = `index.ts`, 2 = `mcp.ts`, 3 = `service.ts`, 4 = `safety.ts`, 5 = testes). Comece pelo guia [Entendendo o código](docs/entendendo-o-codigo.md).

### 4. Faça a mudança seguindo as convenções

- **Mantenha a separação de responsabilidades:**
  - `mcp.ts` declara tools/resources/prompts, valida a entrada e formata a saída
  - `service.ts` tem a lógica (sem nada de MCP)
  - `safety.ts` tem as proteções
- **Todo texto vindo de arquivo passa por `prepareUntrusted` e sai por `wrapUntrusted`** (PASSO 4.4 e 4.5). Não devolva conteúdo de arquivo ao modelo sem essas camadas.
- **Nada de LLM nem de rede no servidor.** O projeto é determinístico, local e gratuito de propósito. A única exceção é a busca semântica opcional (PASSO 6), que baixa uma vez um modelo de embeddings e roda tudo localmente. Se a sua ideia precisa de API externa, discuta numa issue antes.
- **Descrições de tools importam:** são o "manual" que o modelo lê para decidir o que chamar. Seja claro sobre o que a tool faz e quando usá-la.
- **Comentários de passo em dia:** se mudar um fluxo, atualize os números citados (2.4, 3.6…) nos comentários e em [docs/entendendo-o-codigo.md](docs/entendendo-o-codigo.md).
- **Caracteres invisíveis só como escape** (`\u200B`), nunca o caractere em si — um teste falha se isso acontecer.
- **Siga o estilo do arquivo** que você está editando (aspas, ponto e vírgula, indentação de 4 espaços).

### 5. Teste

Toda mudança de comportamento precisa de teste em `tests/mcp.test.ts`. Os testes sobem o servidor de verdade e conversam com ele pelo protocolo MCP — veja os exemplos existentes.

- Casos com arquivos especiais (`.env`, symlinks, PDFs, caracteres invisíveis) são **criados na hora** dentro do teste, nunca commitados.
- Use apenas segredos **obviamente falsos** (ex.: `sk-chave-falsa-so-para-teste-000`).

```bash
npm run typecheck && npm test
```

### 6. Commit e pull request

```bash
git add -A
git commit -m "feat: descreve o que mudou"
git push -u origin feat/nome-curto
```

Abra o pull request para a `main` deste repositório. O template do PR traz um checklist — preencha. O GitHub Actions roda o type check e os testes no Ubuntu, no macOS e no Windows (Node 22 e 24), além do teste do pacote do npm; o merge só é liberado com tudo verde.

> Na sua **primeira** contribuição, o mantenedor precisa aprovar a execução do Actions — é uma proteção padrão do GitHub para PRs de forks.

### 7. Revisão

O mantenedor pode pedir ajustes nos comentários do PR. Faça novos commits na mesma branch e dê push: o PR é atualizado sozinho. Quando estiver tudo certo, ele faz o merge.

## O que NÃO enviar

- ❌ **Material do curso** (PDFs, slides, gravações, anotações de aula): é protegido por direitos autorais e fica só na pasta local de cada um
- ❌ **Credenciais reais**, arquivos `.env` ou dados pessoais
- ❌ Seu `mcp.json` ou caminhos da sua máquina
- ❌ `node_modules/` (já está no `.gitignore`)

## Licença

Ao contribuir, você concorda que sua contribuição será distribuída sob a mesma [licença ISC](LICENSE) do projeto.

## Publicando uma versão (mantenedor)

1. Num PR, atualize a versão no `package.json` (e no `package-lock.json`, com `npm install --package-lock-only`), as duas versões do `server.json` e uma seção nova no [CHANGELOG.md](CHANGELOG.md). O teste `tests/publicacao.test.ts` confere se tudo bate.
2. Depois do merge, crie uma **release** no GitHub com a tag `vX.Y.Z` (a mesma versão) e as notas do CHANGELOG.
3. O workflow [publish.yml](.github/workflows/publish.yml) testa, publica no npm por Trusted Publishing (sem token, com *provenance*) e atualiza o MCP Registry.

Versão maior (2.0.0) quando algo deixa de funcionar como antes: nome de tool, parâmetro ou formato dos dados salvos. Versão menor (1.1.0) para recursos novos, e correção (1.0.1) para o resto.

