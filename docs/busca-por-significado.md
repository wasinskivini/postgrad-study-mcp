# Busca por significado (opcional)

[← Voltar ao README](../README.md)

A busca normal é **literal**: procurar "vetor" não acha um trecho que só fala em "embedding". Com `SEMANTIC_SEARCH=true`, a tool `buscar_material` passa a achar também pelo **assunto**, mesmo com palavras diferentes ou em outro idioma. Não existe uma segunda tool: o servidor roda as duas buscas e junta os resultados, então o modelo não precisa decidir qual usar.

## Como ligar

A biblioteca de embeddings entra como um segundo pacote no `npx`, e a variável `SEMANTIC_SEARCH` vai no `env`:

```json
"study-notes-mcp": {
  "type": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "--package=study-notes-mcp@latest",
    "--package=@huggingface/transformers@4.3.2",
    "study-notes-mcp"
  ],
  "env": {
    "NOTES_DIR": "/Users/seu-usuario/Documents/Estudos",
    "SEMANTIC_SEARCH": "true"
  }
}
```

A partir do código-fonte, basta o `"SEMANTIC_SEARCH": "true"`: o `npm install` já instala a biblioteca.

## Como funciona

Ela usa **embeddings**, o mesmo "R" do RAG: cada trecho das suas anotações e PDFs vira um vetor de números, e a busca devolve os trechos com o vetor mais parecido com o da pergunta. Quem gera os vetores é um **modelo de embeddings** ([snowflake-arctic-embed-m-v2.0](https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v2.0), licença Apache-2.0, multilíngue: entende uma pergunta em português sobre um texto em inglês), que roda **dentro do servidor, no seu computador**. Ele não escreve texto nem responde nada, e não precisa de Ollama nem de chave de API.

1. **Primeira vez:** o modelo é baixado do Hugging Face (~310 MB, uma vez só) e guardado em `MODELS_DIR`. É o **único acesso à internet** do servidor. Seus arquivos nunca são enviados: os vetores são calculados localmente.
2. **Indexação:** o servidor divide anotações e PDFs em trechos de até ~800 caracteres, começando um trecho novo em cada título Markdown (`## ...`), para cada trecho falar de um assunto só; seções muito curtas se juntam à seguinte, e um parágrafo maior que um trecho, comum no Obsidian, vira vários, cortados no fim de uma frase. Antes de virar vetor, cada trecho ganha um **cabeçalho** com o nome do arquivo e os títulos da seção (`aula07-arquiteturas-cognitivas/README.md — Aula 7 > ReAct`): um trecho do meio de uma aula passa a "saber" de que assunto ele é. O cabeçalho só entra no vetor; a resposta mostra o trecho como ele está no arquivo. Depois o servidor gera o vetor de cada trecho, em segundo plano. Textos idênticos (como cópias do mesmo material) passam pelo modelo uma vez só. Para ~1.700 arquivos, leva cerca de **6,5 minutos** num Mac com Apple Silicon, **uma vez só**. Uma atualização que muda o modelo ou o jeito de cortar os trechos (como a 1.3.0) refaz o índice uma vez, sozinha. Enquanto isso, a busca avisa que o índice está incompleto e a busca literal continua funcionando.
3. **Depois:** o índice fica salvo em `DATA_DIR/indice-semantico.json`. Nas próximas vezes, só arquivos novos ou alterados são processados, em segundos.

Para acompanhar a indexação sem fazer uma busca, anexe o resource **`estudos://indice`** ao chat (no VS Code: **Add Context → MCP Resources**). Ele mostra o estado (`construindo`, `pronto` ou `erro`), o progresso (`feitos` de `total` arquivos), quantos arquivos e trechos estão no índice e, se algo falhou, o motivo.

Código **não** entra no índice: nomes como `registerTool` já são termos exatos, e a busca literal resolve melhor. Arquivos do [`.studynotesignore`](configuracao.md#ignorando-arquivos-e-pastas-studynotesignore) também ficam de fora.

## Por que juntar as duas buscas

Cada uma erra onde a outra acerta. A literal acha `registerTool` e `OPENAI_API_KEY`, mas não entende sinônimos. A semântica acha o assunto com outras palavras, mas muitas vezes deixa de fora o arquivo que tem o nome exato.

A junção usa *Reciprocal Rank Fusion*: cada busca dá a cada resultado a nota `1 / (60 + posição)`, e as notas se somam. Arquivos que as duas buscas acharam sobem na lista. Se a busca por significado falhar (biblioteca ausente, sem internet para baixar o modelo), a resposta traz só a literal, com um aviso explicando o que falta.

## Quanto isso melhora

Medido em três lugares:
- **Em 48 perguntas sobre um material de curso real** (~1.700 arquivos, privado), escritas com outras palavras a partir de trechos sorteados e feitas ao servidor pelo protocolo MCP: o arquivo certo vem em 1º lugar em 34 delas e entre os 5 primeiros em 44. Até a 1.2.0, com o modelo anterior e sem o cabeçalho, eram 21 e 33. Foi essa medição que escolheu o modelo, entre quatro testados.
- **No material do autor** (~1.900 arquivos, medido na 1.0), para 10 nomes exatos: dos 22 arquivos que a busca literal encontra, a semântica sozinha traz 8 e a híbrida traz 15. Esse material é privado e não está no repositório.
- **No corpus de teste do repositório** (12 arquivos, 25 perguntas, rodando `npm run test:semantic`): no 1º lugar, a literal acerta 11 de 25, e a semântica e a híbrida 22 de 25; entre os 5 primeiros, a semântica e a híbrida acertam todas. Cinco perguntas são termos que aparecem em vários arquivos, onde conta a ordem da literal. O corpus serve para detectar regressões, não para provar ganho.
- **Em notas longas, com várias seções** (`tests/secoes.model.ts`, 18 perguntas escritas com outras palavras): o 1º trecho começa na seção certa em 13 de 18. Com o corte antigo, que ignorava os títulos, era 1 de 18.

## Custos e limites

- A biblioteca ([transformers.js](https://huggingface.co/docs/transformers.js)) ocupa ~470 MB, por isso **não** vem junto com o pacote: só baixa quem acrescentar o segundo `--package`. Sem ela, o resto do servidor funciona normalmente.
- Cada busca por significado devolve até 8 trechos de 500 caracteres, que se juntam aos da busca literal.
- **Memória:** com a busca por significado ligada, cada servidor aberto usa ~1 GB (o modelo fica carregado). Cada cliente (VS Code, Claude Code, Codex) abre o seu próprio servidor.
- Enquanto o índice é montado, os pedidos do cliente têm prioridade: a indexação pausa entre os lotes, e as buscas continuam respondendo.
- Quem atualizou de uma versão anterior à 1.3.0 pode apagar o modelo antigo, em `MODELS_DIR/Xenova` (~120 MB).
- A versão `4.3.2` da biblioteca é a testada com este servidor. Qualquer `4.x` a partir da `4.3.1` funciona: se a sua configuração já aponta para a `4.3.1`, não precisa mudar nada.
