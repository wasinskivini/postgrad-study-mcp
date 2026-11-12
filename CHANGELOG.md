# Changelog

As mudanças de cada versão. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/): a versão maior muda quando algo deixa de funcionar como antes (nome de tool, parâmetro, formato dos dados salvos).

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

### Clientes testados
- VS Code com GitHub Copilot, Claude Code e Codex. Detalhes em [docs/clientes.md](docs/clientes.md).

[1.0.0]: https://github.com/wasinskivini/study-notes-mcp/releases/tag/v1.0.0
