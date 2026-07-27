// lib/cs/setup-7dias.ts — O SETUP DOS 7 PRIMEIROS DIAS (docs/PLAYBOOK_SOCIAL.md §13).
//
// Antes: o cadastro de cliente novo gerava 3 tarefas genéricas ("[Setup] Identidade Visual",
// "[Setup] Grade Editorial", "[Setup] Auditoria de Contas"). Elas viravam prazo vencido e ficavam
// lá — as três do Portuga P'Neus estão pendentes desde 03/07 — porque "Identidade Visual" não diz
// a ninguém O QUE fazer. Aqui o setup vira a lista concreta do playbook, item a item, com dono.
//
// Reusa a tabela `tasks`: o time já marca feito em /tarefas e o cron task-reminders já cobra.
// Não inventa mecanismo novo pra uma coisa que já existe.

export type PapelSetup = "designer" | "social" | "traffic";

export interface ItemSetup {
  /** Chave estável — é como a gente sabe que o item já existe sem depender do título. */
  chave: string;
  titulo: string;
  papel: PapelSetup;
  /** Só entra pra quem tem esse serviço contratado. */
  exige?: "trafego" | "video";
  /** Explica o item pra quem nunca leu o playbook. */
  nota?: string;
}

// As 3 FIXADAS. O padrão é este; o cliente pode pedir troca (vídeo de apresentação no lugar de uma,
// arte de horário de funcionamento, versão mais detalhada do "o que você encontra"). A regra é
// TRÊS FIXADOS — não três temas engessados. Por isso o título diz o padrão e a nota abre a exceção.
const NOTA_FIXADOS =
  "Padrão: localização · o que você encontra na loja · feedbacks de clientes. " +
  "Dá pra trocar por vídeo de apresentação, horário de funcionamento ou variação do mix — " +
  "desde que localização e prova social apareçam em algum lugar do perfil.";

export const CHECKLIST_SETUP: ItemSetup[] = [
  { chave: "logo",       titulo: "Logo finalizada",                 papel: "designer" },
  { chave: "bio",        titulo: "Bio do perfil escrita",           papel: "social" },
  { chave: "linktree",   titulo: "Linktree (ou link único) no ar",  papel: "social" },
  { chave: "destaques",  titulo: "Destaques criados e capeados",    papel: "social" },
  { chave: "fixados",    titulo: "3 artes fixadas no feed",         papel: "designer", nota: NOTA_FIXADOS },
  { chave: "videos",     titulo: "Vídeos recebidos/gravados",       papel: "social",   exige: "video",
    nota: "Só pra cliente que grava vídeo (playbook §4.2 e §4.3)." },
  { chave: "anuncio",    titulo: "Anúncio no ar",                   papel: "traffic",  exige: "trafego" },
  { chave: "conta_meta", titulo: "Conta de anúncio vinculada no Lone OS", papel: "traffic", exige: "trafego",
    nota: "Sem isso o cliente some de relatório, métrica, alerta de saldo e pacing — trabalho acontecendo e sistema cego." },
];

/** Prefixo do título no banco. Mantém o padrão "[Setup] " que o time já reconhece. */
export const PREFIXO = "[Setup]";

export function tituloTarefa(item: ItemSetup, cliente: string): string {
  return `${PREFIXO} ${item.titulo} — ${cliente}`;
}

export interface PerfilCliente {
  temTrafego: boolean;  // contratou tráfego pago (tem gestor OU conta vinculada)
  gravaVideo: boolean;
}

/** Quais itens valem pra ESTE cliente. Não cobra anúncio de quem não contratou tráfego. */
export function itensPara(perfil: PerfilCliente): ItemSetup[] {
  return CHECKLIST_SETUP.filter((i) => {
    if (i.exige === "trafego") return perfil.temTrafego;
    if (i.exige === "video") return perfil.gravaVideo;
    return true;
  });
}

export interface StatusSetup {
  cliente: string;
  diasDeCasa: number;
  feitos: string[];   // títulos curtos
  abertos: { titulo: string; papel: PapelSetup; responsavel: string | null }[];
}

const ROTULO_PAPEL: Record<PapelSetup, string> = { designer: "designer", social: "social", traffic: "tráfego" };

/**
 * Monta a cobrança do grupo da equipe. Devolve "" quando não há nada em aberto — cliente com o
 * setup fechado não precisa aparecer.
 *
 * Fala do PRAZO com honestidade: dentro dos 7 dias é lembrete; passou, é atraso com o número de dias.
 */
export function montarCobrancaSetup(status: StatusSetup[]): string {
  const pendentes = status.filter((s) => s.abertos.length > 0);
  if (!pendentes.length) return "";

  const l: string[] = ["🚀 *Setup de cliente novo* — os 7 primeiros dias", ""];

  for (const s of pendentes.sort((a, b) => b.diasDeCasa - a.diasDeCasa)) {
    const total = s.feitos.length + s.abertos.length;
    const prazo = s.diasDeCasa <= 7
      ? `dia ${s.diasDeCasa} de 7`
      : `*${s.diasDeCasa - 7}d além do prazo*`;
    l.push(`*${s.cliente}* — ${s.feitos.length}/${total} · ${prazo}`);
    for (const a of s.abertos.slice(0, 6)) {
      const dono = a.responsavel || `_sem ${ROTULO_PAPEL[a.papel]} definido_`;
      l.push(`• ${a.titulo} — ${dono}`);
    }
    if (s.abertos.length > 6) l.push(`• _…e mais ${s.abertos.length - 6}_`);
    l.push("");
  }

  l.push("_Marca em Tarefas conforme for fechando. O cliente só sai de onboarding quando o essencial estiver de pé._");
  return l.join("\n");
}

/**
 * Cliente "graduou" de onboarding?
 * Regra do Roberto: conta de anúncio vinculada + demanda criada + arte entregue = já é cliente.
 * Cliente SÓ-SOCIAL gradua com a arte entregue — não faz sentido esperar conta de anúncio de quem
 * não contratou tráfego. Foi isso que deixou o Atlas 98 dias "em onboarding" tendo 7 artes entregues.
 */
export function graduou(p: { temTrafego: boolean; contaVinculada: boolean; artesEntregues: number }): boolean {
  if (p.artesEntregues < 1) return false;
  return p.temTrafego ? p.contaVinculada : true;
}
