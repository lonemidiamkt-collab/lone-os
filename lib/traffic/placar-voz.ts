// lib/traffic/placar-voz.ts — como o placar da semana fala com cada tipo de negócio.
//
// Cada segmento tem a PERGUNTA de fechamento (o número do lado do cliente: vendeu mais ou menos?) e
// um banco de DICAS de uma linha que gira toda segunda. As dicas são sobre transformar conversa do
// WhatsApp em venda no balcão — atendimento, primeira resposta, retorno, oferta. Nada de dica de
// marketing digital genérica, nada de promessa (regra 5 do playbook), nada de jargão (regra 7).
//
// Construção (tintas, pisos, básico, madeira, ferragens) vem do Playbook Lone Construção (24/10/2026).
// Os outros 17 segmentos (e a pergunta de cada um) vêm da pesquisa de voz por nicho de 24/10/2026,
// com as regras de conselho e da Anvisa que limitam o que se diz: .claude/skills/placar-semanal/nichos.md.
// Acrescentar ou trocar dica: lá primeiro, com a fonte; depois aqui.

export type SegmentoVoz =
  | "construcao" | "tintas" | "pisos" | "madeira" | "ferragens" | "moveis" | "solar"
  | "otica" | "estetica" | "barbearia" | "veterinaria" | "farmacia" | "clinica" | "contabilidade"
  | "autopecas" | "pneus" | "veiculos" | "suplementos" | "pet" | "plantas" | "alimentacao" | "bazar" | "varejo";

export interface PerfilVoz {
  rotulo: string;
  /** Última linha da mensagem: a pergunta que faz o dono responder com o número dele. */
  pergunta: string;
  /** Uma linha cada; giram por semana. Mínimo de 5 para não repetir no mês. */
  dicas: string[];
}

const PERGUNTA_LOJA = "E aí na loja, a semana vendeu mais ou menos que a anterior?";
const PERGUNTA_AGENDA = "E aí, a agenda da semana encheu mais ou menos que a anterior?";

// Dicas que valem para qualquer loja que vende pelo WhatsApp.
const LOJA_GERAL = [
  "Conversa respondida nos primeiros 5 minutos fecha muito mais que a respondida uma hora depois — vale deixar alguém de olho no WhatsApp no horário de pico.",
  "Quem pediu orçamento e sumiu costuma voltar com uma mensagem no dia seguinte, com o total e a validade do preço.",
  "Anotar no balcão quem chegou pelo anúncio mostra quanto o digital vendeu de verdade — e ajuda a gente a colocar a verba no que vende.",
  "Foto real da loja e do estoque passa mais confiança que imagem de catálogo. Manda três essa semana que a gente usa.",
  "Perfil do Google com horário, fotos e telefone em dia faz quem procura a loja pelo celular chegar até vocês.",
];

export const PERFIS_VOZ: Record<SegmentoVoz, PerfilVoz> = {
  construcao: {
    rotulo: "Material de construção",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Responder a conversa com 4 perguntas — o que vai fazer, quantidade, bairro e se retira ou recebe — fecha mais rápido que mandar só o preço.",
      "Quem pede cimento quase sempre precisa de areia, brita e vergalhão: oferecer a lista completa da etapa aumenta a venda.",
      ...LOJA_GERAL,
    ],
  },
  tintas: {
    rotulo: "Loja de tintas",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Na conversa, perguntar a área em m² e se é parede interna ou externa já permite indicar a lata certa e fechar na hora.",
      "Quem pergunta de tinta quase sempre precisa de massa, selador e rolo: oferecer o kit aumenta o valor da venda.",
      "Pintor compra toda semana: se a loja tiver condição para pintor, a gente monta um anúncio só para ele.",
      "Cor na tela do celular engana: oferecer o tingimento na hora ou uma amostra evita troca.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  pisos: {
    rotulo: "Pisos e acabamentos",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Perguntar a metragem e o ambiente na primeira resposta já permite mandar quantas caixas e o total — fecha mais rápido.",
      "Avisar sobre lote e tonalidade antes da compra evita problema na obra e passa confiança.",
      "Quem leva piso precisa de argamassa, rejunte e rodapé: oferecer junto aumenta o valor da venda.",
      "Foto do piso já assentado na casa de um cliente vende mais que a foto de catálogo — se tiver alguma, manda pra gente.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  madeira: {
    rotulo: "Madeira e telha",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Perguntar a medida da peça e a quantidade logo na primeira resposta acelera o orçamento.",
      "Avisar se a madeira é tratada ou bruta antes de fechar evita troca e reclamação.",
      "Marceneiro e carpinteiro compram toda semana: condição para profissional vale um anúncio só para eles.",
      "Quem compra telha precisa de cumeeira, calha e parafuso: oferecer junto aumenta a venda.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  ferragens: {
    rotulo: "Ferragens e aço",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Confirmar bitola e quantidade na primeira resposta evita orçamento refeito e fecha mais rápido.",
      "Serralheiro e pedreiro compram toda semana: condição para profissional vale um anúncio só para eles.",
      "Mandar o total já com o frete (ou dizendo que é retirada) evita a pessoa sumir para comparar.",
      ...LOJA_GERAL,
    ],
  },
  moveis: {
    rotulo: "Móveis e decoração",
    pergunta: "E aí, o showroom fechou mais ou menos pedidos esta semana que na anterior?",
    dicas: [
      "Na primeira resposta, peça a medida da parede ou do espaço e mande foto real do móvel com a fita métrica.",
      "Mande vídeo do sofá abrindo (retrátil e reclinável). Vende mais que foto.",
      "Diga se é pronta entrega ou encomenda, com o prazo confirmado, e se o frete e a montagem estão inclusos.",
      "Convide para o showroom com horário marcado. Se der, ofereça levar uma amostra do tecido.",
      "Na venda, marque por escrito a data e o turno da entrega. No Rio, é lei.",
      "Quem pediu medida ou cor e sumiu: retome em 3 dias com a foto da opção que a pessoa perguntou.",
    ],
  },
  solar: {
    rotulo: "Energia solar",
    pergunta: "E aí, quantos orçamentos viraram contrato esta semana, mais ou menos que na anterior?",
    dicas: [
      "Na primeira resposta, peça uma foto da última conta de luz (frente e verso). Sem ela não dá para fazer proposta honesta.",
      "Devolva a proposta com kWp, número e potência das placas, geração estimada, valor à vista e parcelado, e o prazo estimado de homologação.",
      "Mostre a conta \"depois\" com o que continua sendo cobrado: a taxa mínima ou o Fio B, mais a iluminação pública da prefeitura. Evita decepção e cancelamento.",
      "Marque a visita técnica com dia e turno. Proposta firme só depois de ver o telhado.",
      "Retome em 3 dias respondendo uma dúvida (financiamento, telhado, garantia). A decisão de energia solar demora.",
      "Para quem fechou, mande o andamento da homologação na Enel a cada etapa: protocolo, parecer de acesso, troca do medidor.",
      "Quem sofre com queda de energia pode querer bateria ou inversor híbrido — vale perguntar na conversa.",
    ],
  },
  otica: {
    rotulo: "Ótica",
    pergunta: "E aí, quantos óculos completos saíram esta semana, mais ou menos que na anterior?",
    dicas: [
      "Na primeira resposta, peça foto da receita e pergunte se o óculos é para longe, para perto ou para os dois. Isso já define se é visão simples ou multifocal.",
      "Responda com 3 faixas de preço (lente básica, intermediária e a melhor) em vez de \"depende\". O cliente decide mais rápido.",
      "Mande foto ou vídeo curto da armação no rosto de alguém da equipe, de frente e de lado.",
      "Chame para provar na loja já com horário: \"pode passar hoje até 18h ou amanhã às 10h?\"",
      "Quem pediu orçamento e sumiu: retome em 48 h com \"separei duas armações no seu estilo, quer ver a foto?\"",
      "Quando o óculos ficar pronto, avise na hora e ofereça ajuste e limpeza sem custo. Isso traz a pessoa de volta.",
    ],
  },
  estetica: {
    rotulo: "Clínica de estética",
    pergunta: "E aí, a agenda de avaliações da semana encheu mais ou menos que a anterior?",
    dicas: [
      "Responda com o preço da sessão e do pacote da área perguntada (ou a faixa que o dono aprovou) e 2 horários de avaliação. \"Depende\" sem número esfria a conversa.",
      "Para laser, pergunte logo a área, se já fez antes e se a pele está bronzeada. Na Região dos Lagos isso pesa no verão.",
      "Na véspera, confirme a avaliação com o endereço e o que levar. Diminui a falta.",
      "Quem fez a avaliação e não fechou: retome em 3 dias com a condição que foi conversada, uma vez só, sem pressionar.",
      "No fim de cada sessão, deixe a próxima marcada. Pacote parado é dinheiro que não entra.",
      "Para quem pergunta \"é seguro?\", mande fotos do espaço, do aparelho e da equipe, nunca de outros clientes.",
    ],
  },
  barbearia: {
    rotulo: "Barbearia",
    pergunta: "E aí, a agenda da semana encheu mais ou menos que a anterior?",
    dicas: [
      "Responda com 2 horários livres de verdade (\"hoje 17h40 ou amanhã 10h20?\") em vez de \"qual horário você quer?\".",
      "Deixe a lista de serviços com preço salva como resposta rápida e mande numa mensagem só.",
      "Na véspera, confirme o horário no WhatsApp, mesmo que o cliente tenha marcado pelo aplicativo.",
      "Abriu horário de última hora? Avise quem pediu encaixe.",
      "De 15 a 20 dias depois do corte, mande \"bora marcar o próximo?\" para quem não é do plano.",
      "Na hora do pagamento, ofereça o plano mensal a quem vem 2 vezes ou mais por mês, com as regras por escrito.",
    ],
  },
  veterinaria: {
    rotulo: "Clínica veterinária",
    pergunta: "E aí, a agenda de consultas da semana encheu mais ou menos que a anterior?",
    dicas: [
      "Na primeira resposta, pergunte espécie, idade, peso e o que está acontecendo. Se for urgência, peça para vir na hora e passe o endereço.",
      "Não dê diagnóstico nem remédio pelo WhatsApp. Ofereça o horário de consulta mais próximo.",
      "Castração e cirurgia: explique que o valor sai depois da avaliação e já marque a avaliação.",
      "Mande o lembrete da próxima vacina ou vermífugo 3 dias antes da data da carteirinha. É o retorno mais fácil de conseguir.",
      "Na alta, mande por escrito as orientações e o dia do retorno.",
      "Deixe na mensagem de ausência o horário de atendimento e o contato de emergência, se houver.",
    ],
  },
  farmacia: {
    rotulo: "Farmácia de manipulação",
    pergunta: "E aí, as receitas aviadas na semana foram mais ou menos que na anterior?",
    dicas: [
      "Na primeira resposta, peça uma foto legível da receita inteira, com data e assinatura.",
      "Devolva o orçamento em até 1 hora no horário comercial, com o prazo para ficar pronta e a opção de entrega.",
      "Orçamento sem resposta: retome em 24 h perguntando se ficou dúvida sobre prazo ou entrega.",
      "Para uso contínuo, combine um lembrete 5 dias antes de a fórmula acabar.",
      "Dúvida de dose ou de uso quem responde é o farmacêutico. O balcão nunca muda a posologia.",
      "Receita de controle especial: avise logo que a original fica retida, para a pessoa não perder a viagem.",
    ],
  },
  clinica: {
    rotulo: "Consultório",
    pergunta: "E aí, a agenda de consultas encheu mais ou menos que na semana anterior?",
    dicas: [
      "Responda numa mensagem só com 2 horários livres, o valor da consulta e as formas de pagamento.",
      "Se perguntarem de convênio, diga na hora quais a clínica aceita. Se for particular, explique como pedir o reembolso.",
      "Na véspera, confirme com o endereço e o que trazer (exames antigos, documento). Diminui a falta.",
      "A recepção não responde dúvida de saúde pelo WhatsApp: oferece a consulta, ou a teleconsulta se o médico atende assim.",
      "Mantenha uma lista de espera e avise quando abrir vaga por desmarcação.",
      "Quem perguntou e não marcou: retome em 48 h com o próximo horário livre, uma vez só.",
    ],
  },
  contabilidade: {
    rotulo: "Escritório de contabilidade",
    pergunta: "E aí, quantas propostas viraram contrato esta semana, mais ou menos que na anterior?",
    dicas: [
      "Na primeira resposta, faça 3 perguntas: o que a pessoa faz, em que cidade, e se já tem CNPJ. Com isso já dá para saber o que oferecer.",
      "Mande a proposta por escrito no mesmo dia, com cada serviço, o valor e a forma de reajuste. É também regra ética (NBC PG 01, item 8).",
      "Ofereça uma conversa de 15 minutos, por vídeo ou no escritório, com horário marcado.",
      "Retome a proposta em 3 dias úteis e de novo perto do vencimento do DAS ou do prazo do IR, quando o problema volta.",
      "Na época do IR, responda com a lista de documentos que a pessoa tem que juntar. Isso já é atendimento.",
      "Para quem quer trocar de contador, explique em 3 passos como funciona a troca. Tira o medo.",
    ],
  },
  autopecas: {
    rotulo: "Autopeças",
    pergunta: "E aí, o balcão vendeu mais ou menos que na semana anterior?",
    dicas: [
      "Na primeira resposta, peça modelo, ano e motor e, se der, uma foto do documento com o chassi. Evita peça errada e devolução.",
      "Peça foto da peça velha ou do código gravado nela.",
      "Responda com as opções genuína, original e paralela, cada uma com o preço e a garantia.",
      "Não tem no estoque? Dê o prazo real da encomenda, confirmado com o fornecedor.",
      "Ofereça o que vai junto: pastilha + fluido, correia + tensor, óleo + filtro.",
      "Se o cliente tem mecânico, ofereça mandar o orçamento também para ele (com a autorização do cliente). Muitas vezes é o mecânico quem decide.",
    ],
  },
  pneus: {
    rotulo: "Pneus e centro automotivo",
    pergunta: "E aí, passaram mais ou menos carros pela loja esta semana que na anterior?",
    dicas: [
      "Na primeira resposta, peça a medida escrita na lateral do pneu (ou uma foto dela) e o modelo do carro.",
      "Responda com 2 ou 3 opções de marca e preço para a mesma medida, dizendo qual é novo e qual é remold.",
      "Diga o que o preço inclui: montagem, balanceamento, válvula e o descarte do pneu velho.",
      "Ofereça fazer na hora (\"chega às 8h, sai até as 10h\"), mas só se a fila confirmar.",
      "Antes de feriado e da temporada, lembre quem trocou pneu ou fez alinhamento há mais de 6 meses.",
      "No fim do serviço, mande foto da peça ou do pneu trocado. Dá confiança e traz indicação.",
    ],
  },
  veiculos: {
    rotulo: "Revenda de veículos",
    pergunta: "E aí, a loja recebeu mais ou menos visita e test-drive que na semana anterior?",
    dicas: [
      "Na primeira resposta, mande um vídeo de 30 segundos do carro (lataria, painel ligado mostrando o km, motor) e o preço à vista.",
      "Pergunte logo: tem carro na troca? Vai financiar? Qual a entrada? Isso define a conversa.",
      "Ofereça horário para ver o carro e fazer o test-drive (\"amanhã às 10h ou às 15h?\"). Carro se vende na loja.",
      "No financiamento, diga que a aprovação depende da análise do banco e peça só os dados que a ficha exige.",
      "O carro já foi vendido? No mesmo dia, mande a quem perguntou dele 2 carros parecidos do pátio.",
      "Quem visitou e não fechou: retome em 2 dias com a resposta para o que travou a compra (valor da troca, parcela).",
    ],
  },
  suplementos: {
    rotulo: "Loja de suplementos",
    pergunta: "E aí, a semana vendeu mais ou menos potes de whey e de creatina que a anterior?",
    dicas: [
      "Responda com o preço à vista e no Pix (se tiver desconto, deixe visível) e com o prazo de entrega no bairro.",
      "Pergunte o que a pessoa já usa e de qual marca. Ajuda a sugerir o equivalente sem prometer resultado.",
      "Mande foto do pote real com a validade aparecendo. O cliente tem medo de falsificação.",
      "Anote a data da compra e mande lembrete uns 25 dias depois: \"seu whey de 900 g deve estar acabando\".",
      "Monte combo honesto (whey + creatina + coqueteleira) mostrando o preço do combo e o de cada item.",
      "Dúvida de dieta ou de dose para um objetivo: indique nutricionista. O balcão fala só do que está no rótulo.",
    ],
  },
  pet: {
    rotulo: "Pet shop",
    pergunta: "E aí, a agenda do banho e tosa encheu mais ou menos que na semana anterior?",
    dicas: [
      "Na primeira resposta, pergunte porte, raça e pelagem, e já mande o preço do banho e da tosa para aquele porte.",
      "Ofereça 2 horários e o táxi dog, com a faixa de horário em que busca.",
      "Antes de devolver o pet, mande uma foto dele pronto para o tutor. Vira indicação.",
      "Anote a marca e o tamanho do saco de ração de cada cliente e mande \"tá acabando?\" uns dias antes.",
      "Para quem vem toda semana ou a cada 15 dias, ofereça o pacote mensal com as regras por escrito (falta e remarcação).",
      "Dúvida de doença, remédio ou vacina: encaminhe para o veterinário. O balcão não responde.",
    ],
  },
  plantas: {
    rotulo: "Viveiro e paisagismo",
    pergunta: "E aí, a semana vendeu mais ou menos que a anterior?",
    dicas: [
      "Na primeira resposta, peça a metragem (m²), uma foto do lugar e se bate sol o dia todo.",
      "Responda com a conta pronta: m² × preço + terra + frete. O cliente vê o total.",
      "Mande foto da muda real com a fita métrica do lado. A \"muda de 1 m\" que o cliente imagina nem sempre é a mesma.",
      "Para casa de praia, diga quais plantas costumam aguentar vento e maresia pelo que vocês já viram dar certo, sem garantir.",
      "Combine dia e turno da entrega da grama (ela não pode esperar) e oriente a regar no mesmo dia.",
      "15 dias depois da compra, pergunte se pegou bem e ofereça adubo ou reposição.",
    ],
  },
  alimentacao: {
    rotulo: "Alimentação",
    pergunta: "E aí, saíram mais ou menos pedidos que na semana anterior?",
    dicas: [
      "Deixe o cardápio com foto e preço no catálogo do WhatsApp e mande o link na primeira resposta: o cliente chega decidido.",
      "Pergunte logo o bairro e a forma de pagamento, para dar a taxa de entrega e o total de uma vez.",
      "Repita o pedido inteiro antes de fechar (\"500 ml com leite em pó, paçoca e banana, total R$ X com entrega\"). Evita erro.",
      "Diga o tempo de entrega real e avise se for atrasar.",
      "Na temporada e no fim de semana, deixe pronta uma resposta para \"tá aberto?\" com o horário e o tempo de espera do dia.",
      "Quem pede direto pelo WhatsApp: salve o contato com etiqueta e mande o cardápio do fim de semana uma vez por semana, no horário em que a pessoa costuma pedir.",
    ],
  },
  bazar: {
    rotulo: "Bazar e utilidades",
    pergunta: "E aí, o caixa da semana fechou maior ou menor que o da anterior?",
    dicas: [
      "Para ducha e chuveiro, pergunte logo a voltagem da casa (127 V ou 220 V). Evita troca e aparelho queimado.",
      "Mande foto do produto na prateleira com o preço e a caixa, mostrando o modelo e a voltagem.",
      "Para caixa d'água e itens grandes, diga se entrega, em quanto tempo e quanto custa o frete para o bairro.",
      "Ofereça o que falta para instalar: resistência, veda-rosca, boia, fita, broca.",
      "Se acabou, ofereça o parecido que tem no estoque, dizendo claramente a diferença (potência, voltagem, marca).",
      "Para quem confirmou que vem buscar, separe o produto por algumas horas, com horário combinado.",
    ],
  },
  varejo: {
    rotulo: "Loja",
    pergunta: PERGUNTA_LOJA,
    dicas: LOJA_GERAL,
  },
};
