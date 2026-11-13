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

Ela usa **embeddings**, o mesmo "R" do RAG: cada trecho das suas anotações e PDFs vira um vetor de números, e a busca devolve os trechos com o vetor mais parecido com o da pergunta. Quem gera os vetores é um **modelo de embeddings** pequeno ([multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small), licença MIT), que roda **dentro do servidor, no seu computador**. Ele não escreve texto nem responde nada, e não precisa de Ollama nem de chave de API.

1. **Primeira vez:** o modelo é baixado do Hugging Face (~145 MB, uma vez só) e guardado em `MODELS_DIR`. É o **único acesso à internet** do servidor. Seus arquivos nunca são enviados: os vetores são calculados localmente.
2. **Indexação:** o servidor divide anotações e PDFs em trechos de ~800 caracteres (um parágrafo maior que isso, comum no Obsidian, vira vários trechos, cortados no fim de uma frase) e gera o vetor de cada um, em segundo plano. Textos idênticos (como cópias do mesmo material) passam pelo modelo uma vez só. Para ~1.900 arquivos, leva cerca de **1,5 minuto** num Mac com Apple Silicon. Enquanto isso, a busca avisa que o índice está incompleto e a busca literal continua funcionando.
3. **Depois:** o índice fica salvo em `DATA_DIR/indice-semantico.json`. Nas próximas vezes, só arquivos novos ou alterados são processados, em segundos.

Código **não** entra no índice: nomes como `registerTool` já são termos exatos, e a busca literal resolve melhor. Arquivos do [`.studynotesignore`](configuracao.md#ignorando-arquivos-e-pastas-studynotesignore) também ficam de fora.

## Por que juntar as duas buscas

Cada uma erra onde a outra acerta. A literal acha `registerTool` e `OPENAI_API_KEY`, mas não entende sinônimos. A semântica acha o assunto com outras palavras, mas muitas vezes deixa de fora o arquivo que tem o nome exato.

A junção usa *Reciprocal Rank Fusion*: cada busca dá a cada resultado a nota `1 / (60 + posição)`, e as notas se somam. Arquivos que as duas buscas acharam sobem na lista. Se a busca por significado falhar (biblioteca ausente, sem internet para baixar o modelo), a resposta traz só a literal, com um aviso explicando o que falta.

## Quanto isso melhora

Medido em dois lugares:
- **No material do autor** (~1.900 arquivos), para 10 nomes exatos: dos 22 arquivos que a busca literal encontra, a semântica sozinha traz 8 e a híbrida traz 15. Esse material é privado e não está no repositório.
- **No corpus de teste do repositório** (12 arquivos, 20 perguntas, rodando `npm run test:semantic`): a literal acerta o arquivo em 1º lugar em 6 de 20 perguntas, e a semântica e a híbrida em 18 de 20. Com tão poucos arquivos, a híbrida só empata com a semântica. O corpus serve para detectar regressões, não para provar ganho.

## Custos e limites

- A biblioteca ([transformers.js](https://huggingface.co/docs/transformers.js)) ocupa ~470 MB, por isso **não** vem junto com o pacote: só baixa quem acrescentar o segundo `--package`. Sem ela, o resto do servidor funciona normalmente.
- Cada busca por significado devolve até 8 trechos de 500 caracteres, que se juntam aos da busca literal.
- A versão `4.3.2` da biblioteca é a testada com este servidor. Qualquer `4.x` a partir da `4.3.1` funciona: se a sua configuração já aponta para a `4.3.1`, não precisa mudar nada.
