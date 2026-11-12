# study-notes-mcp

[![npm](https://img.shields.io/npm/v/study-notes-mcp)](https://www.npmjs.com/package/study-notes-mcp) [![test](https://github.com/wasinskivini/study-notes-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/wasinskivini/study-notes-mcp/actions/workflows/test.yml)

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) que deixa o assistente de IA do seu editor (Copilot, Claude...) **consultar o seu material de estudo**: anotações, PDFs das aulas e código. Ele responde citando de onde tirou cada informação, registra dúvidas, acompanha o progresso e monta quizzes e planos de revisão.

```
Você:     O que eu anotei sobre chunking?
Copilot:  Chunking divide documentos grandes em trechos menores antes de gerar
          os embeddings (modulo03/aula-rag.pdf, p. 2). Nas suas notas, o tamanho
          usado foi de ~800 caracteres (modulo03/rag.md:14).
```

- **Respostas com fonte:** cada informação vem com `arquivo:linha` ou `arquivo, p. N`, para você conferir.
- **Acha pelo assunto:** com a [busca por significado](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/busca-por-significado.md) ligada, "como cortar documentos grandes?" encontra a nota sobre *chunking*, mesmo sem a palavra.
- **Local e gratuito:** roda no seu computador, sem chave de API, sem Ollama e sem banco de dados.
- **Seguro com conteúdo não confiável:** mascara segredos e avisa sobre *prompt injection* nos arquivos lidos.
- **Funciona com qualquer pasta:** anotações em Markdown, PDFs das aulas, código e notas do [Obsidian](https://obsidian.md).

> **O servidor não traz conteúdo nenhum.** Ele busca na **sua** pasta de estudos. Cada pessoa aponta para a própria pasta, e ninguém acessa os arquivos de ninguém.

---

## Instalação (passo a passo)

**1. Pré-requisitos:** **Node.js 22.18 ou mais novo** (confira com `node -v`) e o **VS Code** com o **GitHub Copilot** (o plano Free funciona). Também funciona no [Claude Code, no Codex e em outros clientes MCP](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/clientes.md).

**2. Escolha a pasta de estudos.** Ela vira o `NOTES_DIR`, e cada subpasta de primeiro nível vira um módulo. Não precisa reorganizar nada: aponte para onde você já guarda o material. Se um módulo estiver dentro de outra pasta, como num repositório de curso clonado, use o caminho completo (`repo-do-curso/modulo03-mcp`).

```
Pós IA/
  modulo01-fundamentos/     ← suas anotações (.md, .txt)
  modulo03-mcp/             ← PDFs das aulas
  repo-do-curso/            ← código (.ts, .js, .py)
```

**3. Configure o VS Code.** Abra `Cmd+Shift+P` (Mac) ou `Ctrl+Shift+P` (Windows/Linux) → **MCP: Open User Configuration** e adicione dentro de `"servers"`:

```json
{
  "servers": {
    "study-notes-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "study-notes-mcp@latest"],
      "env": {
        "NOTES_DIR": "/Users/seu-usuario/Documents/Pós IA"
      }
    }
  }
}
```

O caminho precisa ser **absoluto**. No Windows, use `/`: `"C:/Users/seu-usuario/Documents/Pos IA"`. Não precisa baixar nada: o `npx` busca o pacote no npm na primeira vez, o que leva alguns segundos.

**4. Inicie:** **MCP: List Servers** → `study-notes-mcp` → **Start Server**. Em **Show Output**, deve aparecer `Discovered 7 tools`.

**5. Use:** abra o Copilot Chat no modo **Agent** e pergunte algo sobre o seu material. Na primeira vez, o VS Code pede permissão para cada tool: clique em **Allow**.

Algo deu errado? Veja os [problemas comuns](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/problemas-comuns.md).

> ⚠️ **Material do curso é seu, não do repositório.** PDFs, slides e gravações costumam ter direitos autorais: mantenha-os só na sua pasta local e **nunca** faça commit deles em repositório público.

---

## Exemplos de uso

| Você pede | O servidor faz |
|---|---|
| `O que eu anotei sobre embeddings?` | `buscar_material` em anotações, PDFs e código |
| `Busque "chunking" só nos PDFs e leia a página onde aparece` | `buscar_material` → `ler_material` com as páginas |
| `Registre uma dúvida no modulo03: quando usar resource em vez de tool?` | `registrar_duvida` |
| `Marque a aula 05 do modulo03 como concluída` | `marcar_aula_concluida` |
| `Quais dúvidas eu ainda tenho pendentes?` | `ver_estudos` |

Os prompts prontos aparecem digitando `/` no chat: `/mcp.study-notes-mcp.gerar_quiz` monta um quiz sobre um módulo, com a fonte de cada resposta, e `/mcp.study-notes-mcp.plano_de_revisao` monta a revisão da semana a partir das suas dúvidas. No quiz, o módulo pode ser o número (`3`), um trecho do nome (`mcp`) ou o caminho da pasta. Se ficar vazio ou houver mais de uma pasta parecida, o assistente pergunta qual você quer. Quem escreve o quiz e o plano é o modelo do chat: o servidor entrega o pedido e o material.

## O que o servidor oferece

| Tipo | Nome | O que faz |
|---|---|---|
| 🔧 Tool | `listar_modulos` | Lista os módulos (subpastas de `NOTES_DIR`) |
| 🔧 Tool | `buscar_material` | Busca por nome exato ou por pergunta em anotações, PDFs e código, com filtro por tipo e por módulo |
| 🔧 Tool | `ler_material` | Lê uma anotação, um arquivo de código ou páginas de um PDF |
| 🔧 Tool | `registrar_duvida` | Salva uma dúvida para revisar depois |
| 🔧 Tool | `resolver_duvida` | Marca uma dúvida como resolvida, sem apagá-la do histórico |
| 🔧 Tool | `marcar_aula_concluida` | Marca uma aula como concluída |
| 🔧 Tool | `ver_estudos` | Mostra as dúvidas pendentes e as aulas concluídas |
| 📄 Resource | `estudos://duvidas`, `estudos://progresso` | Os mesmos dados em JSON, para anexar ao chat |
| 💬 Prompt | `gerar_quiz`, `plano_de_revisao` | Quiz sobre um módulo e plano de revisão da semana |

---

## Saiba mais

| Documento | O que tem |
|---|---|
| [Clientes testados](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/clientes.md) | Como configurar no Claude Code e no Codex, e o que funciona em cada cliente |
| [Configuração](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/configuracao.md) | Variáveis, tipos de arquivo, `.studynotesignore`, notas do Obsidian, PDFs, usar em todos os projetos ou só num, atualizar |
| [Busca por significado](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/busca-por-significado.md) | Como ligar, como funciona e quanto melhora a busca |
| [Segurança e privacidade](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/seguranca-e-privacidade.md) | O que sai do seu computador, custos e as proteções contra vazamento e *prompt injection* |
| [Problemas comuns](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/problemas-comuns.md) | Sintomas e soluções |
| [Entendendo o código](https://github.com/wasinskivini/study-notes-mcp/blob/main/docs/entendendo-o-codigo.md) | Estrutura, ordem de leitura e o caminho de uma busca, para quem quer aprender a construir um servidor MCP |
| [Contribuindo](https://github.com/wasinskivini/study-notes-mcp/blob/main/CONTRIBUTING.md) | Rodar a partir do código-fonte, scripts, testes e pull requests |

> 🎓 **Projeto educacional.** Criado durante a pós-graduação em Engenharia de Software com IA Aplicada para praticar a construção de servidores MCP e apoiar os estudos. Não é um produto oficial do curso nem da instituição, não tem garantia de funcionamento (veja a [licença](LICENSE)) e não substitui o material e as orientações dos professores.

## Licença

[ISC](LICENSE)
