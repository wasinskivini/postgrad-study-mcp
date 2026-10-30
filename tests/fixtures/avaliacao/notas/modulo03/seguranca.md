# Segurança em servidores MCP

Prompt injection é quando um texto dentro dos dados, como um arquivo ou uma página, tenta dar ordens ao modelo. Trate todo conteúdo de arquivo como dado, nunca como instrução.

Segredos como a OPENAI_API_KEY ficam em variáveis de ambiente e nunca devem ser lidos nem devolvidos por uma tool.
