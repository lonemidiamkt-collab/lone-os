// lib/prospeccao/config.ts — o que o Roberto edita na página (ICP, cidades, pesos, templates).
//
// Vive em agency_settings (key `prospect_config`, JSON). Os defaults abaixo são o treinamento
// mestre de 15/09/2026 traduzido em dados: mudar aqui é mudar o piloto para todo mundo — o normal
// é mudar pela página, que grava por cima e preserva o que não mexeu (merge raso por seção).

export interface SegmentoIcp {
  nome: string;
  /** Termos de busca ("loja de tintas", "tintas") — o provider de web search combina com a cidade. */
  termos: string[];
  /** CNAEs (só dígitos) que confirmam o segmento no CNPJ. */
  cnaes: string[];
}

export interface PesosScore {
  segmento_aderente: number;
  porte_adequado: number;
  faturamento_compativel: number;
  presenca_digital: number;
  google_estruturado: number;
  anuncios_ativos: number;
  mais_de_uma_unidade: number;
  decisor_identificado: number;
  site: number;
  localizacao_estrategica: number;
}

/**
 * Um template tem dois modos. `diretriz`: a IA escreve a mensagem natural dentro do objetivo e dos
 * limites (é o padrão na prospecção — cada empresa recebe uma construção diferente). `fixo`: o texto
 * sai exatamente como está, com {chaves} preenchidas (confirmações, opt-out, lembretes). O `fixo` é
 * também a reserva quando a IA não está disponível ou o texto dela é reprovado pelo validador;
 * `variacoes` são alternativas ao fixo, escolhidas por prospect (uma variação que exige um dado que
 * não existe — {gancho}, {decisor} — é pulada).
 */
export interface Template {
  modo: "fixo" | "diretriz";
  diretriz: string;
  fixo: string;
  variacoes?: string[];
}

export type ChaveTemplate =
  | "abordagem_com_decisor" | "abordagem_sem_decisor" | "recepcao_sobre_o_que" | "decisor_contexto" | "saber_mais"
  | "interesse_cidade" | "visita" | "visita_presente" | "online" | "oferta_horarios" | "oferta_periodo"
  | "confirmacao_online" | "confirmacao_online_sem_link" | "confirmacao_visita" | "confirmacao_visita_ok"
  | "e_robo" | "preco" | "ja_tem_agencia" | "nao_perturbe" | "sem_interesse" | "retornar_depois" | "retorno"
  | "followup_1" | "followup_1_decisor" | "followup_2" | "followup_3" | "lembrete_24h" | "lembrete_24h_ok" | "lembrete_1h";

export type Templates = Record<ChaveTemplate, Template>;

export interface Identidade {
  /** Quem assina as mensagens. */
  nome: string;
  cargo: string;
  /** Quem faz a reunião/visita. */
  quem_faz_reuniao: string;
  empresas_atendidas: string;
  /** A persona, em texto — vira o "sistema" da IA quando o template é diretriz. */
  persona: string;
}

export interface ProspectConfig {
  /** Kill-switch geral. false = nada sai, nada é pesquisado. */
  ligado: boolean;
  base: { nome: string; cidade: string; uf: string; lat: number; lng: number };
  raio_visita_km: number;
  uf_permitidas: string[];
  segmentos: SegmentoIcp[];
  cidades: string[];
  /** "Nunca prospectar": empresas que o Roberto não quer que o agente pegue — cliente ou não (DelRio, Top Pisos…). */
  excluidos: string[];
  queries_por_dia: number;
  providers: { web_search: boolean; driva: boolean };
  score: { pesos: PesosScore; minimo: number };
  identidade: Identidade;
  /** Modelo que escreve as mensagens em modo diretriz. */
  modelo_redacao: string;
  handoff_numero: string;
  gift_available: boolean;
  intervalo_min_s: number;
  intervalo_max_s: number;
  envios_por_tick: number;
  duracao_reuniao_min: number;
  relatorio_hora: string;
  /** Meta de SLA: responder o prospect em até N minutos (dentro do horário de atendimento). */
  sla_resposta_min: number;
  templates: Templates;
}

export const SEGMENTOS_PADRAO: SegmentoIcp[] = [
  { nome: "Materiais de construção", termos: ["loja de materiais de construção", "depósito de material de construção"], cnaes: ["4744099", "4744005", "4679699", "4679604"] },
  { nome: "Home center", termos: ["home center"], cnaes: ["4744099"] },
  { nome: "Pisos e revestimentos", termos: ["loja de pisos e revestimentos", "loja de porcelanato"], cnaes: ["4744006", "4744099"] },
  { nome: "Tintas", termos: ["loja de tintas"], cnaes: ["4741500", "4679601"] },
  { nome: "Telhas", termos: ["loja de telhas", "telhas e tijolos"], cnaes: ["4744004"] },
  { nome: "Madeireira", termos: ["madeireira"], cnaes: ["4744002", "4671100"] },
  { nome: "Ferro e aço", termos: ["loja de ferro e aço", "distribuidora de ferro para construção"], cnaes: ["4685100", "4744099"] },
  { nome: "Cimento e pré-moldados", termos: ["distribuidora de cimento", "pré-moldados de concreto"], cnaes: ["4744004", "2330301", "2330302", "2330399"] },
  { nome: "Iluminação", termos: ["loja de iluminação", "loja de lustres e luminárias"], cnaes: ["4754703"] },
  { nome: "Materiais elétricos", termos: ["loja de materiais elétricos"], cnaes: ["4742300", "4673700"] },
  { nome: "Hidráulica", termos: ["loja de materiais hidráulicos"], cnaes: ["4744003"] },
  { nome: "Jardinagem", termos: ["loja de jardinagem e paisagismo", "garden center"], cnaes: ["4789002", "4744099"] },
  { nome: "Acabamentos", termos: ["loja de acabamentos para construção", "loja de louças e metais"], cnaes: ["4744099", "4744003"] },
  { nome: "Ferragens", termos: ["loja de ferragens e ferramentas"], cnaes: ["4744001", "4672900"] },
  { nome: "Vidraçaria e esquadrias", termos: ["vidraçaria", "esquadrias de alumínio"], cnaes: ["4743100", "2512800"] },
  { nome: "Marmoraria", termos: ["marmoraria"], cnaes: ["2391501", "2391502", "2391503"] },
];

// Foco do piloto (Roberto, 16/09): Rio das Ostras, Unamar, Cabo Frio, Maricá, Macaé e Rio Bonito.
// A ordem é a do rodízio de descoberta. Araruama ficou de fora de propósito: é a base, e a
// primeira busca lá trouxe cliente atrás de cliente.
export const CIDADES_PADRAO = [
  "Rio das Ostras", "Unamar (Cabo Frio)", "Cabo Frio", "Maricá", "Macaé", "Rio Bonito",
];

const T = (modo: Template["modo"], diretriz: string, fixo: string, variacoes?: string[]): Template => ({ modo, diretriz, fixo, ...(variacoes ? { variacoes } : {}) });

// Chaves disponíveis nos textos: {saudacao} {nome} {decisor} {empresa} {cidade} {segmento} {gancho}
// {oportunidade} {quando} {data} {hora} {link} {endereco} {opcao1} {opcao2} {contexto} {agente} {responsavel}.
export const TEMPLATES_PADRAO: Templates = {
  abordagem_com_decisor: T("diretriz",
    "Primeira mensagem, o decisor é conhecido. Apresente-se como {agente}, {cargo}. Diga em uma frase que a Lone atende {empresas_atendidas} do ramo da construção civil (marketing e estrutura comercial para gerar oportunidades e vendas). Use NO MÁXIMO um dado pesquisado da empresa, e só se ele existir em FATOS ({gancho}). O objetivo é chegar a {decisor} (respeite o gênero do nome: 'com a Mariana', 'com o Marcelo'): pergunte se consegue falar com essa pessoa por esse número. Não venda, não proponha reunião, não peça WhatsApp do dono.",
    "Olá, {saudacao}! Tudo bem?\nMeu nome é {agente}, sou {cargo}.\nHoje a gente atende {empresas_atendidas} ligadas ao ramo da construção civil, trabalhando estratégias de marketing e estrutura comercial focadas em gerar mais oportunidades e vendas.\nEu estava olhando a {empresa} e queria falar com {o_decisor}. Consigo falar com {ele_ela} por aqui?",
    [
      "Oi, {saudacao}! Tudo bem? Sou a {agente}, {cargo}.\nA gente é especializado no ramo da construção civil e hoje atende {empresas_atendidas} do segmento. Eu queria falar com {o_decisor} sobre a {empresa}. Consigo falar com {ele_ela} por aqui?",
      "Oi, {saudacao}! Tudo bem? Sou a {agente}, da Lone Mídia.\nNós somos especializados em empresas do ramo da construção civil e eu estava pesquisando algumas empresas de {cidade}. A {empresa} chamou nossa atenção {gancho}.\nQueria conversar com {o_decisor}. {ele_ela} fala por esse número?",
    ]),
  abordagem_sem_decisor: T("diretriz",
    "Primeira mensagem, o decisor NÃO é conhecido. Apresente-se como {agente}, {cargo}. Diga que a Lone trabalha exclusivamente com marketing e vendas para o ramo da construção civil e que estava pesquisando a {empresa}. Pergunte quem é a pessoa responsável pela empresa ou pela parte comercial para conversar. Curta, natural. Não venda, não proponha reunião.",
    "Oi, {saudacao}! Tudo bem? Meu nome é {agente}, sou {cargo}.\nA gente trabalha exclusivamente com estratégias de marketing e vendas para empresas do ramo da construção civil e eu estava pesquisando a {empresa}.\nQuem seria a pessoa responsável pela empresa ou pela parte comercial para eu conversar?"),
  recepcao_sobre_o_que: T("diretriz",
    "A recepção perguntou do que se trata. Explique em 2 ou 3 frases: a Lone é especializada em construção civil, atende {empresas_atendidas}; é sobre uma possível parceria em marketing e geração de vendas; vocês identificaram oportunidades olhando a {empresa} e querem apresentar rapidamente ao responsável. Termine perguntando quem é a melhor pessoa para falar. Não peça o WhatsApp do dono na primeira tentativa, não fale de preço.",
    "Claro! A Lone é especializada no segmento de construção civil e hoje atende {empresas_atendidas} do ramo.\nNós identificamos algumas oportunidades olhando a {empresa} e eu queria apresentar isso rapidamente para o responsável. Não é nada demorado. Quem seria a melhor pessoa para eu falar?",
    ["É sobre uma possível parceria na parte de marketing e geração de vendas. Como somos especializados em construção civil, estamos entrando em contato com algumas empresas que têm um perfil interessante para o nosso trabalho.\nQueria conversar diretamente com o responsável para explicar melhor. Quem seria?"]),
  decisor_contexto: T("diretriz",
    "Você chegou ao decisor ({decisor}). Se ele acabou de se identificar depois de a recepção já ter ouvido a apresentação (veja o HISTÓRICO), NÃO repita 'mais de 70 empresas' nem se apresente de novo: cumprimente pelo nome e vá ao contexto. Se é o primeiro contato com ele, apresente-se em uma frase ({agente}, da Lone Mídia) e diga que a Lone é especializada em construção civil, atende {empresas_atendidas}, com trabalho focado em geração de demanda, tráfego e estrutura comercial. Cite o que viu na {empresa} — SOMENTE se houver {gancho} em FATOS, de forma neutra — e termine EXATAMENTE na frase de que achou que poderia fazer sentido mostrar o que estão aplicando em empresas parecidas. A ÚLTIMA FRASE É ESSA. Proibido: frase final de convite, 'se tiver interesse', 'podemos conversar', qualquer pergunta. Espere a resposta.",
    "Oi, {decisor}! Tudo bem? A {agente} aqui, da Lone Mídia.\nEu entrei em contato porque a Lone é especializada em empresas da construção civil. Hoje atendemos {empresas_atendidas} do segmento e temos um trabalho bem focado em geração de demanda, tráfego e estrutura comercial.\nDei uma olhada na {empresa} e vi {gancho}. Achei que poderia fazer sentido te mostrar algumas coisas que estamos aplicando em empresas parecidas com a sua.",
    ["Oi, {decisor}! Tudo bem? A {agente} aqui, da Lone Mídia.\nEu entrei em contato porque a Lone é especializada em empresas da construção civil. Hoje atendemos {empresas_atendidas} do segmento e temos um trabalho bem focado em geração de demanda, tráfego e estrutura comercial.\nAchei que poderia fazer sentido te mostrar algumas coisas que estamos aplicando em empresas parecidas com a {empresa}."]),
  saber_mais: T("diretriz",
    "O decisor perguntou o que a Lone faz / como funciona. Responda de forma direta e honesta em 2 ou 3 frases: assessoria de marketing especializada em construção civil — conteúdo, anúncios na Meta e geração de demanda pelo WhatsApp; atende {empresas_atendidas}. Se houver {oportunidade} em FATOS, cite uma. Não fale de preço, não prometa resultado. Encerre dizendo que o {responsavel} mostra exemplos numa conversa rápida — sem pedir para marcar ainda.",
    "A Lone é uma assessoria de marketing especializada em construção civil: cuidamos de conteúdo, anúncios e da geração de demanda pelo WhatsApp para lojas do segmento. Hoje são {empresas_atendidas} atendidas.\nO {responsavel} costuma mostrar exemplos reais do que está funcionando em empresas parecidas com a {empresa} numa conversa rápida."),
  interesse_cidade: T("diretriz",
    "O decisor demonstrou interesse. Diga que, antes de explicar tudo por WhatsApp, faz mais sentido o {responsavel} entender um pouco da operação deles e mostrar exemplos do que a Lone tem feito no segmento. Termine confirmando a cidade: 'Vocês ficam em {cidade}, certo?'. Só isso — não ofereça horário ainda.",
    "Legal. Antes de te explicar tudo por WhatsApp, acho que faz mais sentido o {responsavel} entender um pouco da operação de vocês e te mostrar alguns exemplos do que temos feito no segmento.\nVocês ficam em {cidade}, certo?"),
  visita: T("diretriz",
    "A empresa fica até 80 km da Lone (Araruama). Diga que ficam relativamente perto e que, em vez de reunião pelo Meet, o {responsavel} poderia passar na loja, conhecer e entender a operação pessoalmente. Peça permissão para olhar horários na agenda dele ('se fizer sentido, eu vejo alguns horários'). Natural, sem pressão. Não cite presente.",
    "Ah, perfeito. Vocês ficam relativamente perto da gente — nossa operação é em Araruama.\nNesse caso, ao invés de fazer uma reunião pelo Meet, o {responsavel} poderia passar aí, conhecer a loja e entender melhor a operação de vocês pessoalmente.\nSe fizer sentido, eu vejo alguns horários na agenda dele."),
  visita_presente: T("diretriz",
    "Igual à visita (até 80 km, o {responsavel} pode passar na loja), mas o presente está RESERVADO para esta empresa: diga que deixaram um presente separado para eles na Lone e que o {responsavel} leva quando passar. Peça permissão para olhar horários. Sem pressão.",
    "Ah, perfeito. Vocês ficam relativamente perto da gente — nossa operação é em Araruama.\nNesse caso, ao invés de fazer uma reunião pelo Meet, o {responsavel} poderia passar aí, conhecer a loja e entender melhor a operação de vocês pessoalmente. Inclusive, deixamos um presente separado para vocês aqui na Lone — ele pode levar quando passar aí.\nSe fizer sentido, eu vejo alguns horários na agenda dele."),
  online: T("diretriz",
    "A empresa fica longe da Lone. Diga que, como ficam mais distantes da base, o melhor é uma conversa rápida pelo Google Meet, em que o {responsavel} entende a operação e mostra exemplos do segmento. Pergunte se quer que você veja os próximos horários dele (peça permissão antes de abrir a agenda).",
    "Como vocês ficam um pouco mais distantes da nossa base, o melhor seria fazer uma conversa rápida pelo Google Meet.\nO {responsavel} consegue entender melhor a operação de vocês e mostrar alguns exemplos do que estamos fazendo para empresas do mesmo segmento.\nQuer que eu veja os próximos horários disponíveis dele?"),
  oferta_horarios: T("fixo", "", "Perfeito. Dei uma olhada aqui na agenda dele. Tenho {opcao1} ou {opcao2}. Qual fica melhor para você?"),
  oferta_periodo: T("fixo", "", "Tranquilo. Qual período costuma ser melhor para você: manhã ou tarde? Vejo outra possibilidade aqui."),
  confirmacao_online: T("fixo", "", "Fechado, {nome}! Ficou marcado para {data}, às {hora}.\nJá deixei o Google Meet criado também:\n{link}\nVou deixar todas as informações da {empresa} organizadas para o {responsavel} chegar na reunião já entendendo um pouco do cenário de vocês."),
  confirmacao_online_sem_link: T("fixo", "", "Fechado, {nome}! Ficou marcado para {data}, às {hora}, pelo Google Meet. O {responsavel} te envia o link um pouco antes.\nVou deixar todas as informações da {empresa} organizadas para ele chegar na reunião já entendendo um pouco do cenário de vocês."),
  confirmacao_visita: T("fixo", "", "Perfeito, {nome}. Deixei a visita combinada para {data}, às {hora}.\nEndereço que tenho aqui: {endereco}. Está certinho?\nVou organizar as informações da {empresa} para o {responsavel} antes de ir até vocês.",
    ["Perfeito, {nome}. Deixei a visita combinada para {data}, às {hora}.\nSó me confirma o endereço da loja para eu passar certinho para o {responsavel}?"]),
  confirmacao_visita_ok: T("fixo", "", "Perfeito. Está tudo certo então. Qualquer imprevisto, pode falar comigo por aqui."),
  e_robo: T("fixo", "", "Sou a {agente}, assistente comercial virtual da Lone Mídia. Eu cuido dessa primeira parte do contato e da organização das reuniões.\nA conversa estratégica mesmo é com o {responsavel}. Se preferir, também posso pedir para alguém do nosso time falar com você diretamente."),
  preco: T("diretriz",
    "Perguntaram o preço. Não passe número. Explique que o valor varia conforme o que faz sentido para a operação (tráfego, estrutura comercial, conteúdo), que o trabalho é específico por empresa e você prefere não passar um número sem entender o cenário para não passar algo errado. Diga que o {responsavel} entende isso rapidamente e mostra o que faria sentido para a {empresa}; pergunte se pode ver um horário. Competente, sem enrolar.",
    "Consigo te explicar sim. O valor varia conforme o que realmente faz sentido para a operação — tráfego, estrutura comercial, conteúdo etc.\nComo trabalhamos de forma bem específica para cada empresa, prefiro não te passar um número sem entender o cenário e acabar te passando algo errado.\nO {responsavel} consegue entender isso rapidamente com você e te mostrar o que faria sentido para a {empresa}. Quer que eu veja um horário?"),
  ja_tem_agencia: T("diretriz",
    "O decisor disse que já tem agência/alguém cuidando do marketing. Reconheça sem problema (várias empresas que chegam já têm), diga que o trabalho da Lone é específico para construção civil e que a conversa muitas vezes serve para comparar estratégia, geração de demanda e processo comercial. Se ele está satisfeito, ótimo — mas ofereça mostrar rapidamente o que fazem de diferente para ele mesmo avaliar. Sem desmerecer a agência atual.",
    "Perfeito, e não tem problema nenhum. Na verdade, várias empresas que chegam até nós já têm alguém cuidando do marketing.\nNosso trabalho é bem específico para construção civil e muitas vezes a conversa serve até para comparar estratégia, geração de demanda e processo comercial.\nSe você estiver satisfeito com o trabalho atual, ótimo. Mas posso te mostrar rapidamente o que fazemos de diferente e você mesmo avalia se existe alguma oportunidade."),
  nao_perturbe: T("fixo", "", "Entendido, {nome}. Não vou mais te chamar por aqui. Obrigada pela atenção."),
  sem_interesse: T("fixo", "", "Tranquilo, {nome}. Obrigada pela sinceridade.\nNão vou insistir. Se em algum momento fizer sentido conversar sobre marketing ou vendas para a {empresa}, fico à disposição por aqui."),
  retornar_depois: T("fixo", "", "Combinado, {nome}. Vou deixar anotado para falar com você {quando}.\nPode deixar que não fico te chamando até lá."),
  retorno: T("diretriz",
    "Chegou a data que o prospect pediu para retomar. Cumprimente, lembre que quando conversaram ele comentou {contexto} e que você combinou de procurar agora ({quando}). Pergunte como ficaram as coisas. NÃO mande mensagem genérica de 'só passando'; NÃO repita a apresentação da Lone; NÃO proponha reunião nesta mensagem.",
    "Oi, {nome}! {agente} aqui, da Lone. Tudo certo?\nQuando conversamos você comentou que {contexto}. Combinei de te procurar agora {quando}. Como ficaram as coisas por aí?"),
  followup_1: T("diretriz",
    "Follow-up 1 (2 dias sem resposta), a mensagem anterior pediu para falar com o {decisor} ou com o responsável. Cumprimente, assine como {agente} da Lone, diga que estão conversando com algumas empresas de {segmento} no RJ e que a {empresa} tem aderência ao trabalho. Pergunte se conseguiu falar com o {decisor} (ou quem seria o responsável). NÃO repita a apresentação inteira nem a frase 'passando pra saber se viu minha mensagem'. Traga algo novo.",
    "Oi, {nome}! Tudo bem? {agente} aqui, da Lone.\nTe chamei porque estamos conversando com algumas empresas de {segmento} aqui no RJ e achei que a {empresa} tem bastante aderência ao trabalho que fazemos.\nConseguiu falar com {o_decisor}?"),
  followup_1_decisor: T("diretriz",
    "Follow-up 1 direto com o decisor ({decisor}), 2 dias sem resposta. Retome dizendo que achou interessante o perfil da {empresa} e ofereça explicar em duas mensagens o que chamou a atenção antes de falar em reunião. Curta. NÃO repita a apresentação.",
    "Oi, {decisor}! {agente} aqui novamente.\nQueria só retomar porque realmente achei interessante o perfil da {empresa}. Se fizer sentido, consigo te explicar em duas mensagens o que chamou nossa atenção antes da gente falar em reunião."),
  followup_2: T("diretriz",
    "Follow-up 2 (5 dias sem resposta). Reconheça que a rotina de loja é corrida e prometa ser breve. Traga UMA informação nova: {oportunidade} (só se existir em FATOS; senão, o fato de serem focados em construção civil). Diga que não sabe se é prioridade agora, mas que valia mostrar. REGRA: follow-up nunca repete a mensagem anterior.",
    "Oi, {nome}! Sei que a rotina de loja é corrida, então prometo ser breve.\nO motivo do meu contato é porque somos muito focados no mercado de construção e encontramos {oportunidade}.\nNão sei se isso hoje é uma prioridade para vocês, mas achei que valia pelo menos te mostrar."),
  followup_3: T("diretriz",
    "Último follow-up (12 dias). Diga que vai encerrar os contatos para não incomodar, mas deixa o contato aberto porque acredita que existe uma oportunidade na {empresa}, principalmente em {oportunidade} (se existir). Convide a chamar por aqui quando quiser. Elegante, sem culpa, sem pressão.",
    "{nome}, vou encerrar meus contatos por aqui para não ficar te incomodando.\nMas deixo meu contato aberto porque realmente acredito que existe uma oportunidade interessante na {empresa}, principalmente em {oportunidade}.\nSe em algum momento quiser conversar, é só me chamar por aqui."),
  lembrete_24h: T("fixo", "", "Oi, {nome}! {agente} aqui. Passando só para confirmar nossa conversa com o {responsavel} amanhã, às {hora}. Continua tudo certo para você?"),
  lembrete_24h_ok: T("fixo", "", "Perfeito. Deixo tudo confirmado por aqui então."),
  lembrete_1h: T("fixo", "", "Oi, {nome}! Nossa conversa com o {responsavel} começa daqui a pouquinho, às {hora}.{link}\nAté já!"),
};

export const PERSONA_PADRAO =
  "Rafaela — Representante Comercial da Lone Mídia. Especializada no primeiro contato e qualificação de empresas do ramo da construção civil. Conversa de maneira natural, objetiva e cordial. Pesquisa antes de abordar. Não parece telemarketing. Não pressiona. Não usa linguagem excessivamente corporativa. Não inventa familiaridade. Fala em nome da Lone, nunca finge ser o Roberto; quando a oportunidade esquenta, conduz para uma conversa com o Roberto. Seu objetivo é criar interesse suficiente para essa conversa, não vender todo o serviço pelo WhatsApp.";

export const CONFIG_PADRAO: ProspectConfig = {
  ligado: true,
  base: { nome: "Lone Mídia", cidade: "Araruama", uf: "RJ", lat: -22.8728, lng: -42.3431 },
  raio_visita_km: 80,
  uf_permitidas: ["RJ"],
  segmentos: SEGMENTOS_PADRAO,
  cidades: CIDADES_PADRAO,
  excluidos: ["Armazém do Ferro", "Bruno das Tintas", "Araruama Tintas", "DelRio Atacadão do Piso", "João da Roçadeira", "Top Pisos", "Ello Material de Construção"],
  queries_por_dia: 10,
  providers: { web_search: true, driva: false },
  score: {
    pesos: {
      segmento_aderente: 20, porte_adequado: 15, faturamento_compativel: 15, presenca_digital: 10,
      google_estruturado: 10, anuncios_ativos: 10, mais_de_uma_unidade: 5, decisor_identificado: 5,
      site: 5, localizacao_estrategica: 5,
    },
    minimo: 60,
  },
  identidade: {
    nome: "Rafaela",
    cargo: "representante comercial da Lone Mídia",
    quem_faz_reuniao: "Roberto",
    empresas_atendidas: "mais de 70 empresas",
    persona: PERSONA_PADRAO,
  },
  modelo_redacao: "gpt-4o",
  handoff_numero: "5522981530700",
  gift_available: false,
  intervalo_min_s: 240,
  intervalo_max_s: 540,
  envios_por_tick: 2,
  duracao_reuniao_min: 30,
  relatorio_hora: "18:30",
  sla_resposta_min: 5,
  templates: TEMPLATES_PADRAO,
};

/** Template salvo no formato antigo (string) vira fixo; chave desconhecida é ignorada; chave nova vem do padrão. */
export function normalizarTemplates(salvo: unknown): Templates {
  const out = { ...CONFIG_PADRAO_TEMPLATES } as Templates;
  if (!salvo || typeof salvo !== "object") return out;
  for (const [k, v] of Object.entries(salvo as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const chave = k as ChaveTemplate;
    if (typeof v === "string") out[chave] = { ...out[chave], modo: "fixo", fixo: v };
    else if (v && typeof v === "object") {
      const t = v as Partial<Template>;
      out[chave] = {
        modo: t.modo === "diretriz" ? "diretriz" : t.modo === "fixo" ? "fixo" : out[chave].modo,
        diretriz: typeof t.diretriz === "string" ? t.diretriz : out[chave].diretriz,
        fixo: typeof t.fixo === "string" && t.fixo.trim() ? t.fixo : out[chave].fixo,
        ...(Array.isArray(t.variacoes) ? { variacoes: t.variacoes.filter((x): x is string => typeof x === "string" && !!x.trim()) } : (out[chave].variacoes ? { variacoes: out[chave].variacoes } : {})),
      };
    }
  }
  return out;
}
const CONFIG_PADRAO_TEMPLATES = TEMPLATES_PADRAO;

/** Merge raso por seção: o que a página gravou vence; o que ela nunca tocou vem do padrão. */
export function mesclarConfig(salvo: Partial<ProspectConfig> | null | undefined): ProspectConfig {
  if (!salvo) return CONFIG_PADRAO;
  return {
    ...CONFIG_PADRAO,
    ...salvo,
    base: { ...CONFIG_PADRAO.base, ...(salvo.base ?? {}) },
    providers: { ...CONFIG_PADRAO.providers, ...(salvo.providers ?? {}) },
    score: {
      pesos: { ...CONFIG_PADRAO.score.pesos, ...(salvo.score?.pesos ?? {}) },
      minimo: salvo.score?.minimo ?? CONFIG_PADRAO.score.minimo,
    },
    identidade: { ...CONFIG_PADRAO.identidade, ...(salvo.identidade ?? {}) },
    templates: normalizarTemplates(salvo.templates),
    segmentos: salvo.segmentos?.length ? salvo.segmentos : CONFIG_PADRAO.segmentos,
    cidades: salvo.cidades?.length ? salvo.cidades : CONFIG_PADRAO.cidades,
    excluidos: Array.isArray(salvo.excluidos) ? salvo.excluidos : CONFIG_PADRAO.excluidos,
  };
}

export const CHAVE_CONFIG = "prospect_config";

export async function carregarConfig(): Promise<ProspectConfig> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", CHAVE_CONFIG).maybeSingle();
    if (!data?.value) return CONFIG_PADRAO;
    return mesclarConfig(JSON.parse(data.value as string));
  } catch (err) {
    console.error("[prospeccao/config] não li a config, usando padrão:", err instanceof Error ? err.message : err);
    return CONFIG_PADRAO;
  }
}

export async function salvarConfig(patch: Partial<ProspectConfig>): Promise<ProspectConfig> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const atual = await carregarConfig();
  const novo = mesclarConfig({ ...atual, ...patch });
  const { error } = await supabaseAdmin.from("agency_settings")
    .upsert({ key: CHAVE_CONFIG, value: JSON.stringify(novo) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return novo;
}

/** Lê/grava outra chave de agency_settings (ids de planilha/calendário, token do Google). */
export async function lerSetting(key: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}
export async function gravarSetting(key: string, value: string | null): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  if (value === null) { await supabaseAdmin.from("agency_settings").delete().eq("key", key); return; }
  const { error } = await supabaseAdmin.from("agency_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/** Preenche {chaves} de um template. Chave sem valor vira vazio (nunca fica "{decisor}" na mensagem). */
export function preencher(template: string, valores: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = valores[k];
      return v === null || v === undefined ? "" : String(v);
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/  +/g, " ")
    .trim();
}
