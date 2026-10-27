# Política de segurança

Este servidor lê arquivos da máquina de quem o usa e devolve conteúdo a um modelo de IA. Falhas de segurança aqui podem vazar arquivos ou permitir prompt injection, então elas são tratadas com prioridade.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Uma issue é visível para todo mundo antes de existir correção.

Use o reporte privado do GitHub:

1. Acesse a aba **[Security → Report a vulnerability](../../security/advisories/new)** deste repositório
2. Descreva o problema, como reproduzir (de preferência com um exemplo de arquivo ou chamada de tool) e o impacto

Só o mantenedor vê o reporte. Você recebe uma resposta assim que possível; por ser um projeto educacional mantido por uma pessoa, não há prazo garantido.

## O que conta como vulnerabilidade

- Ler arquivos **fora de `NOTES_DIR`** (por caminho, symlink ou outro truque)
- Ler arquivos que deveriam ser bloqueados (`.env`, ocultos, extensões fora da lista)
- Segredos que **não** são redigidos (`[REDACTED]`) e chegam ao modelo
- Conteúdo de arquivo que consegue **escapar do bloco `<dados_nao_confiaveis>`**
- Prompt injection que passa por **todas** as camadas e faz o modelo agir (ex.: chamar `registrar_duvida`) sem pedido do usuário
- Qualquer escrita fora de `DATA_DIR`

## O que não conta

- O modelo errar uma resposta, interpretar mal um trecho ou ignorar uma tool: o servidor não controla o modelo
- Prompt injection que só gera um **ALERTA** visível ao usuário: é o comportamento esperado
- Problemas do VS Code, do Copilot ou de outro cliente MCP

## Versões suportadas

Apenas a versão mais recente da `main` recebe correções.
