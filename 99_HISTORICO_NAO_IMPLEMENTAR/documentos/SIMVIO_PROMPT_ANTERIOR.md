# Prompt de implementação — Simvio

Copie o bloco abaixo no Claude Code e anexe o arquivo `SIMVIO_PRD.md`. Prefira usar em um repositório de trabalho com terminal e possibilidade de compilar Android.

---

Você vai implementar a **Simvio**, seguindo o arquivo `SIMVIO_PRD.md` anexado como especificação principal. Converse comigo em português do Brasil. Quero software funcional e verificável, sem ampliar o escopo.

## Produto

Simvio é um SaaS de verificação de telefone por SMS reverso, com mensalidade, painel web, API e Android receptor do contratante. O usuário final NÃO instala Simvio: informa telefone, abre seu aplicativo de SMS com uma mensagem preenchida, confirma o envio e recebe a confirmação na aplicação que está usando.

A mensagem chega ao Android do contratante. O app comunica o evento ao servidor, que valida remetente + token + receptor + aplicação + ambiente + sessão + prazo, e informa o resultado ao backend integrado. A aplicação integrada decide se concede cadastro/login. Não enviar SMS pela Simvio, não criar gateway genérico e não cobrar por créditos ou mensagens.

## Como trabalhar

1. Leia o PRD, as instruções do repositório e a estrutura existente. Se houver código, preserve o que funciona; não recrie tudo sem necessidade.
2. Registre um plano curto em `docs/PLANO.md`, com as quatro etapas do PRD, critérios de aceite e pendências. Comece a trabalhar; não pare apenas depois de apresentar o plano.
3. Implemente primeiro a prova técnica de ponta a ponta. Não gaste dias construindo telas antes de validar recepção real de SMS no Android e integração com o servidor.
4. Continue pelas etapas em ordem. Faça testes pertinentes a cada entrega e registre o resultado em `docs/STATUS.md`. Não peça confirmação a cada arquivo ou decisão técnica reversível.
5. Se faltar aparelho, credencial ou decisão externa indispensável, conclua o trabalho independente, explique exatamente o que falta e prepare o procedimento mais curto para eu fornecer ou testar. Nunca declare teste físico concluído com simulação.
6. Não expanda para funcionalidades posteriores ao piloto. Não faça refatorações estéticas ou novas auditorias gerais em ciclos sem necessidade.

## Arquitetura

Para projeto novo, use a arquitetura sugerida no PRD: monorepo Turborepo, React/Vite/TypeScript/Tailwind/shadcn/ui/Lucide no web; Node.js/TypeScript/Prisma/PostgreSQL no backend; Kotlin/Jetpack Compose no Android. Monólito modular, worker do mesmo código e outbox no PostgreSQL. Docker Compose e Nginx como entrada única, seguindo obrigatoriamente a seção 19 do PRD. Sem PM2, Kubernetes, microsserviços ou Redis sem necessidade demonstrada.

Verifique versões compatíveis e documentação oficial atual. Se existir projeto compatível, reaproveite a stack. Android usa Gradle; não invente um app nativo apenas com uma página web.

## Prioridade técnica absoluta

Antes de todo o painel, prove: criar sessão → abrir SMS no celular do usuário → receber SMS real no Android pareado → verificar no servidor → consultar resultado e avisar o backend integrado.

Investigue permissões SMS, trabalho em segundo plano e distribuição. Não suponha aprovação no Google Play. Não use Accessibility, leitura de notificações ou app padrão falso para contornar restrições. SMS Retriever não resolve automaticamente captura de um gateway genérico. Não prometa funcionamento durante encerramento forçado. Se houver bloqueio real, documente evidência e opções; não esconda com mocks.

Distribuição privada para piloto só deve ser tratada como alternativa operacional documentada, com instalação consciente e permissões corretas. Não publicar nada nem contratar serviços sem autorização.

## Regras obrigatórias

- Multi-tenancy e ambientes isolados no servidor; testes de acesso cruzado por ID.
- Chaves secretas somente em backend; aparelho tem credencial própria e revogável.
- Pareamento temporário, uso único e linha receptora comprovada por teste.
- Desafio criptográfico de pelo menos 128 bits, prazo do servidor e digest armazenado. Se precisar repetir resposta idempotente, envelope cifrado com TTL, conforme o PRD.
- Estados terminais imutáveis; SMS atrasado, duplicado, de outro remetente, linha ou ambiente nunca aprova.
- Atualização atômica e outbox transacional. Duplicidade não pode duplicar efeito na aplicação integrada.
- Não confiar em horário do celular, clique no botão, parâmetro de URL ou resultado do frontend.
- Página hospedada com link de SMS, cópia e QR para desktop; links e composição testados em Android e iPhone do usuário final. Não criar receptor iOS.
- O app filtra mensagens localmente e transmite somente eventos Simvio; não copiar caixa de SMS ou corpo integral para o servidor.
- Webhooks HMAC sobre bytes originais, timestamp, event_id, retries e proteção contra SSRF. Ensine o integrador a verificar assinatura e deduplicar.
- Sessões do painel seguras, controle de papéis, TOTP para administração antes de produção paga, logs sem segredos e expurgo conforme política configurada.
- Aparelho offline bloqueia novas sessões; heartbeat não é prova de captura. Diagnóstico deve mostrar limitações reais.
- Planos mensais manuais no piloto, sem checkout fictício, sem fatura paga inventada e sem cobrança por uso.
- Qualquer dado fictício deve existir apenas em ambiente de desenvolvimento/testes, identificado como tal.

## Experiência e visual

Priorize três etapas claras: configurar → conectar → testar para o contratante; informar → enviar → confirmar para o usuário final. Interface em português, responsiva, acessível e objetiva; prefira drawers para edição.

Use wordmark tipográfico Simvio até haver logo aprovada. Apresente uma direção visual breve para aprovação antes de aplicá-la ao frontend completo; continue backend, Android e contratos enquanto aguarda. Não exija imagens, branding completo ou animações para concluir o núcleo. Não insira recursos extras por gosto próprio.

## Entregas

- Código web, backend, worker e Android, com persistência real.
- Migrações e configuração por ambiente; `.env.example` sem segredos.
- APK compilado para piloto se o ambiente permitir; caso contrário, projeto compilável e instruções precisas. Diferencie build de teste de release assinado.
- OpenAPI e exemplos executáveis Node.js e PHP/Laravel com verificação de resultado no servidor e deduplicação de webhook.
- Documentação de instalação, atualização, limites, backup/restauração e deploy Docker/Nginx.
- Testes significativos dos cenários críticos do PRD, inclusive concorrência, isolamento, replay, expiração, revogação e recuperação da outbox.
- Relatório final com o que foi implementado, comandos/testes realmente executados, itens pendentes e restrições encontradas.

## Conclusão e continuidade

Não declare conclusão apenas porque o layout abre ou o build passa. Diferencie claramente: implementado, compilado, testado em ambiente automatizado e validado com SMS real. Sem aparelho disponível, deixe o teste físico como pendência objetiva e não bloqueie outras entregas independentes.

Mantenha `docs/STATUS.md` suficiente para continuar em outra sessão sem repetir o trabalho. Ao terminar cada etapa, informe o resultado de forma curta e prossiga quando não houver dependência externa impeditiva.

**Comece lendo o PRD e o repositório, registre o plano curto e implemente a prova técnica do núcleo.**

---

## Uso dos arquivos

1. Coloque `SIMVIO_PRD.md` no repositório ou anexe à conversa do Claude.
2. Envie o prompt acima.
3. Quando solicitado, realize o teste em Android com chip e envio de SMS real. Não compartilhe senhas, chaves de assinatura ou acesso à VPS na conversa; use os mecanismos seguros do ambiente.

O nome Simvio está definido. Domínio, marca, preço final, identidade visual e distribuição ainda exigem validação. Este prompt autoriza desenvolvimento local no ambiente fornecido; não compra domínio, publica aplicativo nem contrata provedores.

## Exigência expressa do proprietário: VPS com várias aplicações

Implemente com Docker + Docker Compose em monorepo Turborepo. O Nginx é o único serviço com porta publicada. Use web interno em 3000 e backend interno em 3001, ambos escutando em 0.0.0.0 nos containers. Não publique 3000/3001/5432 no host.

Roteamento: `/api/` → `api:3001` retirando apenas `/api`; `/` → `web:3000`. API pública na mesma origem: `/api/v1`. Entregue frontend de produção, sem Vite dev/preview. PostgreSQL e worker ficam privados.

Porta externa configurável por `SIMVIO_PORT`, sem assumir porta livre. Se houver Nginx central na VPS, preserve-o e publique apenas `127.0.0.1:${SIMVIO_PORT}:80` para o Nginx Simvio; forneça vhost de exemplo para HTTPS do domínio. Não aplique alterações na VPS sem autorização. Sem proxy central, documente TLS na única porta pública. Não confunda a porta única do projeto com as portas do proxy compartilhado existente.

Não use `network_mode: host`, nomes globais fixos de container ou recursos compartilhados entre projetos. Faça teste de duas instâncias em portas externas diferentes. Forneça Dockerfiles multi-stage, Compose, Nginx, `.env.example`, comandos de build/deploy/rollback e teste comprovando uma única publicação de porta. A seção 19 do PRD prevalece sobre padrões genéricos.
