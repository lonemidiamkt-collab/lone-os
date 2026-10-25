// lib/traffic/placar-voz.ts — como o placar da semana fala com cada tipo de negócio.
//
// Cada segmento tem a PERGUNTA de fechamento (o número do lado do cliente: vendeu mais ou menos?) e
// um banco de DICAS de uma linha que gira toda segunda. As dicas são sobre transformar conversa do
// WhatsApp em venda no balcão — atendimento, primeira resposta, retorno, oferta. Nada de dica de
// marketing digital genérica, nada de promessa (regra 5 do playbook), nada de jargão (regra 7).
//
// Construção (tintas, pisos, básico, madeira, ferragens) e solar vêm do Playbook Lone Construção
// (24/10/2026). Os demais vêm da pesquisa de voz por nicho guardada na skill
// .claude/skills/placar-semanal/nichos.md — é lá que se acrescenta ou troca dica, com a fonte.

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
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Perguntar a medida da parede ou do ambiente ajuda a indicar o móvel certo e evita troca.",
      "Prazo de entrega claro na primeira resposta evita a pessoa desistir no meio da conversa.",
      "Foto do móvel na casa de um cliente vende mais que foto de catálogo — se tiver alguma, manda pra gente.",
      "Condição de pagamento (parcelas no cartão, à vista no PIX) logo no início da conversa evita a pessoa sair para comparar.",
      ...LOJA_GERAL.slice(0, 2),
    ],
  },
  solar: {
    rotulo: "Energia solar",
    pergunta: "E aí, quantos orçamentos dessa semana viraram visita ou contrato?",
    dicas: [
      "Pedir a conta de luz na primeira resposta já permite dimensionar e falar da economia em reais.",
      "Com a regra nova do Fio B, a conta não zera mais: falar de economia em reais e de payback passa mais confiança.",
      "Quem sofre com queda de energia pode querer bateria ou inversor híbrido — vale perguntar na conversa.",
      "Decisão de solar é demorada: retomar a conversa no 3º, no 7º e no 15º dia traz parte de volta.",
      "Deixar o cliente escolher entre visita e orçamento direto pelo WhatsApp tira atrito de quem ainda está pesquisando.",
    ],
  },
  otica: {
    rotulo: "Ótica",
    pergunta: "E aí na ótica, a semana vendeu mais ou menos que a anterior?",
    dicas: [
      "Perguntar se a pessoa já tem a receita na primeira resposta encurta o caminho até a venda.",
      "Quem chega pela armação costuma fechar com a lente: explicar a diferença entre as lentes ajuda a vender o óculos completo.",
      "Mandar fotos de 3 armações no estilo que a pessoa pediu fecha mais que mandar o catálogo inteiro.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  estetica: {
    rotulo: "Clínica de estética",
    pergunta: PERGUNTA_AGENDA,
    dicas: [
      "Oferecer dois horários na primeira resposta (\"quinta 10h ou sábado 9h?\") marca mais avaliação que perguntar \"quando você pode?\".",
      "Confirmar o horário na véspera por mensagem reduz a falta.",
      "Quem fez a avaliação e não fechou costuma voltar com uma mensagem dois dias depois, com o valor do pacote.",
      "Responder rápido conta muito: quem não recebe resposta procura outra clínica no mesmo dia.",
      "Perfil do Google com fotos do espaço e avaliações em dia passa confiança antes da primeira visita.",
    ],
  },
  barbearia: {
    rotulo: "Barbearia",
    pergunta: PERGUNTA_AGENDA,
    dicas: [
      "Mandar os horários livres do dia na primeira resposta marca mais que perguntar \"que horas você quer?\".",
      "Cliente que corta a cada 15 ou 20 dias: lembrar por mensagem quando chegar a hora traz ele de volta.",
      "Horário vago de última hora pode virar um aviso no status do WhatsApp.",
      "Responder rápido conta muito: quem não recebe resposta marca em outro lugar.",
      "Perfil do Google com fotos e avaliações em dia faz quem é novo na cidade achar a barbearia.",
    ],
  },
  veterinaria: {
    rotulo: "Clínica veterinária",
    pergunta: PERGUNTA_AGENDA,
    dicas: [
      "Oferecer dois horários na primeira resposta marca mais consulta que perguntar \"quando pode trazer?\".",
      "Lembrar o tutor da vacina e do vermífugo na data certa traz o pet de volta sem anúncio.",
      "Confirmar a consulta na véspera por mensagem reduz a falta.",
      "Responder rápido conta muito: quem não recebe resposta procura outra clínica.",
      "Perfil do Google com horário de atendimento e telefone de emergência em dia faz diferença na hora do aperto.",
    ],
  },
  farmacia: {
    rotulo: "Farmácia de manipulação",
    pergunta: "E aí, saíram mais ou menos fórmulas que na semana anterior?",
    dicas: [
      "Pedir a foto da receita na primeira resposta já permite passar o orçamento na mesma conversa.",
      "Avisar o prazo de entrega da fórmula junto com o valor evita a pessoa ir para outra farmácia.",
      "Quem fez uma fórmula de uso contínuo: lembrar por mensagem perto de acabar traz a recompra.",
      "Responder rápido conta muito: quem manda a receita e não recebe resposta manda para outra farmácia.",
      "Perfil do Google com horário e fotos em dia faz quem procura farmácia de manipulação na cidade achar vocês.",
    ],
  },
  clinica: {
    rotulo: "Consultório",
    pergunta: PERGUNTA_AGENDA,
    dicas: [
      "Oferecer dois horários na primeira resposta marca mais consulta que perguntar \"quando você pode?\".",
      "Confirmar a consulta na véspera por mensagem reduz a falta.",
      "Informar o valor da consulta e as formas de pagamento logo no início evita a pessoa sumir.",
      "Responder rápido conta muito: quem não recebe resposta marca com outro profissional.",
      "Perfil do Google com endereço, horário e avaliações em dia passa confiança antes da primeira consulta.",
    ],
  },
  contabilidade: {
    rotulo: "Escritório de contabilidade",
    pergunta: "E aí, entrou cliente novo essa semana pelo WhatsApp?",
    dicas: [
      "Perguntar na primeira resposta se é abertura de empresa, troca de contador ou MEI já direciona a conversa.",
      "Propor uma conversa de 15 minutos (por chamada ou no escritório) fecha mais que mandar a tabela de preços.",
      "Quem pediu proposta e sumiu costuma voltar com uma mensagem dois dias depois.",
      "Responder rápido conta muito: quem procura contador costuma falar com dois ou três no mesmo dia.",
      "Perfil do Google com avaliações de clientes passa confiança para quem ainda não conhece o escritório.",
    ],
  },
  autopecas: {
    rotulo: "Autopeças",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Pedir modelo, ano e motor do carro na primeira resposta evita peça errada e fecha mais rápido.",
      "Mecânico compra toda semana: condição para oficina vale um anúncio só para eles.",
      "Quem compra pastilha costuma precisar de disco e fluido: oferecer junto aumenta a venda.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  pneus: {
    rotulo: "Pneus e centro automotivo",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Pedir a medida que está escrita no pneu (ex.: 175/70 aro 14) na primeira resposta já permite passar o preço.",
      "Oferecer alinhamento e balanceamento junto com o pneu aumenta a venda e evita a pessoa voltar com reclamação.",
      "Dizer o tempo do serviço (\"fica pronto em 40 minutos\") ajuda quem precisa do carro no mesmo dia.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  veiculos: {
    rotulo: "Revenda de veículos",
    pergunta: "E aí, quantos carros saíram essa semana — mais ou menos que na anterior?",
    dicas: [
      "Mandar vídeo curto do carro (por dentro e por fora) na primeira resposta segura o interesse.",
      "Perguntar se tem carro na troca e se vai financiar já direciona a proposta.",
      "Convidar para ver o carro com horário marcado fecha mais que deixar \"passa aqui quando puder\".",
      "Quem perguntou de um carro que já saiu pode querer outro parecido: vale oferecer na hora.",
      "Responder rápido conta muito: quem pergunta de carro conversa com várias lojas no mesmo dia.",
    ],
  },
  suplementos: {
    rotulo: "Loja de suplementos",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Perguntar o objetivo (ganhar massa, emagrecer, energia) ajuda a indicar o produto certo e passa confiança.",
      "Quem comprou whey ou creatina volta em 30 a 45 dias: lembrar por mensagem traz a recompra.",
      "Entrega no mesmo dia na cidade, se der para fazer, é um argumento forte na conversa.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  pet: {
    rotulo: "Pet shop",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Perguntar porte e idade do pet na primeira resposta ajuda a indicar a ração certa.",
      "Ração acaba todo mês: lembrar o cliente perto da data traz a recompra sem anúncio.",
      "Oferecer horário de banho e tosa na mesma conversa da ração aumenta a venda.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  plantas: {
    rotulo: "Viveiro e paisagismo",
    pergunta: "E aí, a semana vendeu mais ou menos que a anterior no viveiro?",
    dicas: [
      "Perguntar se o lugar é de sol ou de sombra ajuda a indicar a planta certa e evita frustração.",
      "Foto de um jardim que vocês fizeram vende paisagismo melhor que foto de muda solta.",
      "Quem compra muda costuma precisar de terra, adubo e vaso: oferecer junto aumenta a venda.",
      ...LOJA_GERAL.slice(0, 3),
    ],
  },
  alimentacao: {
    rotulo: "Alimentação",
    pergunta: "E aí, o movimento da semana foi maior ou menor que o da anterior?",
    dicas: [
      "Mandar o cardápio com foto e preço na primeira resposta fecha o pedido mais rápido.",
      "Responder em menos de 2 minutos no horário do pedido segura quem está com fome.",
      "Um combo do dia no status do WhatsApp ajuda a vender nos horários mais fracos.",
      "Quem pediu uma vez costuma voltar com um lembrete no fim de semana seguinte.",
      "Perfil do Google com horário e fotos dos pratos em dia faz quem está por perto achar vocês.",
    ],
  },
  bazar: {
    rotulo: "Bazar e utilidades",
    pergunta: PERGUNTA_LOJA,
    dicas: [
      "Na conversa, mandar foto real do produto na prateleira passa mais confiança que imagem da internet.",
      "Quem compra ducha ou torneira costuma precisar de veda-rosca e conexão: oferecer junto aumenta a venda.",
      ...LOJA_GERAL,
    ],
  },
  varejo: {
    rotulo: "Loja",
    pergunta: PERGUNTA_LOJA,
    dicas: LOJA_GERAL,
  },
};
