# Transporte stdio

No transporte stdio o cliente inicia o servidor como um processo filho e troca mensagens JSON-RPC pelo stdin e pelo stdout.

Por isso nunca se escreve log no stdout, pois isso corrompe o protocolo. Os logs vão para o stderr.
