/**
 * Script de importação dos briefings dos 30 clientes.
 * Fonte: docs/seeds/briefings-clientes-2026-05.md
 *
 * Uso: node scripts/import-briefings.mjs
 *
 * Chama a API de produção via LocalSession (admin).
 * Clientes sem match no banco são pulados com aviso.
 */

const BASE_URL = "https://painel.lonemidia.com";
const AUTH = "LocalSession lonemidiamkt@gmail.com";

// ── Mapeamento documento → client_id em produção ──────────────
// Apenas clientes com match confirmado na auditoria de 2026-05-18
const CLIENTS = [
  { id: "f3a6bda5-5e9d-45f3-856a-d4859616557d", nome: "Imperio dos Pisos" },
  { id: "6fa8bc91-17d2-4611-965c-622633488768", nome: "Depillagos Araruama" },
  { id: "dcccd306-e7de-4851-a45c-f60fd832cbad", nome: "Paradise Suplementos" },
  { id: "01983043-677a-46ea-9505-b5bdbd9b5cb1", nome: "Reformar construção" },
  { id: "b37b7b44-1bbd-474e-9c5b-0b11707036a9", nome: "DIJANA MATERIAL DE CONSTRUÇÃO" },
  { id: "d1e6e778-d18d-4a5c-a42c-756d963b5dbf", nome: "Madeirão Madeira" },
  { id: "a9020fb0-9d6f-45cf-b355-ac33026b8fe6", nome: "WT Shopping" },
  { id: "fe69b816-6c34-409a-aa67-403ccc4c21b9", nome: "Ortobom Cabo frio" },
  { id: "64d4e840-13d5-4acd-a70a-cf838093f328", nome: "Tindaro Solar" },
  { id: "ac3515a6-2530-47ec-8a08-996c68543ec0", nome: "Body Skin Araruama" },
  { id: "435e4493-1ebc-4430-8bfb-79038065bcda", nome: "Casarão do açai - Araruama" },
  { id: "4295e7ab-366a-4d35-95c8-f419f8a450a4", nome: "Calabria Decorações" },
  { id: "2c1705a9-5aaa-45b3-88a7-d107953386ca", nome: "Hentzy Acabamentos" },
  { id: "18a47171-6ad9-4adb-b9e4-8922b43c8384", nome: "Engetec" },
  { id: "dd2a0971-acd5-4981-b982-e87b5577f058", nome: "Bruno Tintas Araruama" },
  { id: "cf53b00f-51b0-49f2-b36a-54beba11c7c9", nome: "Dinho Cell" },
  { id: "15d570d7-1efc-4a94-97ff-a78355f5b5dd", nome: "Mr.distribuidora MDF" },
  { id: "5fa546a2-65ff-4045-99c1-d07d713bbd2e", nome: "EDUMAR AUTO PEÇAS" },
  { id: "104cb54b-b2fd-4ffd-b595-7daccaa7a989", nome: "Ótica Rodrigo" },
  { id: "3c8a14ec-e6da-4789-9f8f-bea1b23cdfaf", nome: "Dr. Cauana Barboza" },
  { id: "b67e5aae-d8f9-4304-97ea-b59453e7fef5", nome: "Iron Fox - Academia" },
  { id: "d70808d0-ec25-49e2-ba6d-c190c17a8e04", nome: "Mercadao da construcao" },
];

// Pulados (não existem no banco): Lone Mídia, ADMX, Bob's Bacaxá,
// Casa Rio Bahia, Sadrack, Inovar Móveis, Clara Mamede

// ── Dados dos briefings ───────────────────────────────────────

const BRIEFINGS = {

  "f3a6bda5-5e9d-45f3-856a-d4859616557d": { // Imperio dos Pisos
    resumo_estrategico: "Loja de acabamentos com forte perfil promocional e grande potencial de campanhas sazonais. Trabalha com pisos, porcelanatos, louças, vasos, gabinetes, metais, torneiras e itens para transformação de ambientes. A comunicação deve unir preço, variedade e transformação da casa.",
    produtos: ["Pisos","Porcelanatos","Louças","Vasos monobloco","Gabinetes","Cubas","Torneiras","Metais","Argamassa","Acabamentos"],
    publico_alvo: ["Pessoas construindo","Pessoas reformando","Famílias","Donos de imóveis","Pedreiros","Mestres de obra","Arquitetos","Engenheiros"],
    posicionamento: "A loja ideal para quem quer construir ou reformar pagando bem, com variedade, atendimento próximo e opções que transformam ambientes.",
    dores: ["Obra ficando cara","Medo de escolher piso errado","Casa ou banheiro sem vida","Não saber combinar piso, gabinete e metais","Perder promoção","Precisar parcelar","Não querer rodar várias lojas"],
    ganchos: ["Quer deixar sua sala mais moderna?","O piso certo muda completamente sua casa","Você que está construindo ou reformando em Araruama...","Você viu nossas promoções e ainda não veio?"],
    ctas: ["Chama no WhatsApp","Venha conhecer a loja em Araruama","Peça seu orçamento","Garanta antes que acabe"],
    observacoes_estrategicas: "Stories devem ser construídos com fala, não só foto de produto. Mostrar combinações de ambiente, prova social, localização e urgência. Forte apelo de varejo local.",
  },

  "6fa8bc91-17d2-4611-965c-622633488768": { // Depillagos
    resumo_estrategico: "Cliente de estética com foco em depilação a laser e depilação com cera. A comunicação deve trabalhar dor estética, praticidade, autoestima, conforto e recorrência.",
    produtos: ["Depilação a laser","Depilação com cera"],
    publico_alvo: ["Mulheres","Homens","Pessoas que buscam praticidade e estética","Pessoas cansadas de pelos indesejados"],
    posicionamento: "Solução estética para quem busca pele mais lisinha, praticidade e segurança no cuidado pessoal.",
    dores: ["Pelos indesejados","Irritação com lâmina","Falta de praticidade","Desconforto estético","Vontade de se sentir mais confiante"],
    ganchos: ["Cansou da lâmina?","Quer se sentir mais livre e confiante?","Depilação não precisa ser complicada"],
    ctas: ["Agende pelo WhatsApp","Marque sua avaliação","Chama a equipe"],
    observacoes_estrategicas: "Confirmar diferenciais, preços e localização antes de subir campanhas.",
  },

  "dcccd306-e7de-4851-a45c-f60fd832cbad": { // Paradise Suplementos
    resumo_estrategico: "Loja de suplementos premium focada em resultados para públicos que treinam, têm dificuldade de ganhar massa ou desejam melhorar performance. A comunicação trabalhou linguagem mais provocativa para público jovem e abordagem mais direta para público acima de 50 anos.",
    produtos: ["Whey","Creatina","Vitaminas","Suplementos premium","Produtos para ganho de massa","Produtos para performance"],
    publico_alvo: ["Pessoas que treinam e não veem resultado","Pessoas com dificuldade de ganhar peso","Público acima de 50 anos preocupado com massa muscular","Homens e mulheres praticantes de academia"],
    posicionamento: "Suplementos de qualidade para quem quer sair da estagnação e melhorar resultado no treino.",
    dores: ["Treinar e não ter resultado","Não ganhar corpo","Perder massa muscular com a idade","Falta de energia e constância","Vergonha ou insatisfação com o físico"],
    ganchos: ["Fala frango... cansou de passar vergonha?","Você treina e não vê resultado?","Tem mais de 50 anos e está perdendo massa muscular?"],
    ctas: ["Chama no WhatsApp","Venha conhecer a Paradise","Fale com nossa equipe"],
    observacoes_estrategicas: "Evitar frases como 'eu tomei suplementos da Paradise' quando o dono grava. Usar fala de consultor/indicador.",
  },

  "01983043-677a-46ea-9505-b5bdbd9b5cb1": { // Reformar construção
    resumo_estrategico: "Loja de construção em Saquarema com campanhas de venda e posicionamento, incluindo aniversário de 6 anos. Trabalha com tintas, iluminação, ferramentas, materiais de construção, vasos sanitários, gabinetes, impermeabilizantes, cimento e telhas.",
    produtos: ["Tintas","Iluminação","Ferramentas","Materiais de construção","Vasos sanitários","Gabinetes","Impermeabilizantes","Cimento","Telhas"],
    publico_alvo: ["Moradores de Saquarema","Pessoas construindo","Pessoas reformando","Profissionais de obra"],
    posicionamento: "Loja local de confiança para quem quer construir, reformar e aproveitar ofertas em Saquarema.",
    dores: ["Obra cara","Falta de material","Precisar comprar tudo em um só lugar","Buscar preço e variedade"],
    ganchos: ["Você de Saquarema, vai construir ou reformar?","A maior promoção da cidade chegou","Reformar está completando 6 anos"],
    ctas: ["Chama no WhatsApp","Passe na loja","Venha aproveitar as ofertas"],
    observacoes_estrategicas: "Comunicação deve reforçar loja completa, preço e tradição local.",
  },

  "b37b7b44-1bbd-474e-9c5b-0b11707036a9": { // DIJANA MATERIAL DE CONSTRUÇÃO
    resumo_estrategico: "Loja de construção e utilidades em Saquarema com foco em materiais brutos e produtos básicos de obra, como telha fibrocimento, brita, tijolo, cimento, caixa d'água e areia/areola.",
    produtos: ["Telha fibrocimento","Brita","Tijolo","Cimento","Caixa d'água","Areia/areola","Utilidades","Materiais para construção"],
    publico_alvo: ["Moradores de Saquarema","Pessoas construindo","Pessoas reformando","Pedreiros","Mestres de obra"],
    posicionamento: "Loja local com qualidade, preço justo e confiança para materiais essenciais de obra.",
    dores: ["Falta de material bruto","Obra parada","Precisar de preço justo","Comprar material básico com rapidez"],
    ganchos: ["Você de Saquarema, vai começar uma obra?","Precisando de material bruto para sua obra?","Antes de comprar cimento, telha ou tijolo, veja isso"],
    ctas: ["Chama no WhatsApp","Atendimento rápido no direct","Venha até a loja"],
    observacoes_estrategicas: "O foco deve ser prático, direto e local.",
  },

  "d1e6e778-d18d-4a5c-a42c-756d963b5dbf": { // Madeirão Madeira (Madeirão de Iguaba)
    resumo_estrategico: "Cliente de acabamentos com foco em pisos, portas, janelas e gabinetes. A comunicação foi ajustada para público final que está pensando em construir ou reformar, evitando citar tintas porque o cliente não trabalha com esse produto.",
    produtos: ["Pisos","Portas","Janelas","Gabinetes","Madeiras","Acabamentos"],
    publico_alvo: ["Pessoas construindo","Pessoas reformando","Famílias","Comprador final"],
    posicionamento: "Loja de tradição e qualidade para quem busca acabamentos essenciais da obra.",
    dores: ["Não saber onde comprar acabamentos","Precisar de piso, portas e janelas","Reforma atrasada","Buscar confiança e variedade"],
    ganchos: ["Está construindo ou reformando?","Sua obra merece acabamento de qualidade","Antes de escolher seus pisos, portas e janelas..."],
    ctas: ["Chama no WhatsApp","Venha visitar a loja","Peça seu orçamento"],
    observacoes_estrategicas: "Não citar tintas nos criativos deste cliente.",
  },

  "a9020fb0-9d6f-45cf-b355-ac33026b8fe6": { // WT Shopping
    resumo_estrategico: "Agropecuária/pet shop com farmácia, rações, consultório veterinário, variedade e delivery rápido em Araruama. Os anúncios recentes focaram em rações a partir de R$49,99, delivery e loja completa.",
    produtos: ["Rações","Farmácia pet","Consultório veterinário","Produtos para pets","Delivery rápido","Loja completa"],
    publico_alvo: ["Tutores de pets em Araruama","Clientes que buscam preço em ração","Pessoas que preferem delivery","Clientes que precisam de orientação"],
    posicionamento: "Agropecuária completa com preço bom, variedade e entrega rápida para facilitar a rotina do tutor.",
    dores: ["Ração cara","Pet sem ração","Não querer sair de casa","Não saber qual ração escolher","Precisa de entrega rápida"],
    ganchos: ["Seu pet está sem ração e você não quer sair de casa?","Você ainda está pagando caro na ração do seu pet?","Já passou aqui na frente mas nunca entrou?"],
    ctas: ["Chama no WhatsApp e peça no delivery","Venha conhecer a loja","Fale com nosso time"],
    observacoes_estrategicas: "Mostrar prateleiras de ração, entrega sendo separada e prova de variedade.",
  },

  "fe69b816-6c34-409a-aa67-403ccc4c21b9": { // Ortobom Cabo frio
    resumo_estrategico: "Loja Ortobom em Cabo Frio com campanhas sobre qualidade do sono e escolha do colchão. Foram trabalhados anúncios diretos com CTA para visita/WhatsApp e modelos como Pro Força/Pro Saúde, Fashion Nanolastic e Super Pocket/Superpocket.",
    produtos: ["Colchões Ortobom","Pro Força/Pro Saúde (confirmar nome)","Fashion Nanolastic","Fashion Superpocket/Super Pocket","Atendimento em loja"],
    publico_alvo: ["Pessoas com sono ruim","Famílias","Casais","Pessoas com dores/desconforto","Clientes buscando trocar colchão"],
    posicionamento: "Escolher colchão é decisão de saúde, conforto e qualidade de vida, não apenas compra de móvel.",
    dores: ["Dormir mal","Colchão errado","Dor nas costas","Cansaço","Adiar troca do colchão"],
    ganchos: ["Você sabia que a maior parte da sua vida você passa dormindo?","Muita gente escolhe o colchão errado","Dormir bem começa com a escolha certa"],
    ctas: ["Venha conhecer a loja","Chama no WhatsApp","Experimente de perto"],
    observacoes_estrategicas: "Confirmar informações técnicas oficiais de cada modelo antes de anunciar características específicas.",
  },

  "64d4e840-13d5-4acd-a70a-cf838093f328": { // Tindaro Solar
    resumo_estrategico: "Empresa de energia solar focada em projetos personalizados e eficientes. Comunicação deve trabalhar economia mensal, qualidade técnica, confiança e cuidado contra promessas baratas de concorrentes. Foram usados cases reais como Hospital Veterinário Vet Mais e Restaurante Manu Sushi.",
    produtos: ["Projetos de energia solar","Instalação solar","Projeto personalizado","Simulação de economia","Visita/análise"],
    publico_alvo: ["Residências","Comércios","Empresas com conta alta","Negócios em Arrozal, Piraí e região","Clientes comparando orçamentos"],
    posicionamento: "Energia solar com quem entende do assunto: projeto bem dimensionado, economia real e segurança no investimento.",
    dores: ["Conta de luz alta","Orçamento barato que não entrega","Medo de sistema mal dimensionado","Pagar energia todos os meses","Empresa concorrente que promete e não cumpre"],
    ganchos: ["Todo mês você toma susto com a conta de luz?","Nem todo sistema solar barato gera economia","Energia solar não é só preço. É projeto"],
    ctas: ["Chama no WhatsApp","Faça uma simulação","Fale com a Tíndaro Solar"],
    observacoes_estrategicas: "Usar números reais apenas quando confirmados. Cases: Hospital Vet Mais (73,8 kWp, 7.000 kWh/mês, 134 painéis) e Restaurante Manu Sushi (11 kWp, economia R$1.000/mês). Excelente para prova social e fundo de funil.",
  },

  "ac3515a6-2530-47ec-8a08-996c68543ec0": { // Body Skin Araruama
    resumo_estrategico: "Clínica/loja de estética em Araruama com foco em beleza natural realçada por tecnologia. Serviços: depilação, estética avançada e harmonização facial, para público feminino e masculino.",
    produtos: ["Depilação","Estética avançada","Harmonização facial","Protocolos personalizados"],
    publico_alvo: ["Mulheres","Homens","Pessoas que buscam autoestima","Clientes com incômodo estético"],
    posicionamento: "Sua beleza natural realçada com tecnologia, cuidado e segurança.",
    dores: ["Manchas","Pelos indesejados","Flacidez","Marcas no rosto","Baixa autoestima"],
    ganchos: ["Você cuida da sua pele ou só lembra quando algo incomoda?","Sua pele merece tecnologia e cuidado","Beleza natural também precisa de estratégia"],
    ctas: ["Agende sua avaliação","Chama no WhatsApp","Descubra o tratamento ideal"],
    observacoes_estrategicas: "Evitar promessas médicas/estéticas exageradas; manter segurança, naturalidade e personalização.",
  },

  "435e4493-1ebc-4430-8bfb-79038065bcda": { // Casarão do açai - Araruama
    resumo_estrategico: "Loja com o maior self-service de açaí e sorvetes sem balança, com mais de 6 anos servindo consumidores finais e também fornecendo açaí e sorvete para revendedores, casas de açaí e negócios da região. Campanhas recentes focam mais no B2B, fábrica, qualidade, entrega e parceria.",
    produtos: ["Açaí","Sorvetes","Self-service sem balança","Revenda B2B","Fornecimento para casas de açaí","Entrega"],
    publico_alvo: ["Consumidor final em Araruama","Casas de açaí","Lanchonetes","Revendedores","Empreendedores que querem começar a vender"],
    posicionamento: "Fornecedor sério e parceiro para quem vende ou quer revender açaí e sorvete, com qualidade, preço e entrega.",
    dores: ["Fornecedor que atrasa","Produto sem padrão","Perder cliente por falta de produto","Preço que reduz margem","Falta de parceiro confiável"],
    ganchos: ["Você que vende açaí ou sorvete, olha isso aqui","Fornecedor ruim faz você perder cliente","Você já conhece de onde vem seu produto?"],
    ctas: ["Chama no WhatsApp","Peça a tabela para revendedores","Fale com o time comercial"],
    observacoes_estrategicas: "Na fábrica, mostrar produção, estoque, baldes, qualidade e separação para entrega. B2B precisa falar com dono de negócio. Preços: Sorvete 10L a partir de R$90, Açaí 10L a partir de R$110.",
  },

  "4295e7ab-366a-4d35-95c8-f419f8a450a4": { // Calabria Decorações
    resumo_estrategico: "Loja em Maricá de pisos e móveis. Os anúncios devem trabalhar localização e descoberta da loja, venda focada em pisos e campanhas emocionais como Dia das Mães com mesas de jantar, desconto de até 15% e parcelamento em até 15x.",
    produtos: ["Pisos","Móveis","Mesas de jantar","Decoração","Soluções para casa"],
    publico_alvo: ["Moradores de Maricá","Pessoas reformando","Pessoas mobiliando a casa","Famílias","Clientes buscando pisos"],
    posicionamento: "Loja que ajuda a transformar casa com pisos e móveis, unindo beleza, emoção e venda local.",
    dores: ["Casa sem personalidade","Piso antigo","Não saber onde comprar piso em Maricá","Ambiente sem vida","Querer mesa para momentos familiares"],
    ganchos: ["Você de Maricá já conhece a Calabria Decorações?","Você sabia que existe uma loja em Maricá com pisos e móveis para sua casa?","Uma mesa nunca é só uma mesa"],
    ctas: ["Chama no WhatsApp","Venha conhecer a loja","Escolha sua mesa/piso"],
    observacoes_estrategicas: "Comunicação pode ser emocional no Dia das Mães e mais direta para pisos. Usar loja física e Maricá como âncora.",
  },

  "2c1705a9-5aaa-45b3-88a7-d107953386ca": { // Hentzy Acabamentos
    resumo_estrategico: "Loja de pisos, porcelanatos, louças, metais, gabinetes e acabamentos com mais de 24 anos de mercado. História familiar forte: iniciada em 2000, sucessão após acidente do fundador em 2020, reestruturação a partir de 2021. Slogan: 'Hentzy Acabamentos — da nossa família para a sua.'",
    produtos: ["Pisos","Porcelanatos","Louças","Metais","Gabinetes","Cubas","Vasos","Itens de acabamento"],
    publico_alvo: ["Pessoas reformando","Pessoas construindo","Classe C+/B","Donos de casa","Famílias","Pedreiros","Mestres de obra","Arquitetos","Engenheiros"],
    posicionamento: "Marca tradicional, confiável, resiliente e próxima do cliente, com ativo emocional de família e superação.",
    dores: ["Construir/reformar com medo de errar","Não saber escolher acabamento","Buscar loja tradicional","Querer produto limpo e profissional","Precisar de confiança"],
    ganchos: ["Rio das Ostras, hoje eu vou te apresentar 3 modelos de pisos modernos","Da nossa família para a sua","24 anos ajudando famílias a transformar casas"],
    ctas: ["Chama no WhatsApp","Venha conhecer a loja","Fale com a equipe"],
    observacoes_estrategicas: "Cliente prefere conteúdo limpo e profissional, sem humor forçado/trend infantil. Usar estilo marca sólida.",
  },

  "18a47171-6ad9-4adb-b9e4-8922b43c8384": { // Engetec
    resumo_estrategico: "Empresa criada a partir da experiência prática no campo elétrico e da percepção de que o mercado tinha muitas instalações sem critério técnico. Atua com loja de materiais elétricos/hidráulicos, projetos, instalações elétricas e fotovoltaicas, subestações, entrada de energia e soluções normatizadas.",
    produtos: ["Cabos elétricos","Duto/eletroduto corrugado","Fita isolante","Caixa de medidor","Cabo nu","Disjuntor caixa moldada DIN","Caixa de aterramento","Condulete","Tomadas e interruptores","Materiais hidráulicos","Projetos elétricos","Instalações elétricas","Sistema solar","Entrada de energia","Medição agrupada","Subestação simplificada e abrigada","Instalação predial e industrial"],
    publico_alvo: ["Moradores de Araruama","Construtores","Empresas","Comércios","Indústrias","Engenheiros","Clientes que precisam de projeto técnico"],
    posicionamento: "Eletricidade sem improviso: segurança, transparência, execução normatizada e orientação técnica.",
    dores: ["Instalação sem critério","Risco elétrico","Retrabalho","Comprar material errado","Projeto reprovado","Subestação/entrada de energia mal planejada","Obra atrasada"],
    ganchos: ["Tá reformando, construindo ou fazendo manutenção?","Elétrica e hidráulica de qualidade é na Engetec","Instalação elétrica não é só puxar fio. É engenharia","Se a entrada de energia não estiver correta..."],
    ctas: ["Chama no WhatsApp","Manda sua lista","Solicite avaliação","Fale com um especialista"],
    observacoes_estrategicas: "Separar comunicação de loja (produto/preço) e engenharia (risco/autoridade/segurança). Para subestação, usar CTA consultivo. Produto que performou: caixa de medidor por R$44 e R$49.",
  },

  "dd2a0971-acd5-4981-b982-e87b5577f058": { // Bruno Tintas Araruama
    resumo_estrategico: "Loja de tintas em Araruama. Comunicação deve ser resumida e fácil para o Bruno gravar, porque ele não tem muita facilidade de fala. O foco é dor visual de fachada/pintura velha e oferta de tintas/acessórios.",
    produtos: ["Tintas","Acessórios para pintura","Produtos para fachada","Produtos para interior"],
    publico_alvo: ["Moradores de Araruama","Pessoas reformando","Pintores","Donos de casa","Comércios"],
    posicionamento: "Loja de tintas local com orientação, preço e produtos para renovar a casa.",
    dores: ["Fachada velha","Pintura descascando","Casa com aparência abandonada","Manchas","Cor apagada"],
    ganchos: ["Você já reparou como está a fachada da sua casa?","Às vezes sua casa não precisa de reforma. Precisa de pintura nova","Pintura velha passa imagem de abandono"],
    ctas: ["Chama no WhatsApp","Passe na loja","Renove sua casa"],
    observacoes_estrategicas: "Roteiros devem ser curtos, objetivos e com fala simples. Mostrar tinta, fachada e antes/depois.",
  },

  "cf53b00f-51b0-49f2-b36a-54beba11c7c9": { // Dinho Cell
    resumo_estrategico: "Assistência técnica de celulares em Araruama, com foco em conserto rápido, peças de qualidade e garantia real. A dor principal é celular quebrado/travando e medo de assistência ruim.",
    produtos: ["Troca de tela","Troca de bateria","Conserto de conector","Sistema","Assistência técnica","Garantia"],
    publico_alvo: ["Pessoas com celular quebrado","Clientes que não confiam em assistência","Moradores de Araruama","Pessoas com urgência"],
    posicionamento: "Assistência confiável no centro de Araruama, com agilidade e garantia.",
    dores: ["Celular quebrado","Celular travando","Parou de carregar","Problema voltou depois do conserto","Medo de peça ruim"],
    ganchos: ["Seu celular quebrou e você está adiando porque não confia em ninguém?","Celular quebrado é problema. Assistência ruim é pior","Se você já teve problema com assistência, presta atenção"],
    ctas: ["Chama no WhatsApp","Resolva seu celular hoje","Venha ao Open Mall"],
    observacoes_estrategicas: "Foco em confiança, garantia e rapidez. Mostrar localização no Open Mall Araruama.",
  },

  "15d570d7-1efc-4a94-97ff-a78355f5b5dd": { // Mr.distribuidora MDF
    resumo_estrategico: "Distribuidora focada em soluções completas para marcenaria: MDF, ferragens, acessórios, corte, fitagem e embalagem. O público principal são marceneiros, arquitetos e profissionais de móveis planejados.",
    produtos: ["MDF","Ferragens","Acessórios para móveis","Corte","Fitagem","Embalagem","Marcas reconhecidas"],
    publico_alvo: ["Marceneiros","Arquitetos","Profissionais de móveis planejados","Marcenarias","Projetistas"],
    posicionamento: "Loja ideal para marcenaria, com preço justo, qualidade máxima, atendimento consultivo e estrutura profissional.",
    dores: ["Material ruim compromete projeto","MDF/ferragem de baixa qualidade","Retrabalho","Acabamento ruim","Perder confiança do cliente","Atraso na produção"],
    ganchos: ["Se você é marceneiro, arquiteto ou trabalha com móveis planejados...","Material errado pode atrasar toda sua entrega","Se você trabalha com projetos em MDF, presta atenção"],
    ctas: ["Chama no WhatsApp","Venha até a MR","Leve mais qualidade para seus projetos"],
    observacoes_estrategicas: "A comunicação deve citar persona + produto + contexto: marceneiro/arquiteto + MDF/ferragens + projeto/produção.",
  },

  "5fa546a2-65ff-4045-99c1-d07d713bbd2e": { // EDUMAR AUTO PEÇAS
    resumo_estrategico: "Empresa consolidada no mercado local, com venda de autopeças e serviços automotivos. Forte presença física e reconhecimento na cidade, com faturamento médio em torno de R$500 mil/mês, ticket médio aproximado de R$176 e oportunidade de aumentar margem com serviços mais lucrativos.",
    produtos: ["Óleos e filtros","Correias","Componentes de motor","Kits de embreagem","Troca de óleo","Suspensão","Sistema de arrefecimento","Embreagem","Correia dentada","Alinhamento e balanceamento"],
    publico_alvo: ["Donos de carros em Araruama","Consumidor final","Oficinas mecânicas","Clientes com manutenção preventiva/corretiva"],
    posicionamento: "Autopeças e auto center de confiança, com peças de qualidade, preço justo e serviços automotivos bem executados.",
    dores: ["Carro puxando","Volante tremendo","Barulho na suspensão","Embreagem patinando","Correia dentada vencida","Serviço barato mal feito","Peça de baixa qualidade"],
    ganchos: ["Se seu carro está puxando para o lado...","Se a correia do seu carro estourar...","Barulho na suspensão não é normal","Tem gente escolhendo peça só pelo preço e pagando duas vezes"],
    ctas: ["Chama no WhatsApp","Agenda seu atendimento","Venha até a loja"],
    observacoes_estrategicas: "Cliente entra por problema simples, mas maior margem está em correia dentada, alinhamento/balanceamento e kit de embreagem. Conteúdo deve fazer cliente se reconhecer no problema.",
    observacoes_internas: "Faturamento médio ~R$500k/mês, ticket médio ~R$176.",
  },

  "104cb54b-b2fd-4ffd-b595-7daccaa7a989": { // Ótica Rodrigo
    resumo_estrategico: "Ótica local em Araruama com foco em óculos, atendimento, preço e exame de vista a R$9,99 como chamariz inicial. Campanhas devem levar para WhatsApp/agendamento e loja física.",
    produtos: ["Óculos","Armações","Lentes","Exame de vista","Atendimento","Orientação"],
    publico_alvo: ["Moradores de Araruama","Pessoas com dor de cabeça/visão embaçada","Clientes buscando óculos","Pessoas adiando exame"],
    posicionamento: "Ótica acessível e local, com atendimento profissional e exame de vista a preço de entrada.",
    dores: ["Visão embaçada","Dor de cabeça","Dificuldade de ler","Adiar exame","Precisar trocar óculos"],
    ganchos: ["Você sabia que dá para fazer exame de vista por R$9,99?","Está enxergando embaçado e deixando para depois?","Você que é de Araruama, já conhece a Ótica Rodrigo?"],
    ctas: ["Agende pelo WhatsApp","Venha até a loja","Marque seu horário"],
    observacoes_estrategicas: "Exame de R$9,99 é chamariz; atendimento deve converter para óculos/lentes.",
  },

  "3c8a14ec-e6da-4789-9f8f-bea1b23cdfaf": { // Dr. Cauana Barboza
    resumo_estrategico: "Dentista com 2 anos de atuação, foco principal em lentes em resina. Também realiza clareamento dental, restauração, extração, limpeza, canal e prótese. Atende via agenda, com avaliação geralmente grátis e ticket médio de tratamentos principais entre R$2.500 e R$3.000.",
    produtos: ["Lentes em resina","Clareamento dental","Restauração","Extração","Limpeza","Tratamento de canal","Prótese"],
    publico_alvo: ["Pessoas insatisfeitas com o sorriso","Clientes buscando estética dental","Pessoas com dentes amarelados","Pacientes de Araruama e região"],
    posicionamento: "Transformação do sorriso com foco em lentes em resina e estética natural, usando avaliação presencial para entender necessidade do paciente.",
    dores: ["Evitar sorrir em foto","Dentes manchados","Dentes desgastados","Sorriso apagado","Baixa autoestima"],
    ganchos: ["Você evita sorrir em foto por causa dos seus dentes?","Seus dentes contam uma história que você não quer contar","Transformação do sorriso começa com uma avaliação"],
    ctas: ["Agende sua avaliação","Chama no WhatsApp","Venha conhecer o consultório"],
    observacoes_estrategicas: "Atende em clínica de terceiros. Avaliação geralmente grátis.",
    observacoes_internas: "Ticket médio R$2.500–R$3.000 nos tratamentos principais.",
  },

  "b67e5aae-d8f9-4304-97ea-b59453e7fef5": { // Iron Fox - Academia
    resumo_estrategico: "Academia com briefing básico informado. Dados completos a confirmar.",
    produtos: ["Musculação","Exercícios funcionais","Personal trainer"],
    publico_alvo: ["Pessoas que querem se exercitar","Moradores da região"],
    dores: ["Sedentarismo","Falta de motivação","Não ter onde treinar perto de casa"],
    ganchos: ["Está esperando o quê para começar a treinar?","Sua melhor versão começa aqui"],
    ctas: ["Chama no WhatsApp","Venha conhecer a academia","Faça uma aula experimental"],
    observacoes_estrategicas: "Dados incompletos. Confirmar localização, valores, modalidades e diferenciais antes de criar campanhas.",
  },

  "d70808d0-ec25-49e2-ba6d-c190c17a8e04": { // Mercadao da construcao
    resumo_estrategico: "Loja de material de construção em Cabo Frio com briefing de anúncios consolidado.",
    produtos: ["Materiais de construção","Ferramentas","Acabamentos"],
    publico_alvo: ["Moradores de Cabo Frio","Pessoas construindo","Pessoas reformando","Profissionais de obra"],
    dores: ["Obra cara","Precisar de material com qualidade","Falta de opção local"],
    ganchos: ["Cabo Frio, vai construir ou reformar?","Material de construção de qualidade em Cabo Frio"],
    ctas: ["Chama no WhatsApp","Venha até o Mercadão"],
    observacoes_estrategicas: "Dados parcialmente consolidados. Confirmar endereço, WhatsApp e produtos principais.",
  },

};

// ── Execução ──────────────────────────────────────────────────

async function importar(clientId, nome, payload) {
  const res = await fetch(`${BASE_URL}/api/clients/${clientId}/briefing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": AUTH,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${err.error ?? JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.briefing?.completeness_percent ?? 0;
}

async function main() {
  console.log(`\nImportando briefings para ${CLIENTS.length} clientes...\n`);

  let ok = 0, skipped = 0, errors = 0;

  for (const { id, nome } of CLIENTS) {
    const payload = BRIEFINGS[id];
    if (!payload) {
      console.log(`  ⚠ SKIP  ${nome} — sem dados no script`);
      skipped++;
      continue;
    }

    try {
      const pct = await importar(id, nome, payload);
      console.log(`  ✓ OK    ${nome} — ${pct}% completo`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ERRO  ${nome} — ${err.message}`);
      errors++;
    }

    // Pausa pequena para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`Importados: ${ok}  |  Pulados: ${skipped}  |  Erros: ${errors}`);
  console.log(`Clientes pulados (sem match no banco): Lone Mídia, ADMX,`);
  console.log(`Bob's Bacaxá, Casa Rio Bahia, Sadrack, Inovar Móveis, Clara Mamede`);
  console.log(`─────────────────────────────────\n`);
}

main().catch(console.error);
