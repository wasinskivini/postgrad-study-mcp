# Entendendo o código

[← Voltar ao README](../README.md)

Este projeto também serve para aprender a construir um servidor MCP. O código é comentado como um **roteiro de leitura em passos**: cada arquivo é um passo, e cada ponto importante dentro dele tem um número (2.4, 3.6...). Os comentários citam esses números, então dá para seguir uma chamada de um arquivo para o outro. Cada arquivo começa com um mapa das suas seções.

## Estrutura

```
src/
  index.ts           # PASSO 1 — ponto de entrada: liga o servidor ao transporte stdio
  mcp.ts             # PASSO 2 — o que o servidor oferece: tools, resources e prompts
  service.ts         # PASSO 3 — as regras: tipos de arquivo, busca, leitura, PDFs, dados salvos
  safety.ts          # PASSO 4 — as proteções: caracteres invisíveis, segredos, prompt injection
  semantic.ts        # PASSO 6 — (opcional) busca por significado com embeddings
tests/
  helpers.ts         # PASSO 5.1 — cliente MCP de teste (sobe o servidor de verdade)
  pdf.ts             # PASSO 5.2 — gera PDFs mínimos para os testes
  mcp.test.ts        # PASSO 5.3 — testes de ponta a ponta
  semantic.test.ts   # PASSO 5.4 — busca semântica sem o modelo (trechos, similaridade, fusão)
  semantic.model.ts  # PASSO 5.5 — busca semântica com o modelo de verdade
  pacote.smoke.ts    # PASSO 5.6 — instala o pacote do npm numa pasta vazia e sobe o servidor
  avaliacao.model.ts # PASSO 5.7 — mede o acerto das buscas (literal, semântica e híbrida)
  fixtures/          # anotações de exemplo
```

## Ordem de leitura sugerida

| Passo | Arquivo | O que você aprende |
|---|---|---|
| 1 | [src/index.ts](../src/index.ts) | Como um servidor MCP sobe e por que o stdout é sagrado (1.1 a 1.5) |
| 2 | [src/mcp.ts](../src/mcp.ts) | Como declarar tools (2.3 a 2.8), resources (2.9) e prompts (2.10); instructions (2.1) e validação (2.2) |
| 3 | [src/service.ts](../src/service.ts) | Tipos, limites, filtros e `.studynotesignore` (3.1 a 3.3), PDFs (3.4, 3.8), busca (3.6), leitura (3.7), segurança de caminhos (3.9), dados (3.10), formato do Obsidian (3.11) |
| 4 | [src/safety.ts](../src/safety.ts) | As camadas contra vazamento e prompt injection (4.1 a 4.5) |
| 5 | [tests/](../tests/) | Como testar um servidor MCP pelo próprio protocolo |
| 6 | [src/semantic.ts](../src/semantic.ts) | (Opcional) Embeddings na prática: dividir em trechos, indexar, buscar por similaridade (6.1 a 6.5) e juntar com a busca literal (6.6) |

## O caminho de uma busca, passo a passo

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
                                                                        PASSO 3.6    └ pontua e ordena (nome, título, palavra inteira, tipo)
                                                                        PASSO 4.4    └ cada trecho: invisíveis, alertas, segredos
                                                                        PASSO 4.5  delimita como <dados_nao_confiaveis>
Copilot ◄──────────────────── resultado (texto + structuredContent) ──  PASSO 1.1  sai pelo stdout
```

Depois disso, o modelo decide se lê as páginas (`ler_material` → PASSO 2.5 → 3.7 → 3.9 → 3.8 → 4.4 → 4.5) e escreve a resposta.

## Como o quiz e o plano de revisão funcionam

O servidor **não tem LLM**: um prompt MCP é só uma mensagem pronta. Ao escolher `gerar_quiz`, o servidor valida o módulo e devolve um texto que pede ao modelo do seu chat para buscar as suas anotações (com as tools deste servidor) e montar as perguntas. Quem escreve o quiz é o modelo.

Por isso os prompts pedem que **cada resposta venha com a fonte** (`arquivo:linha` ou `arquivo, p. N`) e que o modelo diga "não encontrei" em vez de completar com conhecimento geral. No quiz, as fontes aparecem só junto das respostas, no final, para não entregar o gabarito. Isso não impede o modelo de errar, mas torna qualquer resposta suspeita conferível em segundos.

No `plano_de_revisao`, o próprio servidor lê as suas dúvidas e o seu progresso e já os coloca no texto do prompt. O modelo só precisa buscar no material onde revisar cada assunto.

No `gerar_quiz`, o argumento `modulo` usa o autocompletar do MCP (*completions*, PASSO 2.10): enquanto você digita, o servidor sugere os módulos que existem, nos clientes que suportam esse recurso.

## Para mexer no código

Veja o [CONTRIBUTING.md](../CONTRIBUTING.md): como rodar a partir do código-fonte, os scripts, as convenções e como os testes funcionam.
