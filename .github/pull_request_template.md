## O que muda

<!-- Descreva a mudança em poucas linhas. Se resolve uma issue, cite: "Resolve #12" -->

## Por quê

<!-- Qual problema isso resolve ou que caso de uso habilita? -->

## Como testar

<!-- Passos para o revisor conferir, por exemplo uma pergunta no Copilot Chat ou uma chamada no MCP Inspector -->

## Checklist

- [ ] `npm run typecheck && npm test` passam localmente
- [ ] Adicionei ou ajustei testes em `tests/mcp.test.ts` para a mudança
- [ ] Texto vindo de arquivo passa por `prepareUntrusted` e `wrapUntrusted` (PASSO 4.4 e 4.5)
- [ ] O servidor continua sem LLM e sem acesso à rede (a única exceção é o download opcional do modelo de embeddings)
- [ ] Atualizei os comentários de passo (1.x a 5.x) se mudei algum fluxo
- [ ] Atualizei o README (e a seção "Entendendo o código", se for o caso)
- [ ] Não incluí material do curso, credenciais reais, `.env` ou caminhos da minha máquina
