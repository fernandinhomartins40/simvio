# Simvio — recortes fiéis das referências

Correção do pacote anterior: este arquivo contém recortes literais dos exemplos e referências integrais. Nenhuma peça foi regenerada por IA, redesenhada, recolorida ou redimensionada. A comparação dos pixels dos recortes com a fonte foi verificada.

## Limite importante

As referências são imagens achatadas, não arquivos com camadas. Os recortes conservam o fundo, os textos e as sobreposições visíveis. Não são objetos isolados transparentes nem assets originais editáveis. Partes ocultas dos celulares e fundos não podem ser recuperadas exatamente a partir dessas imagens.

`hero-exemplo-paleta.png`: conjunto do celular, grafismo e confirmação na comparação de paletas.
`hero-landing-com-mao.png`: composição visual da landing desktop, incluindo mão, celulares e mensagens.
`grafismo-faixa-central.png` e `grafismo-rodape.png`: detalhes de fundo extraídos da landing; são exemplos de uso, não masters do símbolo.
`previa-painel-na-landing.png`: recorte ilustrativo do painel dentro da landing; não implementar como interface rasterizada.

## Marca

`logo-master-aprovada-intacta.png` mantém o arquivo da aprovação do símbolo 1 com tipografia 3, em suas cores originais e fundo claro. Não usar grafismos de tela para reconstruir ou alterar esse master. A cor petróleo/lima está documentada na referência integral; uma versão de produção isolada nessa paleta ainda exige preparação e validação fiel.

## Orientação de implementação

Usar recortes apenas como referência ou imagem ilustrativa quando o fundo permitir. Interface, mensagens e cartões devem ser componentes HTML/CSS ou Android, com texto real. Não usar códigos, números, limites ou preços ilustrativos dos mockups como especificação: prevalece o PRD. O pacote anterior continha novas interpretações visuais e não deve ser tratado como extração dos elementos das telas.
