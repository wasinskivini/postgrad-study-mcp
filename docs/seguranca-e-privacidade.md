# Segurança e privacidade

[← Voltar ao README](../README.md)

- [O que sai do seu computador](#o-que-sai-do-seu-computador)
- [Custos](#custos)
- [Proteções](#proteções)

## O que sai do seu computador

| Parte | Onde roda | Envia seu material para fora? |
|---|---|---|
| Este servidor (busca literal, leitura, dúvidas, progresso) | No seu computador | Não |
| Busca por significado (modelo `multilingual-e5-small`) | No seu computador | Não. Só baixa o modelo uma vez do Hugging Face |
| O modelo do seu cliente MCP (Copilot, no caso do VS Code) | Na nuvem | **Sim**, apenas os trechos que as tools devolvem |

O modelo da busca por significado não é um LLM de conversa: ele só transforma texto em números para comparar significados, e isso acontece localmente. O que sai do computador é o resultado que o Copilot lê para responder, como acontece com qualquer arquivo que ele abre.

O servidor reduz esse envio: devolve trechos em vez de arquivos inteiros e troca segredos por `[REDACTED]` antes de responder. O que acontece com os dados depois disso depende da política do seu cliente (por exemplo, se o Copilot da sua conta ou organização permite usar os dados para treino).

> Não coloque em `NOTES_DIR` material sigiloso ou com dados pessoais: mesmo com as proteções abaixo, o que for lido vai para o modelo. Para manter uma pasta fora do alcance, use o [`.studynotesignore`](configuracao.md#ignorando-arquivos-e-pastas-studynotesignore).

## Custos

**Rodar o servidor não custa nada.** Ele não usa nenhuma API de IA nem chave e não tem LLM: só lê arquivos na sua máquina e devolve texto. A única exceção é opcional: com `SEMANTIC_SEARCH=true`, ele baixa uma vez o modelo de embeddings, que depois roda localmente e de graça. Por isso também não há `.env` com credenciais: o [`.env.example`](../.env.example) lista as cinco variáveis, e nenhuma é secreta.

Quem "pensa" é o modelo do **seu** cliente MCP, cobrado pelo plano dele:

| Onde roda | Custo |
|---|---|
| `study-notes-mcp` (busca, PDFs, dúvidas, busca por significado) | Grátis, local |
| Modelo do Copilot Chat | Conforme o seu plano do Copilot. No **Free** há um limite mensal de uso e nada é cobrado. Estudantes podem pedir o **Pro** grátis pelo [GitHub Education](https://education.github.com) |
| Outros clientes (Claude, Cursor…) | Conforme o plano de cada um |

O servidor limita o que manda ao modelo (até 20 trechos de 200 caracteres por busca, arquivos de texto até 200 KB e PDFs de até 5 páginas por leitura), para não encher o contexto.

## Proteções

Tudo que as tools devolvem é enviado ao modelo do seu cliente MCP. Por isso o servidor aplica várias camadas de proteção.

**Acesso a arquivos**
- Lista fechada de extensões: `.env`, `.json`, chaves (`.pem`, `.key`) e qualquer outra extensão nunca são lidos
- Arquivos e pastas ocultos (`.env`, `.git`, `.oculta/`) e `node_modules`, `dist`, `build`, `coverage`, `venv` são ignorados
- Caminhos com `../` e symlinks que apontam para fora de `NOTES_DIR` são bloqueados
- O que estiver no `.studynotesignore` não é buscado nem lido
- Segredos que aparecem no código (chaves `sk-…`, `ghp_…`, AWS, Google, Slack, chaves privadas, `apiKey = "…"`, `senha: "…"`, credenciais em URLs) são trocados por `[REDACTED]`

**Prompt injection.** Não existe proteção 100%, então são várias camadas:
- O conteúdo dos arquivos volta delimitado por `<dados_nao_confiaveis id="…">`, com um id aleatório a cada chamada: o arquivo não consegue "fechar" o bloco e escrever fora dele
- Caracteres invisíveis (zero-width, controle de direção, tag characters Unicode) são removidos, porque servem para esconder instruções do leitor humano
- Padrões típicos de injeção ("ignore as instruções anteriores", "you are now", `<system>`, "não conte ao usuário"…) geram um **ALERTA** no resultado e o campo `alertas` no `structuredContent`
- As `instructions` do servidor e os prompts dizem ao modelo para tratar o conteúdo como dados e só falar de prompt injection quando houver uma linha `⚠️ ALERTA`
- `registrar_duvida` recusa textos com padrões de injeção, para nada ser "plantado" no histórico que depois volta via `ver_estudos` e `plano_de_revisao`
- Os nomes dos `[[links]]` do Obsidian também ficam dentro do bloco não confiável, porque vêm do arquivo
- Argumentos das tools têm tamanho máximo e não aceitam caracteres invisíveis; `gerar_quiz` só aceita módulos que existem

**Dados e modelo**
- Tools anotadas com `readOnlyHint`, para o cliente distinguir leitura de escrita. As de escrita só alteram os JSONs em `DATA_DIR`, criados com permissão `600`
- Busca por significado: o modelo é baixado de um commit fixo do Hugging Face (uma versão nova publicada lá não é baixada sem querer), e o índice salvo em `DATA_DIR` guarda o texto já com segredos redigidos, com permissão `600`

> Essas proteções valem para o que passa por este servidor. O Copilot tem ferramentas próprias (ler arquivos, terminal) que não passam por aqui. Para controlar o que elas podem fazer, use as configurações de aprovação de tools do VS Code.

Encontrou uma falha de segurança? Não abra issue pública: veja o [SECURITY.md](../SECURITY.md).
