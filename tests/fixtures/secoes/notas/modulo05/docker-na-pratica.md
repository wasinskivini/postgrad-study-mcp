# Docker na prática

Anotações da aula de containers. O objetivo é empacotar a aplicação com tudo o que ela precisa e rodar igual em qualquer máquina.

## Imagens e camadas

Uma imagem é montada em camadas: cada instrução do Dockerfile gera uma camada nova, empilhada sobre a anterior. Quando uma instrução não muda, o Docker reaproveita a camada guardada em cache e o build fica muito mais rápido. Por isso a ordem importa: primeiro copiamos só o package.json e instalamos as dependências, e só depois copiamos o resto do código. Assim, mudar uma linha do código não obriga a baixar todas as dependências de novo. A imagem final é só leitura; o container é uma instância dela com uma camada de escrita por cima, que some quando o container é removido.

## Volumes

Tudo o que o container grava na própria camada de escrita desaparece quando ele é apagado. Para guardar os dados de um banco, por exemplo, usamos volumes: uma área de armazenamento gerenciada pelo Docker e montada num caminho do container, como /var/lib/postgresql/data. O volume continua existindo mesmo depois de remover o container, e um container novo pode montar o mesmo volume e encontrar os dados. Existe também o bind mount, que liga uma pasta do computador a uma pasta do container; é prático no desenvolvimento, para editar o código e ver a mudança na hora sem reconstruir a imagem.

## Redes entre containers

Containers na mesma rede definida pelo usuário se encontram pelo nome do serviço: a API acessa o banco em postgres:5432, sem precisar saber o IP, porque o Docker tem um DNS interno. A rede padrão (bridge) não oferece essa resolução por nome, por isso o recomendado é criar uma rede própria. Só as portas publicadas com -p ficam acessíveis de fora da máquina; a comunicação interna entre containers não precisa publicar nada, o que reduz a exposição.

## Docker Compose

Com o Compose, descrevemos vários serviços num único arquivo docker-compose.yml: a aplicação, o banco e o cache, cada um com sua imagem, portas, volumes e variáveis. Um único comando, docker compose up, sobe tudo na ordem certa, e docker compose down derruba tudo. O depends_on controla a ordem de inicialização, mas não espera o banco ficar pronto para aceitar conexões; para isso usamos healthcheck com a condição service_healthy.

## Variáveis de ambiente e segredos

Configurações que mudam entre ambientes, como a URL do banco, entram por variáveis de ambiente, nunca escritas no código. Senhas e chaves de API não devem ser copiadas para dentro da imagem: qualquer pessoa com acesso à imagem consegue lê-las nas camadas, mesmo que um passo seguinte apague o arquivo. O caminho certo é passar na hora de rodar, com um arquivo .env fora do controle de versão ou com o recurso de secrets do orquestrador.

## Boas práticas de Dockerfile

Usar imagens base pequenas, como as variantes alpine ou slim, reduz o tamanho e a superfície de ataque. O build em múltiplos estágios compila num estágio com todas as ferramentas e copia só o resultado para uma imagem final enxuta. O container não deve rodar como root: a instrução USER troca para um usuário sem privilégios. E o arquivo .dockerignore evita mandar node_modules, .git e arquivos locais para o contexto do build.
