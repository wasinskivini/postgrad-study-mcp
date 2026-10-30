# Reranking

A busca vetorial traz candidatos rápidos, mas nem sempre na melhor ordem. O reranking reordena esses candidatos com um modelo mais preciso, chamado cross-encoder, que lê a pergunta e cada trecho juntos.

É mais lento, por isso só se aplica aos 20 ou 50 primeiros resultados.
