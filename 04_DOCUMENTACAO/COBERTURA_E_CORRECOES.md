# Cobertura visual e correções de implementação

## Imagens disponíveis de telas

16 arquivos: landing desktop/mobile/tablet; planos; primeiros passos; início; aplicações; integração; aparelhos; verificações; avisos automáticos; equipe; assinatura; fluxo de verificação do usuário (4 estados); recuperação do usuário (4 estados); Android teste/início/atividade (4 estados). Algumas imagens são pranchas com mais de uma tela.

## Sem arquivo final disponível nesta entrega

Acesso/cadastro/recuperação de conta e confirmação de e-mail; documentação técnica; pareamento Android por QR no painel; configurações/segurança; superadmin; Android boas-vindas/pareamento/permissão/cadastro da linha; Android offline/permissão revogada/diagnóstico/ajustes; adaptações específicas do painel para tablet/mobile e estados vazios.

Essas funções continuam no PRD. Não declarar o conjunto como todas as rotas desenhadas. A prancha de acesso chegou a aparecer durante geração, mas não há arquivo recuperado no diretório final desta sessão.

## Divergências das imagens: corrigir no software

- Usar somente os planos e limites de aplicações/aparelhos do PRD. Não copiar preços inconsistentes, cotas mensais de SMS, 'mais escolhido', número ilimitado de aplicações ou métricas ilustrativas como afirmações comerciais.
- Todos os webhooks são assinados. Não implementar botão para desativar essa proteção, mesmo que apareça na imagem.
- Usuário/operador envia SMS; a Simvio não envia mensagem de teste nem OTP. Um clique não comprova o envio.
- Servidor gera desafio forte. Os códigos de seis dígitos e snippets dos mockups não são o contrato da API.
- URL pública na mesma origem, /api/v1. Não presumir domínio adquirido com base em texto da imagem.
- Não entregar destinos mascarados nem QR desenhado por IA no fluxo real. Gerar QR válido e exibir o destinatário real quando necessário ao envio; mascarar históricos e relatórios.
- 'Visto agora' é comunicação recente do app, não garantia de funcionamento da recepção SMS. Validar com teste real.
- Verificação confirmada e webhook entregue são estados diferentes.
- Marca: substituir qualquer versão distorcida dos mockups pelos arquivos finais sem redesenhá-los.
- Mobile: reorganizar em coluna, controles acessíveis e conteúdo legível; não copiar os três planos espremidos da prancha.
- Não alegar conformidade, segurança absoluta, SLA ou desempenho sem evidência.

As imagens são direção visual, não especificação funcional nem software implementado.
