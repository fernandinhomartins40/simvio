Implemente a Simvio seguindo o arquivo `SIMVIO_PRD.md`, na raiz deste pacote. Leia também `04_DOCUMENTACAO/IDENTIDADE_E_USO.md` e `04_DOCUMENTACAO/COBERTURA_E_CORRECOES.md`. Converse sempre em português do Brasil.

Quero uma implementação funcional, por etapas, sem ampliar o escopo. Primeiro inspecione o repositório e suas instruções, reaproveite o que existir, registre um plano curto em `docs/PLANO.md` e comece a implementar. Não pare apenas no plano nem peça confirmação a cada decisão reversível.

PRODUTO
SaaS de verificação de telefone por SMS reverso. O contratante conecta seu Android com chip próprio; o usuário final não instala Simvio. Ele informa o número, abre o aplicativo de mensagens, confirma o envio do SMS e aguarda. O Android receptor encaminha o evento à API, que valida remetente, desafio, receptor, aplicação, ambiente, sessão e prazo. O backend integrado decide liberar cadastro/login. A Simvio não envia OTP ao usuário. Cobrança mensal, sem créditos por mensagem.

STACK E VPS
Use monorepo Turborepo, React + Vite + TypeScript + Tailwind + shadcn/ui + Lucide; backend Node.js + TypeScript + Prisma + PostgreSQL; Android nativo Kotlin + Jetpack Compose. Docker Compose, monólito modular e worker do mesmo código. Não usar PM2 ou adicionar infraestrutura sem necessidade.
Nginx é o único serviço com porta publicada: porta externa configurável por SIMVIO_PORT. Internamente, web em 3000 e API em 3001, sem publicar essas portas nem 5432. / vai para web:3000; /api/ vai para api:3001, removendo apenas o prefixo /api. API pública /api/v1, mesma origem. Worker e banco privados. Se houver Nginx central na VPS, preserve as outras aplicações e entregue vhost HTTPS de exemplo apontando para a única porta local da Simvio. Não publique ou altere a VPS sem autorização correspondente.

VISUAL
A direção já está escolhida: petróleo e lima. Use os arquivos de `01_IDENTIDADE_VISUAL/`, os PNGs de `03_ASSETS_TRANSPARENTES/` e as referências de `02_TELAS_REFERENCIA/`. Não redesenhe, regenere, estique ou substitua símbolo e tipografia. Não use `99_HISTORICO_NAO_IMPLEMENTAR/` na aplicação.
Construa componentes reais, não telas inteiras como imagem. Interface simples para leigos, responsiva, acessível, textos curtos, uma ação principal e drawers para edição. As imagens têm dados e textos inconsistentes: prevalece o PRD e a lista de correções. Implemente também as telas previstas no PRD sem imagem, mantendo o mesmo sistema visual. Não reabra a escolha de marca nem crie uma nova direção.

EXECUÇÃO
1. Prove o núcleo: sessão criada → SMS real enviado pelo usuário → Android recebe → API valida → backend integrado recebe/consulta resultado. Valide permissões e limites de segundo plano/distribuição Android; não suponha aprovação no Google Play.
2. Entregue a base SaaS: contas, organizações isoladas, papéis, aplicações, ambientes, pareamento seguro, página de verificação, painel e exemplos de integração.
3. Complete confiabilidade: expiração e consumo atômicos, deduplicação, revogação, outbox transacional, webhooks assinados com retries e proteção contra SSRF, diagnóstico e recuperação de falhas.
4. Complete o piloto: planos manuais conforme PRD, equipe, administração, segurança, documentação, backup/restauração e deploy.

QUALIDADE E CONCLUSÃO
Não use mocks como resultado final, não exponha segredos no frontend/logs e não permita acesso cruzado entre organizações. Teste os casos críticos do PRD, inclusive mensagens erradas/atrasadas/duplicadas e reinício do worker. Entregue migrações, .env.example, OpenAPI, exemplos Node.js e PHP/Laravel, builds, projeto Android/APK quando possível e instruções de execução.
Se faltar aparelho ou credencial, conclua o trabalho independente e deixe o teste externo como pendência concreta, sem inventar sucesso. Diferencie implementado, compilado, testado automaticamente e validado com SMS real. Mantenha `docs/STATUS.md` para continuidade e prossiga até concluir o escopo possível, sem ciclos de refatoração ou auditoria desnecessários.

Comece agora lendo o PRD e o repositório, escreva o plano curto e implemente a prova técnica do núcleo.
