# Pipeline de RAG

Resumo do módulo sobre geração aumentada por recuperação: como fazer o modelo responder com base nos nossos documentos, e não só no que aprendeu no treino.

## Ingestão de documentos

O primeiro passo é carregar o material: PDFs, páginas web, planilhas e anotações. Cada formato precisa de um leitor próprio, e é aqui que limpamos cabeçalhos repetidos, rodapés e numeração de página, que só atrapalham depois. Também guardamos metadados de cada documento, como título, autor, data e a URL de origem, porque eles permitem filtrar a busca e citar a fonte na resposta final.

## Divisão em trechos

Documentos longos não cabem inteiros no contexto e geram vetores pouco específicos, então eles são cortados em pedaços menores, de algumas centenas de tokens. Cortar respeitando parágrafos e títulos mantém cada pedaço sobre um assunto só. Um pouco de sobreposição entre pedaços vizinhos evita que uma ideia fique partida ao meio. Pedaços pequenos demais perdem contexto; grandes demais misturam assuntos e diluem o significado.

## Geração de embeddings

Cada pedaço vira um vetor de números por meio de um modelo de embeddings. Textos com significado parecido ficam com vetores próximos, mesmo usando palavras diferentes. O mesmo modelo precisa ser usado para os documentos e para as perguntas, senão os vetores não são comparáveis. Modelos multilíngues permitem perguntar em português e encontrar trechos escritos em inglês.

## Recuperação

Na hora da pergunta, ela também vira vetor, e buscamos os pedaços com maior similaridade de cosseno, normalmente os cinco ou dez mais próximos. Bancos vetoriais usam índices aproximados, como o HNSW, para fazer isso rápido com milhões de vetores. A busca híbrida junta essa busca por significado com a busca por palavras exatas, o que ajuda com nomes próprios, siglas e códigos de erro.

## Reranking

Os primeiros resultados da busca vetorial nem sempre estão na melhor ordem. Um modelo de reranking, como um cross-encoder, lê a pergunta e cada pedaço juntos e dá uma nota de relevância mais precisa. Ele é lento demais para rodar sobre todos os documentos, por isso só reordena os candidatos que a busca já trouxe.

## Geração da resposta

Os pedaços escolhidos entram no prompt junto com a pergunta e uma instrução clara: responda usando apenas o contexto fornecido e cite de onde tirou cada informação. Se o contexto não tiver a resposta, o modelo deve dizer que não sabe, em vez de inventar. Limitar a quantidade de contexto também controla o custo, que cresce com o número de tokens enviados.

## Avaliação

Para saber se o sistema melhorou, medimos separadamente a recuperação e a resposta. Na recuperação, olhamos se o pedaço certo aparece entre os primeiros resultados, com métricas como recall@k. Na resposta, verificamos se ela é fiel ao contexto e se responde de fato à pergunta. Um conjunto fixo de perguntas com as respostas esperadas permite comparar cada mudança, em vez de decidir no olho.
