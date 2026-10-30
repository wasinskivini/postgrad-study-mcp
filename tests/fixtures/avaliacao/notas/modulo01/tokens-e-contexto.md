# Tokens e janela de contexto

Um token é um pedaço de texto, em geral uma sílaba ou uma palavra curta. O modelo lê e escreve em tokens, e o custo da chamada depende deles.

A janela de contexto é o limite de tokens que o modelo consegue considerar de uma vez, somando o que você enviou e o que ele responde. Quando a conversa passa desse limite, o começo é descartado e o modelo deixa de lembrar dele.

A temperatura controla o quanto a resposta varia: perto de zero ela é previsível, mais alta ela é criativa.
