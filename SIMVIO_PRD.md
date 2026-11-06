# Simvio — PRD de produto e implementação

Versão: 1.1 consolidada • Data: 31/10/2026 • Status: requisitos para implementação; núcleo SMS depende de validação técnica real.

## 1. Resumo executivo

**Simvio — Seu número. Sua confirmação.**

SaaS brasileiro B2B de verificação de telefone por SMS reverso, com painel web, API e aplicativo Android receptor. O contratante conecta um aparelho com chip próprio. O usuário final envia um SMS com um desafio gerado pelo servidor; o aparelho receptor comunica o recebimento à Simvio, que verifica a correspondência e informa o resultado ao backend do contratante.

O usuário final não instala o aplicativo Simvio. A confirmação do envio ocorre no aplicativo de mensagens do próprio usuário. A Simvio não envia SMS ao usuário e não depende de envio silencioso.

A plataforma confirma evidência de controle do número naquele momento. Não comprova identidade civil, não constitui KYC e não elimina fraude ou troca de chip. O backend do contratante decide como usar a verificação para liberar cadastro ou autenticação.

**Objetivo comercial:** receita recorrente previsível sem cobrança da plataforma por mensagem ou por verificação. Operadoras podem cobrar o SMS do usuário; equipamento, chip e conectividade do receptor são responsabilidade do contratante no modelo inicial.

**Nome aprovado:** Simvio. Direção visual escolhida: símbolo da proposta 1 com tipografia da proposta 3, na paleta petróleo e lima. Preços e slogan são propostas; domínio e registro da marca não foram confirmados.

## 2. Problema, público e hipóteses

### Problema

Desenvolvedores precisam confirmar números e integrar provedores cuja cobrança varia com o uso. A alternativa de receber mensagens em Android próprio existe, mas exige construir validação, expiração, comunicação segura, disponibilidade e acompanhamento.

### Público prioritário

1. Software houses e agências que atendem pequenos negócios.
2. Pequenos SaaS de agendamento, gestão e serviços.
3. Aplicações brasileiras com cadastro predominantemente móvel.

Bancos, pagamentos críticos, grandes volumes e exigência de alta garantia de identidade ficam fora do lançamento.

### Hipóteses a validar

- O comprador aceita manter Android e chip dedicados.
- A economia compensa manutenção e eventual abandono no envio do SMS.
- Usuários compreendem o envio e aceitam eventual custo da operadora.
- A operação suporta picos compatíveis com o segmento.
- O suporte permite margem saudável na assinatura.

Não há pesquisa primária de demanda ou benchmark de capacidade concluído. Não anunciar economia percentual, capacidade ou SLA sem medição.

## 3. Modelo de negócios

| Elemento | Definição inicial |
| --- | --- |
| Receita principal | Mensalidade por aplicações, aparelhos e nível de serviço |
| Unidade de venda | Organização contratante |
| Canal inicial | Venda direta a software houses, demonstração e documentação técnica |
| Benefício | Previsibilidade, número próprio e integração pronta |
| Custos | Infraestrutura, suporte, desenvolvimento, segurança, cobrança e aquisição |
| Expansão | Mais aplicações/aparelhos e integração assistida |
| Diferencial | Verificação pronta, diagnóstico operacional, experiência simples e suporte em português |

### Planos propostos, sujeitos a validação comercial

| Plano | Preço mensal de referência | Aplicações em produção | Aparelhos |
| --- | ---: | ---: | ---: |
| Essencial | R$ 79 | 1 | 1 |
| Profissional | R$ 179 | 5 | 2 |
| Agência | R$ 399 | 20 | 5 |

Sandbox separado não conta como aplicação de produção. Não há créditos de SMS, tarifa por evento ou excedente automático. Capacidade concorrente e requisições por minuto serão definidas após testes e publicadas. Sobrecarga retorna erro recuperável, sem cobrança surpresa.

No piloto, planos e assinaturas são administrados manualmente pelo superadministrador, com trilha de auditoria. Não simular pagamentos nem marcar faturas como pagas sem comprovação. Checkout recorrente fica para fase posterior, após escolha do provedor.

**Economia do comprador:** custo total mensal inclui assinatura, aparelho amortizado, chip, internet e manutenção. Comparar com a alternativa por verificação concluída, considerando conversão e suporte.

**Economia do negócio:** margem de contribuição = receita menos taxas, tributos e custos variáveis atribuídos, inclusive suporte. Receita bruta não é lucro.

## 4. Escopo e limites

### Piloto funcional obrigatório

- Cadastro e acesso do contratante por e-mail e senha; confirmação e recuperação por e-mail com provedor configurável.
- Organizações isoladas, papéis, aplicações e ambientes separados.
- Pareamento seguro de Android, cadastro e comprovação do número receptor.
- API para iniciar, consultar e cancelar verificações.
- Página hospedada de verificação, botão de SMS, alternativa de copiar e QR para desktop.
- Recepção real de SMS no Android e envio seguro ao servidor.
- Validação de remetente, desafio, receptor, aplicação, ambiente, sessão e expiração.
- Webhooks assinados, idempotentes e com novas tentativas.
- Diagnóstico do aparelho, histórico mínimo, planos manuais e painel do operador.
- Documentação e exemplo completo de integração Node.js e PHP/Laravel; exemplos HTTP para outros clientes.
- Docker Compose, migrações, backup/restauração documentados e procedimento de deploy.

### Fora do MVP

Aplicativo receptor iOS, WhatsApp, RCS e iMessage como canais de verificação; envio de SMS pela Simvio; gateway genérico de mensagens; KYC; IA; marketplace; revenda de números; rede compartilhada de chips; Kubernetes; microsserviços; aplicativo nativo para usuário final; roteamento automático de alta escala; login social e checkout recorrente.

### Preservação do conceito

| Classe | Diretriz |
| --- | --- |
| Preservar | SMS originado pelo usuário, Android do contratante e mensalidade |
| Simplificar | Onboarding em três etapas, painel orientado a ações |
| Integrar | API, app receptor e confirmação no backend |
| Automatizar | Correspondência, entrega de resultados e diagnóstico |
| Explorar depois | Redundância e novos canais |
| Não alterar | Não transformar em provedor de SMS de saída ou cobrança por créditos |

## 5. Atores e permissões

| Papel | Permissões |
| --- | --- |
| Superadministrador Simvio | Gerenciar organizações, planos e estado operacional; acesso mínimo a metadados, auditado |
| Proprietário da organização | Configurar organização, membros, aplicações, aparelhos e assinatura |
| Desenvolvedor da organização | Gerenciar integrações e aparelhos; sem alterar proprietário/assinatura |
| Visualizador | Consultar status e relatórios sem revelar segredos |
| Dispositivo receptor | Apenas seus eventos e estado; sem acesso administrativo ou a outras aplicações |
| Backend integrado | Apenas aplicações e ambiente da chave concedida |
| Usuário final | Apenas sua sessão pública, por credencial efêmera |

Todos os objetos e consultas devem aplicar isolamento por organização no servidor. Não confiar em organization_id informado pelo cliente. Não implementar personificação administrativa no MVP.

## 6. Jornadas principais

### 6.1 Contratante: configurar → conectar → testar

1. Criar organização e primeira aplicação, selecionar ambiente e obter chave secreta de servidor.
2. Instalar o Android receptor, autorizar permissões justificadas, parear por QR temporário e registrar linha receptora.
3. Fazer verificação real de teste e copiar exemplo de integração.

Mostrar progresso e o próximo problema a resolver: aparelho sem internet, permissão negada, linha não validada ou integração pendente. A primeira verificação bem-sucedida é o evento de ativação.

### 6.2 Usuário final: informar → enviar → confirmar

1. Informa telefone no sistema do contratante.
2. Backend cria sessão; página hospedada mostra marca do contratante, número receptor, prazo, texto e botão “Enviar SMS para verificar”. Abrir o compositor; o usuário confirma o envio.
3. A página consulta o resultado; mostra sucesso e permite continuar. O backend do contratante valida o resultado pela API ou webhook assinado antes de conceder acesso.

Texto sugerido: “Vamos abrir seu aplicativo de mensagens. Confirme o envio do SMS para verificar este número. Sua operadora pode cobrar pelo envio.”

Não dizer que tocar no botão prova envio ou entrega. Não colocar segredo de API no navegador. O QR de desktop contém somente URL opaca de sessão, nunca segredo administrativo. A continuação web não equivale a autorização de login.

### 6.3 Exceções

- Dual SIM do usuário: orientar escolha da linha do número informado. Remetente divergente nunca aprova; permitir corrigir iniciando nova sessão.
- Sem saldo/cobertura: explicar e oferecer voltar ao contratante; não inventar método alternativo habilitado.
- SMS atrasado: rejeitar após expiração mesmo se o horário alegado pelo aparelho for anterior.
- Mensagem editada, código desconhecido ou remetente alfanumérico: rejeitar sem revelar existência de contas.
- Aparelho offline: bloquear novas sessões para a linha indisponível e informar tentativa posterior. Sessões pendentes preservam prazo original.
- Página fechada: backend pode receber resultado; retorno autenticado ao contratante consulta estado pelo identificador correspondente.
- App Android forçado a parar/permissão revogada: sinalizar estado indisponível quando detectável. Não prometer captura garantida nesse estado.

## 7. Requisitos funcionais e aceite

| ID | Requisito | Aceite |
| --- | --- | --- |
| RF01 | Organizações e acesso | Usuário de A não consulta nem altera dados de B, inclusive por ID direto |
| RF02 | Aplicações/ambientes | Chave de teste não acessa produção; rotação e revogação efetivas |
| RF03 | Pareamento | QR expira em 5 minutos, uso único; exige autorização do proprietário/desenvolvedor |
| RF04 | Linha receptora | Número não é confiável só por digitação; teste de recebimento conclui vínculo |
| RF05 | Iniciar verificação | Backend recebe ID, prazo, destinatário e URL pública; repetição idempotente não duplica |
| RF06 | Página pública | Responsiva, acessível, sem instalação obrigatória; compositor e cópia funcionam |
| RF07 | Captura Android | SMS real é processado; mensagens sem prefixo Simvio não são enviadas nem persistidas pelo app |
| RF08 | Correspondência | Apenas combinação válida e pendente aprova, atomicamente, uma vez |
| RF09 | Estado | API, página e webhook convergem para resultado persistido |
| RF10 | Webhook | Assinatura, retries, tentativas visíveis e reenvio autorizado sem criar nova verificação |
| RF11 | Operação | Última comunicação, linha, permissões e versão visíveis; ausência de sinal vira estado degradado/offline |
| RF12 | Planos | Limites de aplicações/aparelhos no servidor; suspensão bloqueia novas sessões |
| RF13 | Histórico | Telefones mascarados; sem corpo completo de SMS, desafio ou segredo em logs |
| RF14 | Documentação | Exemplo real valida cadastro do início ao fim; guia explica envio e confiança no receptor |
| RF15 | Administração | Mudanças em plano, membros, chaves e dispositivos geram auditoria |

## 8. Motor de verificação

### 8.1 Criação

Apenas backend autenticado cria sessão com telefone E.164, referência opaca da transação e finalidade (cadastro ou verificação). Começar pelo Brasil (+55); rejeitar formatos ambíguos, sem inserir nono dígito por heurística.

Gerar desafio aleatório criptográfico de pelo menos 128 bits, codificado em texto ASCII curto: `SIMVIO <token>`. Usar prazo inicial de 5 minutos, definido pelo servidor. Armazenar digest do desafio, não texto puro. Para permitir repetição idempotente da resposta de criação, guardar o envelope necessário cifrado com TTL até expiração; excluir depois. Alternativa equivalente deve ser documentada sem enfraquecer o segredo.

Fixar na sessão: organização, aplicação, ambiente, referência, remetente esperado e linha/dispositivo receptor. Não trocar destinatário de sessão em andamento. Retry após falha exige nova sessão e invalida a anterior para a mesma transação.

### 8.2 Estados

`pending → verified | expired | cancelled | failed`.

Estados terminais são imutáveis. `failed` representa falha definitiva explicitamente classificada, não uma mensagem avulsa inválida. Webhook tem estado separado; falha na entrega do webhook não desfaz `verified`.

A expiração é verificada em cada operação no servidor, independentemente do job de limpeza. Suspensão bloqueia criações; sessões pendentes podem terminar até o prazo. Revogação por incidente de segurança invalida imediatamente as sessões pendentes vinculadas.

### 8.3 Recepção e validação

Evento contém event_id, identidade autenticada do aparelho, linha vinculada, remetente, token extraído e timestamps. Timestamp do aparelho é informativo. O prazo é comparado ao relógio do servidor no processamento autoritativo.

Aprovar somente se credencial ativa, organização/aplicação/ambiente corretos, receptor correto, remetente E.164 exato, desafio correspondente e sessão pendente no prazo. Fazer atualização condicional e criação do evento de saída na mesma transação. Deduplicar eventos e mensagens repetidas. Mensagens multipartes devem ser remontadas antes da análise; ambiguidades de SIM receptor falham de forma segura.

Nunca aprovar com base somente em telefone, código, clique, redirecionamento, resposta do frontend ou declaração não autenticada de recebimento.

### 8.4 Limite de confiança

Um receptor comprometido ou seu titular malicioso pode fabricar evidências: autenticação do aparelho não comprova origem na operadora. A solução inicial confia no Android dedicado administrado pelo contratante. Não vender como prova independente contra o próprio contratante, resistência a phishing, MFA garantido ou prevenção completa de SIM swap.

## 9. Android receptor

Preferência: Kotlin e Jetpack Compose. Primeiro validar em aparelho real a combinação de versão Android, permissões, captura de SMS, comportamento em segundo plano e distribuição.

- Solicitar somente permissões necessárias; câmera apenas para QR, com alternativa de código de pareamento.
- Receber novos SMS por APIs permitidas; não varrer histórico por padrão. SMS Retriever não deve ser tratado como substituto automático para um gateway genérico.
- Filtrar localmente pelo formato Simvio; não transmitir outras mensagens. A filtragem não elimina a sensibilidade da permissão de recebimento.
- Persistir fila mínima de eventos cifrada, com proteção de chaves via Android Keystore e exclusão após confirmação/expiração. Usar identificadores estáveis para repetição segura.
- Entrega orientada a eventos; trabalho persistente para retries, observando limitações de agendamento. Não presumir que WorkManager executa em segundos ou que serviço permanente é sempre permitido.
- Não manter wakelock contínuo ou solicitar isenção de bateria indiscriminadamente. Documentar comportamento medido por fabricante e Android.
- Diagnóstico de conexão, permissões, fila e teste real. Heartbeat é melhor esforço; “visto recentemente” não garante recepção.
- MVP de produção aceita uma linha receptora inequívoca por aparelho; dual SIM só é habilitado após validar identificação confiável da assinatura.
- Revogar pareamento encerra envio autenticado e remove dados/credenciais locais quando o app receber a revogação.
- Publicar instruções de instalação, atualização e assinatura do APK; chaves de assinatura fora do repositório.

Distribuição Google Play depende de política e aprovação. APK privado pode servir ao piloto autorizado, com riscos operacionais documentados; não é promessa de aprovação nem caminho para contornar políticas. Não exigir ser app padrão de SMS como truque para obter permissões. Se houver impedimento, entregar evidência e opções viáveis, sem simular sucesso.

## 10. Web, páginas e experiência

Rotas funcionais: landing, preços, documentação, cadastro/login/recuperação; onboarding; visão geral; aplicações (ambientes/chaves/webhook); aparelhos; verificações; equipe; assinatura; configurações; administração Simvio e página pública de verificação.

Preferir poucas telas com contexto, drawers para edição e componentes reutilizáveis. Interface pt-BR, mobile-first, navegação por teclado, contraste acessível, foco visível e mensagens de erro acionáveis. Nenhum refresh interrompe formulário.

Direção visual escolhida: petróleo e lima, símbolo da proposta 1 com tipografia da proposta 3. Usar exclusivamente os arquivos finais de `01_IDENTIDADE_VISUAL/`, sem redesenhar marca ou copiá-la das telas. As imagens de `02_TELAS_REFERENCIA/` orientam layout; suas variações de marca, textos técnicos, preços e limites não substituem este PRD. Não reabrir a escolha de paleta/logo nem exigir nova aprovação para aplicar a direção já selecionada. Consultar `04_DOCUMENTACAO/COBERTURA_E_CORRECOES.md` para as telas sem imagem e divergências dos mockups.

Dashboard prioriza: “Está pronto para verificar?”, aparelhos indisponíveis e verificações com falha. Métricas decorativas não substituem ação.

## 11. API e integração

Contrato inicial a consolidar em OpenAPI:

| Operação | Endpoint sugerido | Autenticação |
| --- | --- | --- |
| Criar sessão | POST /v1/verifications | Chave secreta da aplicação/ambiente |
| Consultar sessão | GET /v1/verifications/{id} | Mesma aplicação/ambiente |
| Cancelar | POST /v1/verifications/{id}/cancel | Mesma aplicação/ambiente |
| Estado público mínimo | GET /v1/public/sessions/{opaqueToken} | Credencial efêmera de sessão |
| Evento do aparelho | POST /v1/device-events | Credencial exclusiva do aparelho |
| Estado do aparelho | POST /v1/devices/heartbeat | Credencial exclusiva do aparelho |

Criar retorna verification_id, status, expires_at, receiver_number, message_body e verification_url. Dados de composição ficam acessíveis apenas ao backend criador e à sessão pública correspondente. Nunca registrar URLs/tokens completos em telemetria; página sem analytics de terceiros e com Referrer-Policy restritiva.

Idempotency-Key é obrigatória na criação; escopo organização/aplicação/ambiente, TTL inicial 24h. Mesma chave e payload retorna mesma sessão; payload divergente retorna conflito. Após expiração não devolver novamente o segredo; exigir nova chave e transação válida.

Erros consistentes: entrada inválida, acesso negado, indisponibilidade de receptor, conflito, expiração e limite. Respostas não enumeram usuários ou organizações.

Redirecionamento de conclusão somente para URLs previamente cadastradas. Não incluir sinalizador confiável de login na URL. Integração deve associar a referência opaca ao usuário/sessão original e consumir a verificação no backend uma única vez para o efeito desejado.

### Webhooks

`verification.verified`, `verification.expired`, `verification.cancelled` e `verification.failed`. Payload mínimo: event_id, type, verification_id, application_id, environment, reference, status e occurred_at. Telefone mascarado por padrão; detalhes somente via API autorizada.

Assinar bytes originais com HMAC-SHA256, timestamp e event_id; segredo por endpoint armazenado cifrado. Documentar verificação de timestamp e deduplicação. Entrega pelo menos uma vez, sem promessa de ordenação. Retries sugeridos: imediato, 10s, 1min, 5min, 30min, 2h e 6h. Após limite, mostrar falha e permitir reentrega. Consulta autenticada é fonte de recuperação.

Destino HTTPS validado; impedir SSRF para loopback, redes privadas, link-local, metadados de nuvem e IPv6 equivalente. Verificar DNS no envio e desabilitar redirects. Não enviar segredo a destino não autorizado. Callback local só em ambiente de desenvolvimento explicitamente isolado.

## 12. Dados e segurança

Entidades mínimas: Organization, User, Membership, Application, ApiKey, Device, ReceiverLine, PairingSession, Verification, DeviceEvent, WebhookEndpoint, OutboxEvent, WebhookDelivery, Plan, Subscription e AuditLog.

- Monólito modular; PostgreSQL como persistência e fila/outbox inicial. Worker separado do mesmo código, sem Redis obrigatório.
- Índices por organização, ambiente, status e expiração; unicidade de eventos/idempotência; relações impedem associação cruzada.
- Chaves de API fortes, exibidas uma vez e armazenadas por digest; escopos separados de aparelho, aplicação e painel.
- Senhas com hash resistente apropriado; sessões web em cookies HttpOnly/Secure, proteção CSRF quando aplicável, rate limiting e encerramento/revogação.
- Segredos necessários para assinatura cifrados; chave mestra fora do banco, com rotação documentada. Sem tokens em localStorage ou repositório.
- Pareamento comprova vínculo ao tenant; não expõe chave de aplicação no QR.
- Rate limits por aplicação, telefone, sessão e origem; resposta inválida não permite bloquear arbitrariamente outro usuário.
- Superadmin provisionado por procedimento seguro; sem senha padrão. Acesso administrativo com segundo fator TOTP antes de produção paga, independente do receptor SMS.
- Testar falsificação/replay de eventos, autenticação cruzada, acesso por ID, concorrência e duplicidade.

### Privacidade por desenho

Como proposta operacional a revisar antes do lançamento: contratante controla a finalidade da verificação; Simvio trata os dados sob instruções para a operação contratada e define responsabilidades próprias para conta/cobrança. Validar contratos, base legal e avisos com responsável habilitado; não declarar conformidade LGPD automática.

Retenção inicial proposta: corpo integral do SMS não armazenado no servidor; desafio e dados transitórios eliminados na expiração; telefone completo cifrado e evidências mínimas até 7 dias; histórico operacional mascarado até 30 dias; auditoria sem segredos até 90 dias. Estes prazos são decisões de produto, não prazos legais. Documentar expurgo, exclusão da organização, limites decorrentes de obrigações aplicáveis e envelhecimento dos backups. Logs de cobrança têm política própria quando existirem.

## 13. Arquitetura e operação sugeridas

Para projeto novo: monorepo Turborepo com React + Vite + TypeScript + Tailwind + shadcn/ui + Lucide no web; Node.js + TypeScript + Prisma + PostgreSQL no backend; Kotlin/Compose no Android. Reaproveitar stack existente compatível se houver repositório. Não fixar versões sem verificar compatibilidade e manutenção na implementação.

Estrutura sugerida: apps/web, apps/api, apps/worker, apps/android, packages/contracts e docs. Android usa Gradle; não forçar toolchain Android dentro de npm.

Docker Compose com Nginx como entrada única, web na porta interna 3000, API na porta interna 3001, worker e banco sem exposição pública. Sem PM2. Execução local não precisa de provedor externo para o núcleo SMS reverso; envio de e-mail exige provedor real configurado. Mailpit só no desenvolvimento, claramente identificado.

Configuração por ambiente, migrações seguras, health/readiness, logs estruturados sem PII, backup cifrado e restauração testada. CI para lint, tipos, testes, builds web/API e compilação Android quando o ambiente suportar. Documentar limitação se não houver SDK Android ou aparelho disponível.

Não publicar, comprar domínio, contratar serviços ou acessar VPS sem autorização correspondente. Preparar os artefatos locais necessários e comandos de implantação.

## 14. Requisitos não funcionais e métricas

Metas propostas para piloto, não SLA comercial:

- p95 da API de criação/consulta abaixo de 500ms no ambiente e carga documentados, excluindo transporte SMS.
- p95 do processamento após evento aceito abaixo de 2s e primeira tentativa de webhook abaixo de 5s, em operação saudável.
- Zero aprovação incorreta nos testes adversos definidos.
- Perda de conectividade não duplica efeitos; mensagens processadas após prazo não aprovam.
- Recuperação após reinício de API/worker preserva sessão e outbox.

Medir separadamente criação → envio confirmado pelo usuário (quando observável), recepção → processamento e processamento → entrega. Não afirmar medir entrega da operadora a partir de um clique.

Indicadores: primeira verificação real, conclusão/abandono, tempo ponta a ponta, motivos de falha, disponibilidade observada do aparelho, webhook entregue, chamados por organização, receita recorrente, cancelamento e margem após suporte. Capacidade por aparelho será medida e publicada com modelo, Android, operadora, intensidade e duração do teste.

## 15. Etapas de implementação

### Etapa 0 — Prova técnica do núcleo

Entregar fluxo mínimo real: servidor cria desafio → usuário envia SMS → Android recebe → servidor valida. Testar tela apagada, reinício, falta de internet, mensagem duplicada/atrasada, permissão negada/revogada e encerramento forçado. Registrar permissões e distribuição possíveis. Não construir todo o painel antes dessa prova.

Sem aparelho: concluir o que for verificável, entregar APK/guia e marcar explicitamente recepção real como pendente. Simulador não satisfaz o aceite físico.

### Etapa 1 — Base SaaS e integração

Organização, acesso, aplicações, ambientes, pareamento, página hospedada, motor transacional e API documentada. Aceite: dois tenants isolados e verificação real com exemplo integrado.

### Etapa 2 — Confiabilidade e operação

Outbox, retries, revogação, histórico, diagnóstico, limites e proteção contra abuso. Aceite: reinício e indisponibilidade recuperam sem aprovação duplicada ou tardia.

### Etapa 3 — Piloto comercial

Planos manuais, membros, superadmin, TOTP administrativo, guia de instalação/deploy, backup restaurado e revisão de segurança. Aceite: checklist de produção e limitações reais publicados; nenhum pagamento fictício.

### Posterior ao piloto

Cobrança recorrente, SDKs completos, mais linhas por aparelho, redundância e operação gerenciada somente com evidência de demanda e decisão explícita de escopo.

Cada etapa deve registrar o que funciona, testes executados, limitações e próximo passo em docs/STATUS.md. Não reinventar arquitetura entre etapas nem repetir auditorias completas sem motivo.

## 16. Matriz mínima de validação

| Caso | Resultado esperado |
| --- | --- |
| SMS correto no prazo | Uma aprovação e evento de saída persistidos |
| Remetente divergente | Não aprova; sessão legítima continua até prazo |
| Receptor/aplicação/ambiente errado | Não aprova nem revela sessão alheia |
| Token expirado/cancelado/consumido | Não altera estado terminal |
| Dois eventos concorrentes | Um único efeito de aprovação |
| Mesmo evento reenviado | Resposta idempotente |
| Dispositivo revogado | Evento recusado; pendências invalidadas |
| Relógio Android adulterado | Não estende prazo |
| Credencial pública tentando consultar outras sessões | Acesso negado |
| Callback para IP interno ou redirecionado | Bloqueado |
| Webhook duplicado | Exemplo do contratante aplica efeito uma vez |
| Worker reinicia após commit | Outbox permite entrega posterior |
| Mensagem não Simvio | Não enviada/persistida pelo aplicativo |
| RCS/iMessage sem SMS efetivo | Não assume sucesso; orientação clara |
| Chip receptor trocado/número cadastrado incorreto | Exige revalidação antes de ativar |

## 17. Critério de conclusão

Produto só é declarado funcional quando o fluxo real ocorrer com Android e SMS, backend integrado, persistência e resultado verificável. Produção paga exige decisões registradas sobre distribuição, capacidade, operadora, privacidade, backups e suporte. Interface com dados simulados não é implementação concluída.

## 18. Evidências e pendências

Fontes consultadas em 30/10/2026; rever políticas e versões durante implementação:

- IDlayr, Reverse SMS: https://idlayr.com/products/reverse-sms/ — referência do mecanismo, não garantia de segurança da Simvio.
- SMS Gateway for Android: https://docs.sms-gate.app/ — referência técnica de gateway Android.
- SimGate: https://www.simgate.app/pricing — referência comercial de assinatura com chip próprio; não copiar planos ou limites como capacidade validada.
- Google Play, permissões SMS: https://support.google.com/googleplay/android-developer/answer/10208820 — acesso depende de enquadramento e análise; uso principal não garante aprovação.
- Android, trabalho em segundo plano: https://developer.android.com/develop/background-work/background-tasks — escolher API conforme tarefa e restrições, sem garantia de execução imediata.
- Apple, filtragem: https://developer.apple.com/documentation/identitylookup/sms-and-mms-message-filtering — filtragem não fundamenta promessa de gateway iOS.
- NIST SP 800-63B: https://pages.nist.gov/800-63-4/sp800-63b.html — referência de riscos de autenticação pela rede telefônica; não certifica a Simvio.

Pendências de lançamento: domínio/marca, condições de operadoras, rota de distribuição, medições físicas, provedor de e-mail, revisão de privacidade e preço final. Resolver sem transformar hipóteses em promessas.

## 19. Contrato obrigatório de infraestrutura — VPS compartilhada

Esta seção prevalece sobre sugestões genéricas de arquitetura anteriores.

- Usar **monorepo Turborepo**, Docker e Docker Compose. Não usar PM2.
- Apenas o container Nginx da Simvio publica uma porta no host: `${SIMVIO_PORT}:80`. Definir `SIMVIO_PORT` no ambiente, sem assumir que 80, 443 ou outra porta está livre.
- Web escuta em `0.0.0.0:3000` dentro do seu container. API escuta em `0.0.0.0:3001` dentro do seu container. Essas portas NÃO usam `ports` no Compose. `expose` pode documentá-las, mas a proteção depende da ausência de publicação e da configuração de rede.
- O Nginx encaminha `/api/` para `api:3001`, removendo somente o prefixo `/api`: `/api/v1/verifications` chega à API como `/v1/verifications`. Documentar e testar a barra final de `proxy_pass`.
- As demais rotas vão para `web:3000`. O servidor web de produção entrega o build estático e aplica fallback SPA; não usar Vite dev server ou preview em produção. Um servidor estático apropriado pode ser um segundo Nginx interno escutando em 3000, sem publicação no host.
- A URL pública de API é `https://<dominio>/api/v1`; frontend e página hospedada usam mesma origem. Nenhuma URL pública menciona 3000 ou 3001. Android usa essa base HTTPS configurada.
- Documentação/OpenAPI respeita `/api`; healthcheck do Nginx não deve ser confundido com prontidão do banco/API.
- Worker não publica porta HTTP; PostgreSQL não publica 5432. Comunicação ocorre por DNS de serviços nas redes privadas do Compose. Separar rede de entrada e rede de dados quando apropriado.
- Não usar `network_mode: host`, IP fixo, `container_name` global nem rede/volume compartilhado entre aplicações por padrão. Usar nome de projeto Compose exclusivo, como `simvio`, para isolar recursos.
- Persistência do PostgreSQL em volume próprio. Configuração por ambiente, logs com rotação, limites de recursos revisáveis e healthchecks. Não apagar volumes para atualizar.
- Se a VPS já tiver proxy Nginx central, preservar sua configuração e demais vhosts: ele termina HTTPS e encaminha o domínio Simvio para `127.0.0.1:${SIMVIO_PORT}`. Nesse cenário, publicar o Nginx Simvio em `127.0.0.1:${SIMVIO_PORT}:80`; a única porta publicada do projeto fica acessível apenas localmente.
- Porta única significa uma publicação TCP pelo projeto Simvio. O proxy central existente pode continuar atendendo seus 80/443. TLS deve estar ativo na origem pública antes do piloto externo; definir corretamente cabeçalhos encaminhados e confiança no proxy para cookies seguros, IP e rate limiting.
- Sem proxy central, documentar terminação TLS por uma única porta HTTPS do próprio serviço, sem inventar acesso HTTP inseguro para produção. Não ocupar portas existentes silenciosamente.
- Arquivos obrigatórios: Dockerfiles multi-stage, `compose.yaml`, configuração Nginx, `.env.example`, guia de deploy/atualização/rollback/backup. Segredos não entram no build frontend nem nas imagens.

### Aceite de infraestrutura

1. `docker compose config` válido e `docker compose ps` mostra somente o Nginx com porta publicada.
2. Build de produção; UI, refresh em rota interna, `/api/v1`, documentação e fluxo de verificação funcionam pelo mesmo endereço.
3. 3000, 3001 e 5432 não são publicadas no host pela Simvio.
4. Subir duas cópias com nomes de projeto e portas externas diferentes não gera colisão.
5. Reiniciar a stack preserva banco e outbox. Instalação não altera aplicações vizinhas.
6. Proxy HTTPS central preserva esquema, host e IP corretamente, sem confiar em cabeçalhos arbitrários de clientes.

## 20. Decisões visuais consolidadas e precedência

A escolha de paleta inicialmente citada como opção 3 foi corrigida expressamente pelo usuário para **petróleo e lima**. Essa correção prevalece. Petróleo #073E42, lima #C6F36A, mineral #F3F7F3 e branco. Logo horizontal e símbolo são arquivos finais separados, em PNG transparente; variações brancas preservam o canal alpha do arquivo-base.

Precedência funcional: este PRD consolidado → documentação do pacote → imagens conceituais. Precedência da marca: `01_IDENTIDADE_VISUAL/` → referência de paleta. Nunca usar `99_HISTORICO_NAO_IMPLEMENTAR/` como direção atual.

As telas usam dados ilustrativos e contêm divergências, explicitadas no relatório. Corrigir no software: planos Essencial R$79/1 aplicação/1 aparelho; Profissional R$179/5 aplicações/2 aparelhos; Agência R$399/20 aplicações/5 aparelhos, sujeitos a validação comercial. Não há franquias por quantidade de mensagens nem aplicações ilimitadas. Nunca desativar assinatura de webhook. A Simvio não envia SMS de teste: o próprio operador/usuário envia o teste para o receptor. QR e destinatário reais precisam conter dados válidos, não números mascarados do mockup. O servidor gera o desafio; o integrador não escolhe um OTP curto.

O pacote reúne todas as imagens disponíveis desta conversa, não uma cobertura visual completa de todas as rotas. Ausência de imagem não elimina requisito do PRD: implementar a tela mantendo componentes, acessibilidade e direção selecionados. Consultar a lista de lacunas no relatório.
