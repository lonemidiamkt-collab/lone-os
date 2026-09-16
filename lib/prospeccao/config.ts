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

export interface Templates {
  abordagem_com_decisor: string;
  abordagem_sem_decisor: string;
  recepcao_sobre_o_que: string;
  followup_1: string;
  followup_2: string;
  followup_3: string;
  decisor_contexto: string;
  visita: string;
  visita_presente: string;
  online: string;
  oferta_horarios: string;
  confirmacao_online: string;
  confirmacao_online_sem_link: string;
  confirmacao_visita: string;
  e_robo: string;
  preco: string;
  nao_perturbe: string;
  sem_interesse: string;
  retornar_depois: string;
  lembrete_24h: string;
  lembrete_1h: string;
}

export interface ProspectConfig {
  /** Kill-switch geral. false = nada sai, nada é pesquisado. */
  ligado: boolean;
  base: { nome: string; cidade: string; uf: string; lat: number; lng: number };
  raio_visita_km: number;
  uf_permitidas: string[];
  segmentos: SegmentoIcp[];
  cidades: string[];
  /** Empresas que NUNCA viram prospect (clientes de site/serviço que não estão em `clients`, parceiros…). */
  excluidos: string[];
  queries_por_dia: number;
  providers: { web_search: boolean; driva: boolean };
  score: { pesos: PesosScore; minimo: number };
  identidade: { apresentacao: string; quem_faz_reuniao: string; empresas_atendidas: string };
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

export const TEMPLATES_PADRAO: Templates = {
  abordagem_com_decisor:
    "Olá, bom dia! Aqui é da equipe do Roberto Lino, da Lone Mídia. Hoje atendemos mais de 70 empresas ligadas ao ramo da construção civil e nossa assessoria é focada nesse segmento.\n\nConsigo falar com {decisor}?",
  abordagem_sem_decisor:
    "Olá, bom dia! Aqui é da equipe do Roberto Lino, da Lone Mídia. Hoje atendemos mais de 70 empresas ligadas ao ramo da construção civil e nossa assessoria é focada nesse segmento.\n\nConsigo falar com o proprietário ou responsável pela {empresa}?",
  recepcao_sobre_o_que:
    "O Roberto trabalha com empresas da construção civil e queria conversar com o proprietário sobre algumas oportunidades que identificamos para a {empresa}. Ele está disponível? Se preferir, pode me passar o melhor horário ou o WhatsApp direto dele.",
  followup_1: "Bom dia! Passando pra saber se conseguiu ver minha mensagem. Consigo falar com {decisor}?",
  followup_2: "Olá! Sei que a rotina da loja é corrida. Só queria confirmar se {decisor} é a pessoa certa pra falar sobre a comunicação da {empresa}.",
  followup_3: "Última tentativa por aqui: se fizer sentido conversar sobre a comunicação da {empresa}, é só me responder. Se não for o momento, sem problema.",
  decisor_contexto:
    "Que bom falar com você, {decisor}. A Lone é especializada em construção civil — atendemos mais de 70 empresas do segmento. {gancho}A ideia é uma conversa de 20 minutos pra entender a operação de vocês e mostrar o que estamos aplicando em empresas parecidas. Faz sentido?",
  visita:
    "Inclusive, a Lone fica em Araruama, perto de vocês. O Roberto gostaria de passar aí pessoalmente pra conhecer a operação. Posso ver um horário com ele?",
  visita_presente:
    "Inclusive, a Lone fica em Araruama, perto de vocês. O Roberto gostaria de passar aí pessoalmente pra conhecer a operação — separamos um presente para algumas empresas selecionadas da região e ele queria entregar em mãos. Posso ver um horário com ele?",
  online:
    "Podemos fazer uma conversa rápida de 20 minutos pelo Google Meet pra entender a operação de vocês e mostrar algumas estratégias que estamos aplicando em empresas do segmento. Posso ver um horário com o Roberto?",
  oferta_horarios: "Perfeito. O Roberto tem {opcoes}. Algum desses horários funciona para você?",
  confirmacao_online:
    "Fechado, {nome}. Deixei agendado: {quando}, {duracao} minutos, pelo Google Meet.\nLink: {link}\n\nA equipe da Lone já recebeu suas informações. Qualquer coisa, o WhatsApp oficial da Lone é +55 22 98153-0700.",
  confirmacao_online_sem_link:
    "Fechado, {nome}. Deixei agendado: {quando}, {duracao} minutos, pelo Google Meet. O Roberto te envia o link um pouco antes.\n\nA equipe da Lone já recebeu suas informações. Qualquer coisa, o WhatsApp oficial da Lone é +55 22 98153-0700.",
  confirmacao_visita:
    "Fechado, {nome}. O Roberto passa aí {quando}{endereco}.\n\nA equipe da Lone já recebeu suas informações. Qualquer coisa, o WhatsApp oficial da Lone é +55 22 98153-0700.",
  e_robo:
    "Sou o assistente comercial da Lone Mídia — eu organizo o primeiro contato, e a conversa mesmo é com o Roberto. Posso ver um horário com ele pra vocês?",
  preco:
    "Sobre valores, quem fala é o Roberto — depende do que faz sentido pra {empresa}. Posso ver um horário rápido pra ele te apresentar?",
  nao_perturbe: "Entendido, não vou mais te incomodar. Obrigado pela atenção!",
  sem_interesse: "Entendido, {nome}. Obrigado pela atenção — se em algum momento fizer sentido, a porta está aberta.",
  retornar_depois: "Combinado, volto a falar com você {quando}. Bom trabalho por aí!",
  lembrete_24h: "Olá {nome}, tudo certo para a nossa conversa amanhã às {hora}?",
  lembrete_1h: "{nome}, nossa reunião com o Roberto está marcada para daqui a pouco, às {hora}.{link}",
};

export const CONFIG_PADRAO: ProspectConfig = {
  ligado: true,
  base: { nome: "Lone Mídia", cidade: "Araruama", uf: "RJ", lat: -22.8728, lng: -42.3431 },
  raio_visita_km: 80,
  uf_permitidas: ["RJ"],
  segmentos: SEGMENTOS_PADRAO,
  cidades: CIDADES_PADRAO,
  excluidos: ["Armazém do Ferro", "Bruno das Tintas", "Araruama Tintas", "DelRio Atacadão do Piso", "João da Roçadeira", "Top Pisos", "Ello Material de Construção"],
  queries_por_dia: 4,
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
    apresentacao: "Aqui é da equipe do Roberto Lino, da Lone Mídia",
    quem_faz_reuniao: "Roberto",
    empresas_atendidas: "mais de 70 empresas",
  },
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
    templates: { ...CONFIG_PADRAO.templates, ...(salvo.templates ?? {}) },
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
