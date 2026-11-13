# Changelog

As mudanças de cada versão. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/): a versão maior muda quando algo deixa de funcionar como antes (nome de tool, parâmetro, formato dos dados salvos).

## [1.2.0] - 2026-11-13

A terceira parte da revisão de código externa: buscas mais relevantes (exata e por significado), PDFs mais rápidos e o estado do índice visível. Cada mudança foi medida num material de curso real.

### Adicionado
- Resource `estudos://indice`: o estado da busca por significado (ligada ou não, progresso da indexação, arquivos e trechos no índice e o último erro), sem precisar fazer uma busca.

### Alterado
- **Busca por significado: os trechos começam em cada título Markdown**, para cada um falar de um assunto só. Antes, o corte a cada ~800 caracteres ignorava as seções: num material de curso real, 71% dos trechos misturavam duas. Medido nesse material, usando os títulos das seções como perguntas: o 1º trecho cobre a seção certa em 41% das vezes, contra 26%. Numa avaliação nova, com notas longas e perguntas escritas com outras palavras (`tests/secoes.model.ts`), o 1º trecho começa na seção certa em 13 de 18 perguntas, contra 1 de 18. **O índice é refeito uma vez, sozinho**, na primeira conversa depois de atualizar (~2 min para ~1.700 arquivos), e fica maior (de 26 para 32 MB nesse material). A sobreposição entre trechos também foi testada e não melhorou nada, por isso ficou de fora.
- **O texto dos PDFs fica salvo em `DATA_DIR/cache-pdf.json`** (permissão 600, caminhos relativos): a primeira busca de cada conversa não extrai todos os PDFs de novo. Num material com 57 PDFs, de 1,2 s para 0,4 s; o arquivo ocupa ~270 KB. PDFs alterados são extraídos de novo, e os apagados saem do cache.
- **A busca por texto exato ordena por relevância**, e não mais pela ordem das pastas: conta o termo no nome do arquivo, em título de anotação (`# ...`, fora de blocos de código), como palavra inteira e o número de repetições (com teto); com pontuação parecida, anotações vêm antes de PDFs, e PDFs antes de código. Num material de curso real, buscas como "docker", "MCP" e "embedding" passaram a trazer primeiro a nota sobre o assunto, em vez dos mesmos três READMEs para qualquer termo. Na avaliação, com 5 perguntas novas de termos que aparecem em vários arquivos, a literal foi de 3/5 para 5/5 no 1º lugar, e a híbrida (a da tool) de 20/25 para 22/25 no total: a ordem antiga estava atrapalhando a fusão das duas buscas. Custo: a busca agora percorre todos os arquivos antes de responder (no material medido, de ~0,12 s para ~0,4 s).
- Documentado o comportamento com links simbólicos: a busca os ignora (evita resultados repetidos), e a leitura direta só aceita os que apontam para dentro da pasta de estudos.
- O aviso de índice em construção diz "preparando" em vez de "0 de 0 arquivos" enquanto a lista de arquivos ainda está sendo montada.

## [1.1.1] - 2026-11-13

Manutenção para o projeto seguir estável com pouca intervenção.

### Alterado
- Busca por significado: a versão testada passa a ser a `@huggingface/transformers` 4.3.2 (mesmo motor de inferência, vetores e índice iguais). O servidor aceita qualquer 4.x a partir da 4.3.1, então configurações com `--package=@huggingface/transformers@4.3.1` continuam funcionando sem mudança.
- CI: o macOS roda só com Node 22 (o Node 24 segue testado no Ubuntu e no Windows), por causa da fila longa das máquinas macOS do GitHub. O Dependabot passa a propor atualizações a cada seis meses; correções de segurança continuam imediatas.

## [1.1.0] - 2026-11-13

Melhorias da revisão de código externa: busca, segurança e uma tool nova. Cada uma foi medida num material de curso real antes do merge.

### Adicionado
- Mais segredos mascarados: valores sem aspas (`.env` colado numa nota, frontmatter YAML), JWT, `Bearer`, `x-api-key` e tokens do Hugging Face. Textos de exemplo e referências no código ficam como estão (medido num material real: sem esse filtro, todos os casos novos eram falsos).
- Linha 🔒 quando algo com cara de credencial foi mascarado, separada do alerta de *prompt injection*. Na busca por significado, o mascaramento é refeito na resposta, cobrindo índices gerados por versões anteriores.
- Tool `listar_arquivos`: os arquivos de um módulo, com tipo e tamanho (até 100, com filtro por tipo). O `gerar_quiz` passa a listar o módulo antes de ler, em vez de depender de termos de busca adivinhados.

### Alterado
- Mais variações de *prompt injection* geram alerta: palavras entre "ignore" e "anteriores", "desconsidere o que foi dito antes", pedidos do prompt de sistema, ordens para chamar uma tool do servidor e para expor o `.env`. Medido num material de curso real: os alertas passaram de 4 para 8 linhas, todas com frases de ataque de verdade, e dúvidas legítimas como "posso ignorar o aviso acima?" continuam aceitas.
- A busca por texto exato não diferencia mais acentos: `funcao` acha "função", e `ativação` acha também onde está escrito "ativacao". O trecho devolvido mantém os acentos originais.

## [1.0.2] - 2026-11-13

Correções vindas de uma revisão de código externa, todas reproduzidas antes de corrigir e cobertas por teste.

### Corrigido
- **Dúvidas perdidas em chamadas simultâneas:** registrar três dúvidas em paralelo gravava só uma, e uma delas respondia "sucesso" sem ter sido gravada. As gravações agora entram numa fila por arquivo.
- **Uma subpasta ilegível derrubava a busca e a lista de módulos inteiras.** Agora ela é pulada, com aviso no log. Um módulo que é um arquivo recebe uma explicação, em vez de `ENOTDIR`.
- **Caminhos absolutos (com o nome do usuário) em mensagens de erro:** nenhuma saída leva mais caminhos ao modelo, incluindo os erros de prompts e resources e o aviso da busca por significado.
- **O trecho da busca literal podia não conter o termo** numa linha longa. Agora ele fica centrado no termo, e os segredos são mascarados antes do recorte (recortando antes, uma chave no ponto do corte vazava sem o prefixo).
- **Parágrafos maiores que um trecho** eram lidos só no começo pela busca por significado. Agora viram vários trechos; os trechos das outras linhas não mudam, então os índices salvos continuam valendo.
- Itens menores: intervalo de páginas inválido, vetores de tamanhos diferentes, alinhamento na leitura do índice e aviso para linhas com `!` no `.studynotesignore`.

### Adicionado
- A versão aparece no log de inicialização, e `npx -y study-notes-mcp@latest --version` mostra a versão.

### Documentação
- README com a seção "Por que este servidor", e descrição e palavras-chave do npm destacando a busca híbrida local e sem chave de API.

## [1.0.1] - 2026-11-12

### Documentação
- README sem o aviso de projeto educacional, e exemplos de pasta com um nome genérico (`Estudos`).

### Publicação
- Primeira versão publicada pelo GitHub Actions, com *provenance*: a página do npm mostra de qual commit e de qual workflow o pacote saiu.
- O CI e a publicação instalam as dependências sem os scripts de instalação, exceto no teste da busca por significado: uma falha no servidor de download do `onnxruntime-node` não derruba mais uma release.

## [1.0.0] - 2026-11-12

Primeira versão publicada.

### Tools, prompts e resources
- `buscar_material`: busca por nome exato e, com `SEMANTIC_SEARCH=true`, por significado. As duas buscas são unidas (*Reciprocal Rank Fusion*), e cada resultado cita arquivo, linha e página.
- `ler_material`: lê anotações, código e PDFs por página. Em notas do Obsidian, mostra para onde cada `[[link]]` aponta.
- `listar_modulos`, incluindo os módulos dentro de outra pasta (como num repositório de curso clonado).
- `registrar_duvida`, `resolver_duvida`, `marcar_aula_concluida` e `ver_estudos`.
- Prompts `gerar_quiz` (com autocompletar do módulo e busca pelo número ou trecho do nome) e `plano_de_revisao`, ambos pedindo a fonte de cada resposta.
- Resources `estudos://duvidas` e `estudos://progresso`.

### Material
- Anotações (`.md`, `.txt`), PDFs com texto e código (`.ts`, `.js`, `.py` e outros).
- Arquivo `.studynotesignore`, no formato do `.gitignore`, para excluir pastas e arquivos.
- Busca por significado local, com o modelo `multilingual-e5-small`: sem chave de API, textos repetidos calculados uma vez só.

### Segurança
- Lista fechada de extensões, bloqueio de arquivos ocultos, de `../` e de symlinks para fora da pasta.
- Segredos trocados por `[REDACTED]`, alertas de *prompt injection* e conteúdo delimitado como dado não confiável.
- Recusa igual para arquivos bloqueados que existem ou não, e mensagens de erro sem caminhos absolutos.
- Gravação atômica das dúvidas, do progresso e do índice, com novas tentativas no Windows; um arquivo ilegível nunca é sobrescrito.

### Requisitos
- Node.js 22.18 ou mais novo.

### Clientes testados
- VS Code com GitHub Copilot, Claude Code e Codex. Detalhes em [docs/clientes.md](docs/clientes.md).

[1.2.0]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.2.0
[1.1.1]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.1.1
[1.1.0]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.1.0
[1.0.2]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.2
[1.0.1]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.1
[1.0.0]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.0
