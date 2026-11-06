# Simvio — assets visuais

## Fonte de verdade da marca

`marca/logo-aprovada-original-intacta.png` é cópia binária do arquivo aprovado: símbolo da opção 1 com a tipografia da opção 3. Não foi redesenhado, recortado, esticado ou regenerado neste pacote. Esse master permanece com o fundo claro e as cores azul-marinho/laranja da aprovação original.

`marca/referencia-paleta-petroleo-lima.png` documenta a paleta escolhida posteriormente. É referência de cores e aplicação, não fonte de desenho da logo. Não extrair símbolos das telas geradas: elas contêm variações indevidas.

Este pacote NÃO contém uma nova logo isolada transparente em petróleo/lima nem um vetor final validado. Para produzir esses arquivos, preservar os contornos do master em processo controlado e conferir por sobreposição, sem geração livre. Não confundir referência de tela com master.

Paleta de implementação: petróleo #073E42, lima #C6F36A, mineral #F3F7F3 e branco. Usar texto petróleo sobre botões lima; não usar lima como texto pequeno em fundo claro.

## Ilustrações e fundos

As ilustrações foram geradas separadamente, sem logo, sem símbolo Simvio e sem textos de interface. São peças complementares para reconstruir a direção visual das telas; não são recortes exatos dos mockups. Os fundos são opacos; os objetos são PNG com transparência, conforme validação no manifesto.

Não usar imagem para botões, formulários, tabelas, textos, códigos, QR real ou estados operacionais. Esses componentes precisam ser HTML/CSS ou componentes nativos Android. Ícones funcionais devem vir de uma biblioteca consistente, como Lucide no web e Material Symbols no Android, com rótulos acessíveis.

## Regras para o Claude

1. Usar o master da marca, não recriar sua geometria nem substituir por SVG aproximado.
2. Não pedir ao gerador que desenhe a logo dentro de ilustrações. Marca e cenário são camadas independentes.
3. Preservar proporção com width/height automáticos e object-fit: contain; nunca usar object-fit: cover para a marca.
4. Não aplicar skew, perspectiva, espelhamento, arredondamento de recorte ou deformação à logo.
5. Não tratar a imagem da paleta como logo pronta para produção. A conversão fiel de cores/transparência ainda deve ser validada.
6. Usar ilustrações como apoio visual. A mensagem real de verificação deve ser texto acessível e enviado pelo usuário; a Simvio não envia OTP ao usuário.
7. Não copiar números, preços divergentes, limites, snippets ou promessas de segurança das telas conceituais. O PRD é a referência funcional.
8. Não rasterizar telas inteiras para implementar a aplicação.

Nenhuma imagem deste pacote comprova que o aplicativo foi implementado ou testado.
