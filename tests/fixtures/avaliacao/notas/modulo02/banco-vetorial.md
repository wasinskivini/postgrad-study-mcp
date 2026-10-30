# Banco vetorial

Um banco vetorial guarda os embeddings e devolve os mais próximos de uma consulta. Exemplos são o pgvector, que roda dentro do PostgreSQL, e o Chroma.

Para milhões de vetores, usa-se um índice aproximado como o HNSW, que troca um pouco de precisão por muita velocidade.
