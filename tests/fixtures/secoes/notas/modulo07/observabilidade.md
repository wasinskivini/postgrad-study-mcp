# Observabilidade de aplicações com IA

Anotações sobre como entender o que está acontecendo com o sistema em produção, inclusive com chamadas a modelos de linguagem.

## Logs estruturados

Em vez de frases soltas, cada registro é um objeto com campos fixos: horário, nível, mensagem, identificador da requisição e do usuário. Assim dá para filtrar e agregar com facilidade numa ferramenta de busca. Nunca registrar dados sensíveis, como senhas, tokens ou o conteúdo completo de documentos dos clientes. O nível de detalhe deve ser configurável, para ligar o modo de depuração só quando necessário.

## Métricas

Métricas são números agregados ao longo do tempo: quantidade de requisições por segundo, taxa de erros e latência, observando os percentis 95 e 99, e não só a média, porque a média esconde os casos lentos. Para aplicações com modelos de linguagem, vale acompanhar também tokens de entrada e de saída por chamada e o tempo até o primeiro token chegar, que é o que o usuário sente numa resposta em streaming.

## Traces distribuídos

Um trace acompanha uma requisição inteira pelos vários serviços, dividida em spans: a chamada da API, a consulta ao banco vetorial, a chamada ao modelo e o pós-processamento. Com isso dá para ver exatamente qual etapa está deixando tudo lento. O OpenTelemetry é o padrão aberto para gerar traces, e o identificador do trace deve ser propagado nos cabeçalhos entre os serviços.

## Alertas

Alertas avisam a equipe quando algo sai do normal, mas alertar demais faz as pessoas ignorarem os avisos. O ideal é alertar sobre sintomas que o usuário sente, como erro alto ou lentidão por vários minutos seguidos, e não sobre cada pico isolado de CPU. Cada alerta precisa de um responsável e de um passo a passo do que fazer quando ele dispara.

## Custos de LLM

Cada chamada ao modelo custa de acordo com os tokens enviados e recebidos, e o gasto pode crescer rápido sem ninguém perceber. Registrar o custo estimado por requisição, por funcionalidade e por cliente permite descobrir quem está gastando mais. Cache de respostas repetidas, prompts mais curtos e modelos menores para tarefas simples são as formas mais comuns de reduzir a conta. Um limite de gasto por dia evita surpresas no fim do mês.
