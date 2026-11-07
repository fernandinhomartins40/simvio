# Android receptor — permissões, segundo plano e distribuição

Projeto: `apps/android` (Kotlin + Jetpack Compose, Gradle próprio). `applicationId` definitivo
`br.com.simvio.receptor` (debug: `br.com.simvio.receptor.debug`); o pacote do código continua
`app.simvio.receptor`. minSdk 26, targetSdk 36.

## Compilar

```bash
cd apps/android
./gradlew testDebugUnitTest assembleDebug     # APK de teste (assinado com chave debug local)
./gradlew assembleRelease bundleRelease        # APK e AAB de release (R8)
```

No GitHub, o workflow `android-apk.yml` gera os dois assinados: o APK vai para a release fixa
`receptor` (link da página inicial) e o AAB da Play Store fica como artefato da execução por 30 dias.
O `versionCode` é o número da execução do workflow.

Saídas: `app/build/outputs/apk/debug/app-debug.apk` e `app/build/outputs/apk/release/`.

### Assinatura de release

A chave **nunca** entra no repositório. Crie fora do projeto:

```bash
keytool -genkeypair -v -keystore ~/simvio-release.jks -alias simvio -keyalg RSA -keysize 4096 -validity 10000
```

E informe por `apps/android/keystore.properties` (ignorado pelo git) ou variáveis de ambiente:

```properties
storeFile=/caminho/simvio-release.jks
storePassword=...
keyAlias=simvio
keyPassword=...
```
(`SIMVIO_KEYSTORE_FILE`, `SIMVIO_KEYSTORE_PASSWORD`, `SIMVIO_KEY_ALIAS`, `SIMVIO_KEY_PASSWORD`.)
Guarde a chave com backup seguro: perder a chave impede atualizar o app instalado.

## Permissões

| Permissão | Motivo | Observação |
|---|---|---|
| `RECEIVE_SMS` | Encaminhar as mensagens `SIMVIO <token>` | As demais não saem do aparelho. |
| `READ_SMS`, `SEND_SMS`, `RECEIVE_MMS`, `RECEIVE_WAP_PUSH` | Exigidas do app de SMS padrão | Conversas ficam no aparelho e não vão à API. |
| `POST_NOTIFICATIONS` | Avisar mensagem nova | Pedida depois de virar app padrão. |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Encaminhar eventos e diagnosticar rede | — |

Nenhuma permissão de SMS é pedida avulsa: elas vêm com o papel de app de SMS padrão (`RoleManager`),
como exige a política de SMS da Play Store. A tela de ativação é a divulgação exigida (o que sai do
aparelho, o que fica, link para https://simvio.com.br/privacidade) antes do pedido.

Não solicitamos câmera (o QR é lido pelo leitor do Google Play services, com alternativa de digitar
o código), nem `READ_PHONE_STATE`/`READ_PHONE_NUMBERS`, nem isenção
direta de otimização de bateria (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). O app só **abre** a tela do
sistema para o operador decidir.

**Dual SIM:** sem permissão extra, o app envia o índice de assinatura (`subscription_id`) do SMS
(`EXTRA_SUBSCRIPTION_INDEX`, com a chave legada `subscription` como reserva em Androids antigos).
A linha grava o SIM que recebeu o teste; eventos de outro SIM (ou sem índice) falham com
`rejected_receiver_sim`. Recomendação do piloto: um único chip ativo no aparelho receptor.

## App de SMS padrão (aparelho dedicado)

Obrigatório desde a versão 1.0.0: depois de conectar, o app só segue se for o app de SMS padrão. Ele passa a receber (`SMS_DELIVER`), gravar na
caixa do sistema, notificar, listar conversas e enviar. O encaminhamento continua só no `SmsReceiver`.
Mensagens `SIMVIO` não são gravadas em aparelho conectado. **MMS não é baixado.** Enviar sempre depende
de toque do operador; links `sms:` só preenchem a tela. O Play Protect continua alertando sobre o APK
instalado fora da loja; para clientes finais o caminho é a Play Store.

## Segundo plano — como funciona e limites

- O receiver de `SMS_RECEIVED` é declarado no manifesto e protegido por `BROADCAST_SMS`. Esse broadcast
  é isento das restrições de broadcasts implícitos e acorda o app mesmo fechado.
- Ao receber, o evento é gravado numa **fila cifrada** (AES-GCM com chave no Android Keystore) e há
  uma tentativa imediata de envio (`goAsync`, ~10 s). Se falhar, um `OneTimeWorkRequest` do WorkManager
  com restrição de rede e backoff exponencial (10 s base) repete. Não usamos trabalho expedito nem
  serviço em primeiro plano: **não há garantia de execução em segundos** após falha de rede.
- Eventos têm id estável (hash do remetente+token+horário+SIM); repetir é seguro (servidor deduplica).
  Eventos não confirmados expiram da fila em 30 min (a sessão dura 5 min).
- Heartbeat periódico de 15 min (mínimo do Android) com diagnóstico. "Comunicação recente" **não**
  garante recepção de SMS. Servidor: degradado após 20 min sem sinal, offline após 60 min
  (configurável); offline não recebe novas sessões.
- **Forçar parada** (Configurações › Forçar parada) impede o recebimento de broadcasts até o app ser
  aberto de novo. Não é detectável pelo app; o servidor percebe pela ausência de heartbeat.
- Revogação (painel ou "Desconectar" no app): credencial deixa de valer, sessões pendentes do aparelho
  falham, e o app apaga credencial, fila, atividade e a chave do Keystore ao receber o 401 de revogação.
  Se a revogação chegar em segundo plano, o app mostra "Aparelho desconectado" na próxima abertura.
- Teste da linha com prazo vencido: o app para de esperar e oferece "Gerar novo teste".
- Backup do Android desativado (`allowBackup=false` + regras de extração): a credencial não sai do aparelho.
- Release só aceita HTTPS. O build debug aceita http para testes em rede local.

Comportamento por fabricante (Xiaomi/MIUI, Samsung, Huawei etc. podem matar apps em segundo plano)
**ainda não foi medido** — registrar em `docs/STATUS.md` durante a validação física.

## Distribuição

- **Google Play:** permissões de SMS são restritas. O app se enquadra como "app de SMS padrão" e exige o
  formulário de declaração de permissões no Play Console. A aprovação depende da análise da Google e
  **não é garantida**: o uso principal é receber verificações, e a função de mensagens é simples.
- **Piloto:** APK privado assinado, instalado pelo contratante em aparelho dedicado (permitir "fontes
  desconhecidas" para o instalador usado). Riscos: atualização manual, alertas do Play Protect,
  dependência do contratante manter o app atualizado. Publicar hash SHA-256 do APK junto ao download.
- Atualização: instalar APK novo assinado com a **mesma** chave (`adb install -r` ou instalador).

## Matriz de validação física (pendente — exige aparelho e chip reais)

Preencher com aparelho, Android, operadora e data:

| Caso | Resultado esperado | Status |
|---|---|---|
| SMS real com tela apagada | Evento chega à API e aprova | pendente |
| App fechado (não forçado) | Idem | pendente |
| Após reinício do aparelho | Idem, sem abrir o app | pendente |
| Sem internet no receptor, depois volta | Evento na fila, enviado ao voltar (se dentro do prazo) | pendente |
| SMS atrasado (após 5 min) | Não aprova | pendente |
| SMS duplicado | Uma aprovação | pendente |
| Permissão revogada nas configurações | App mostra "Permissão negada"; nada é recebido | pendente |
| Forçar parada | Não recebe até abrir; servidor marca offline pelo heartbeat | pendente |
| Mensagem comum (não Simvio) | Não aparece na atividade nem chega à API | pendente |
| Multipartes / mensagem editada | Remonta / recusa | pendente |
| Remetente via RCS/iMessage | Não chega como SMS; não aprova; usuário orientado | pendente |
| Dual SIM | SIM diferente do validado não aprova | pendente |
