# Simvio Receptor — imagens para Google Play

Pacote preparado em 7 de novembro de 2026. Idioma: português do Brasil.

## Local permanente no repositório

Esta pasta, `05_PLAY_STORE/`, reúne os materiais aprovados e está incluída no índice do Git, fora das regras de ignore. Para usar em outras sessões neste workspace, abra diretamente `05_PLAY_STORE/prontos-upload/`; não é necessário baixar ou extrair ZIP.

Os originais gerados, capturas reais, referências oficiais, prompts e scripts estão preservados nesta pasta. A exportação usa somente os arquivos locais em `originais-gerados/` e `capturas-reais/`, sem depender do cache do Codex ou de arquivos de outra sessão. Com Python e Pillow disponíveis, execute a partir da raiz do projeto:

```powershell
python 05_PLAY_STORE/reproducao/exportar.py
```

Não é necessário iniciar emulador, ADB ou API de demonstração para reutilizar ou reexportar as imagens. Para levar os materiais a outro checkout ou computador pelo Git, esta pasta deve fazer parte do commit e da sincronização do repositório.

## Arquivos de publicação

Use os PNGs de `prontos-upload/`, na ordem numérica. O ícone tem 512 × 512 px, PNG RGBA de 32 bits e menos de 1 MB. O banner tem 1024 × 500 px, PNG RGB de 24 bits. As quatro apresentações de telas têm 1080 × 1920 px, PNG RGB, sem transparência. Todos os arquivos exportados incluem perfil sRGB.

As peças de telas combinam fundos produzidos pela ferramenta integrada de geração de imagens com capturas inteiras do aplicativo Android em execução no emulador. A composição preserva a interface e a logo exibidas pelo app; aplica somente redução proporcional e posicionamento sobre o fundo. Não são interfaces imaginadas pela IA. Os arquivos sem composição ficam em `capturas-reais/`.

## Identidade analisada

- Petróleo: `#073E42`; lima: `#C6F36A`; mineral: `#F3F7F3`; branco: `#FFFFFF`; texto secundário: `#3D6467`.
- Marca corrente: `01_IDENTIDADE_VISUAL/07-logo-petroleo-lima-original.png` e símbolo `08-simbolo-petroleo-lima-original.png`. Variante branca/lima usada como referência do ícone.
- Tipografia da aplicação web: **Plus Jakarta Sans Variable**, confirmada em `apps/web/src/index.css` e `apps/web/package.json`. Títulos fortes, espaçamento generoso, ponto final lima e linguagem direta.
- O Android usa os mesmos tokens de cor, mas `ui/theme/Theme.kt` ainda não declara Plus Jakarta Sans. As capturas preservam a tipografia real do APK. A geração das artes foi orientada por Plus Jakarta Sans e pelas referências visuais; texto gerado é rasterizado, sem fonte editável ou garantia de correspondência tipográfica matemática.

O ícone e o banner foram gerados com os arquivos oficiais como referência de marca, sem propor uma nova logo. A fidelidade foi revisada visualmente; geração raster não equivale à aplicação determinística dos pixels originais. Os arquivos originais da marca permanecem intactos no projeto.

## Procedência e dados de demonstração

O APK debug foi compilado do projeto com `assembleDebug`. As telas foram capturadas em emulador Android, com resolução de 1080 × 1920. Uma API de demonstração exclusivamente local fornece pareamento e estado de linha fictícios; não há acesso a clientes, contas ou números reais. SMS de teste são entregues pelo console do emulador para exercitar o fluxo real do receptor. Estes exemplos demonstram a interface; não constituem validação de SMS em operadora física.

Durante a captura foi encontrado e corrigido um fechamento da aba Atividade: `DateUtils.formatDateTime` recebia contexto nulo. A chamada em `Screens.kt` agora utiliza `LocalContext.current`. A compilação e a navegação real da aba foram usadas para validar a correção.

O script `reproducao/demo_api.py` documenta os dados de demonstração. Os prompts completos estão em `reproducao/prompts.json`. O script `reproducao/exportar.py` registra a exportação e composição; `revisao/validacao-tecnica.json` registra dimensões, modo de cor, tamanho e perfil dos PNGs. Os resultados integrais da ferramenta de geração ficam em `originais-gerados/`.

## Especificações oficiais consultadas

- [Recursos gráficos da ficha — Google Play Console](https://support.google.com/googleplay/android-developer/answer/9866151?hl=pt-BR): ícone 512 × 512; feature graphic 1024 × 500; mínimo de duas capturas, recomendadas quatro em 1080 × 1920. Capturas devem apresentar a experiência real. Textos promocionais devem ser breves e secundários à interface.
- [Design de ícones — Android Developers](https://developer.android.com/distribute/google-play/resources/icon-design-specifications): arquivo quadrado completo, sRGB, sem arredondamento ou sombra externa previamente aplicados. A loja aplica sua própria máscara.

O projeto não declara suporte a Android TV, Wear OS ou Automotive; seus materiais específicos não integram este pacote. Vídeo promocional é opcional e não é uma imagem estática.

## Textos alternativos sugeridos

1. Ícone: Símbolo oficial da Simvio em branco e lima sobre fundo petróleo.
2. Banner: Simvio Receptor: use seu Android para receber mensagens SMS de verificação.
3. Conectar: Tela de pareamento do Android com o painel Simvio por QR ou código.
4. Início: Estado da linha receptora, conexão, permissão de SMS e fila de envio.
5. Atividade: Registro de mensagens de verificação recebidas e encaminhadas pelo aparelho.
6. Ajustes: Configurações da conexão, linha e funcionamento do Android receptor.
