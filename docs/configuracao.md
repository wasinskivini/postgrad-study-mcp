# Configuração

[← Voltar ao README](../README.md)

- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Arquivos lidos](#arquivos-lidos)
- [Filtrando a busca](#filtrando-a-busca)
- [Ignorando arquivos e pastas (`.studynotesignore`)](#ignorando-arquivos-e-pastas-studynotesignore)
- [Notas do Obsidian](#notas-do-obsidian)
- [PDFs e tokens](#pdfs-e-tokens)
- [Todos os projetos ou só um?](#todos-os-projetos-ou-só-um)
- [Atualizando](#atualizando)

## Variáveis de ambiente

As variáveis vão no bloco `"env"` do `mcp.json` (veja o passo 3 do [README](../README.md#instalação-passo-a-passo)). Nenhuma é secreta: o servidor não usa chave de API.

| Variável | Padrão | Uso |
|---|---|---|
| `NOTES_DIR` | `~/Documents` | Pasta raiz do material (cada subpasta é um módulo). Use caminho absoluto |
| `DATA_DIR` | `~/.study-notes-mcp` | Onde ficam `duvidas.json`, `progresso.json` e o índice da busca por significado |
| `INCLUDE_PDF` | `true` | `false` desliga totalmente a busca e a leitura de PDFs |
| `SEMANTIC_SEARCH` | `false` | `true` liga a [busca por significado](busca-por-significado.md) |
| `MODELS_DIR` | `DATA_DIR/modelos` | Onde o modelo de embeddings fica guardado depois do download |

## Arquivos lidos

| Tipo (`tipos`) | Extensões | Limite |
|---|---|---|
| `anotacoes` | `.md`, `.txt` | 200 KB |
| `codigo` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py` | 200 KB |
| `pdf` | `.pdf` (só PDFs com texto; escaneados são recusados com aviso) | 30 MB, leitura de até 5 páginas por vez |

Qualquer outra extensão nunca é lida, assim como arquivos e pastas ocultos (`.env`, `.git`) e pastas como `node_modules`, `dist` e `venv`. Pastas sem nenhum arquivo lido (por exemplo, só com `.json` ou `.sh`) não aparecem como módulo nem nas sugestões do quiz. Arquivos novos aparecem na próxima busca, sem reiniciar o servidor.

### Links simbólicos (atalhos)

A busca, a lista de arquivos e a busca por significado **ignoram links simbólicos**, de arquivo ou de pasta. É de propósito: em material de curso, links costumam ser cópias do mesmo arquivo (`AGENTS.md`, `.cursorrules` e `.github/copilot-instructions.md` apontando para o `CLAUDE.md`), e segui-los repetiria os resultados. Também evita laços, quando um link aponta para uma pasta acima dele.

- **Ler um link pelo caminho funciona**, desde que o destino real fique dentro de `NOTES_DIR`. Um link que aponta para fora é bloqueado, como qualquer caminho fora da pasta.
- **Se você colocou na pasta de estudos um link para uma pasta de curso que está em outro lugar**, o conteúdo dela não aparece. Aponte o `NOTES_DIR` para uma pasta que contenha as duas, ou mova a pasta do curso para dentro da pasta de estudos.

## Filtrando a busca

Não é preciso passar parâmetros: basta pedir no chat e o modelo preenche `tipos` e `modulo` sozinho.

```
Busque "embeddings" só nos PDFs das aulas
Procure "registerTool" só no código do modulo03
```

O filtro de módulo aceita qualquer subpasta, não só as de primeiro nível: num repositório de curso clonado, os módulos de verdade costumam ficar um nível abaixo (`repo-do-curso/modulo03-mcp`). O `listar_modulos` mostra essas subpastas recuadas, com o caminho completo, quando o nome delas começa com "modulo", "aula", "unidade" ou "semana". No `/gerar_quiz`, o autocompletar procura em até três níveis de pastas. Em clientes sem autocompletar, como o Claude Code, basta digitar o número (`3`) ou um trecho do nome (`mcp`): o servidor acha a pasta, sem ligar para acentos, maiúsculas ou zeros à esquerda, e, se houver mais de uma parecida, o assistente pergunta qual você quer.

A busca por texto exato não diferencia maiúsculas nem acentos: `funcao` acha "função", e `FUNÇÃO` acha "funcao". O trecho devolvido mantém o texto original, com os acentos.

Sem filtro, a busca olha todos os tipos, nesta ordem: **anotações, PDFs e por último código**. Ela devolve no máximo 20 resultados, até 3 por arquivo, para um arquivo só não ocupar a lista inteira. Se o limite for atingido, a resposta avisa: aí vale pedir "só nos PDFs" ou "só no módulo X".

## Ignorando arquivos e pastas (`.studynotesignore`)

Crie um arquivo `.studynotesignore` na raiz de `NOTES_DIR` para o servidor ignorar parte do material. O que estiver listado some das duas buscas, da leitura (`ler_material`) e da lista de módulos. Serve para:
- **cópias repetidas**, como o mesmo curso baixado duas vezes;
- **arquivos gerados** por ferramentas, que só repetem o que já está nas suas notas;
- **pastas pessoais** que não devem ir para o modelo.

O formato é o mesmo do `.gitignore`, com um padrão por linha:

```gitignore
# Pastas da cópia em ZIP idênticas ao clone (conferido pelo conteúdo, veja abaixo)
curso-main/modulo01-fundamentos/
curso-main/modulo02-integracao/

# Arquivos gerados, em qualquer pasta
tasks.md
**/rascunhos/

# Fora do alcance do modelo
pessoal/
```

| Padrão | Casa com |
|---|---|
| `tasks.md` (sem `/`) | esse nome em qualquer pasta |
| `pessoal/` (`/` no fim) | só pastas com esse nome |
| `curso-main/modulo01/` (`/` no meio) | o caminho a partir da raiz de `NOTES_DIR` |
| `*`, `?`, `[1-6]` | qualquer trecho de nome, um caractere, um caractere da lista |
| `**` | qualquer número de pastas |

As mudanças valem na próxima busca, sem reiniciar o servidor. Exceções com `!` não são aceitas. Em **MCP: List Servers → Show Output**, a linha `.studynotesignore: N padrão(ões) de exclusão` confirma que o arquivo foi lido.

### Cuidado com cópias: compare o conteúdo, não o nome

O `.studynotesignore` decide pelo **caminho**, sem olhar o conteúdo. Duas pastas com o mesmo nome podem ter arquivos diferentes: uma versão mais nova do curso, ou as suas alterações nos exercícios. Ignorar a pasta inteira esconde essas diferenças sem aviso.

Antes de ignorar uma cópia:
1. **Compare o conteúdo,** por exemplo com `diff -rq pasta-a pasta-b` no Mac e no Linux, ou com a comparação de pastas de uma ferramenta como o WinMerge no Windows.
2. **Ignore só o que for idêntico.** Se uma pasta tiver qualquer arquivo diferente ou a mais, liste as subpastas e os arquivos iguais um a um, em vez da pasta inteira.
3. **Prefira nomes exatos a curingas.** `curso-main/modulo0[1-6]*/` parece ignorar só os módulos 1 a 6 repetidos, mas também pega um `modulo04-versao-nova/` que só existe na cópia.
4. **Refaça a comparação** quando baixar uma versão nova do material: o arquivo não se atualiza sozinho.

Textos idênticos que não forem ignorados não custam tempo de indexação na busca por significado, porque o vetor é calculado uma vez só. Eles só aparecem repetidos nos resultados da busca literal.

## Notas do Obsidian

O [Obsidian](https://obsidian.md) é um app de anotações que guarda cada nota como um `.md` comum, então basta apontar `NOTES_DIR` para a pasta do seu cofre (*vault*). A pasta `.obsidian`, com as configurações do app, é ignorada como toda pasta oculta. Duas convenções do Obsidian são entendidas:

- **`[[links]]`:** ao ler uma nota, `ler_material` lista para qual arquivo cada link aponta, e o modelo pode segui-lo. Vale também para `[[nota#seção]]`, `[[nota|apelido]]` e `![[nota]]`. Com o mesmo nome em duas pastas, fica o arquivo mais perto da raiz, como no app. Links para arquivos que o servidor não lê aparecem como "não encontrado".
- **Frontmatter** (o bloco `---` no topo, com `tags:` e datas): fica fora da busca por significado, onde só atrapalharia. A busca literal continua achando, então procurar `tags: [rag` funciona.

## PDFs e tokens

O texto dos PDFs é extraído na sua máquina e fica em cache enquanto o arquivo não muda. Só vai para o modelo o que a tool devolve: os trechos da busca (até 20 × 200 caracteres) ou as páginas pedidas em `ler_material` (até 5, ~2 mil tokens). O modelo deve buscar primeiro e depois ler só as páginas indicadas. Se notar consumo alto, use o filtro de tipos ou `INCLUDE_PDF=false`.

## Todos os projetos ou só um?

| Onde configurar | Arquivo | Quando usar |
|---|---|---|
| Usuário (recomendado) | **MCP: Open User Configuration** | Você estuda enquanto trabalha em vários projetos e quer o material sempre à mão |
| Só um projeto | `.vscode/mcp.json` dentro do projeto | Você abre uma pasta só para estudar, ou quer o servidor apenas ali |

Para um projeto só, crie `.vscode/mcp.json` com o mesmo conteúdo do README. Se as notas ficam dentro do próprio projeto, use `${workspaceFolder}` no lugar do caminho absoluto:

```json
{
  "servers": {
    "study-notes-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "study-notes-mcp@latest"],
      "env": { "NOTES_DIR": "${workspaceFolder}/notas" }
    }
  }
}
```

Dicas:
- **Escolha um dos dois.** Configurado nos dois lugares, o servidor aparece duplicado e o modelo vê as tools em dobro.
- **Não faça commit de caminhos pessoais.** Se o `.vscode/mcp.json` tiver um caminho da sua máquina, coloque-o no `.gitignore` ou use `${workspaceFolder}`.
- **Configurado para o usuário, mas sem uso em um projeto?** No Copilot Chat, clique no ícone de ferramentas (**Configure Tools**) e desmarque o `study-notes-mcp`. O modelo deixa de ver as 8 tools ali, sem afetar os outros projetos.

## Atualizando

Com `study-notes-mcp@latest` no `mcp.json`, basta reiniciar o servidor em **MCP: List Servers**: o `npx` confere se há versão nova a cada início e baixa sozinho.

Para rodar a partir do código-fonte (estudar, contribuir ou testar mudanças), veja o [CONTRIBUTING.md](../CONTRIBUTING.md#rodando-a-partir-do-código-fonte).
