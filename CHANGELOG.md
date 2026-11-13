# Changelog

As mudanças de cada versão. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/): a versão maior muda quando algo deixa de funcionar como antes (nome de tool, parâmetro, formato dos dados salvos).

## [Não publicado]

### Alterado
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

[1.0.2]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.2
[1.0.1]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.1
[1.0.0]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.0
