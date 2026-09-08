// O AVISO NA HORA EM QUE A REUNIÃO É MARCADA.
//
// Roberto (08/09): "poder colocar alguém do sistema como colaborador daquela reunião […] e sobre a
// arquitetura do loninho, lembrar o cliente e o colaborador que foi selecionado."
//
// Até aqui, marcar uma reunião pelo calendário só escrevia no banco. Os lembretes existiam — mas
// só na véspera e uma hora antes. Quem o Thiago convidasse hoje para a terça que vem não recebia
// nada: o convite ficava mudo por seis dias, e a pessoa descobria na véspera, quando já não dá
// para remanejar a agenda. Convite que não avisa não é convite.
//
// Aqui só se monta TEXTO. Quem envia é a rota, que é onde o grupo e a permissão vivem — assim o
// que a equipe e o cliente leem pode ser testado sem tocar no WhatsApp.

export type Modalidade = "online" | "presencial";

export interface Convite {
  cliente: string;
  /** Já por extenso: "terça-feira, 15 de setembro às 15:00". */
  quando: string;
  /** Quem responde pela reunião. */
  responsavel: string | null;
  /** Nomes convidados além do responsável. */
  colaboradores: string[];
  modalidade: Modalidade;
  link: string | null;
  /** Onde é, quando presencial. */
  local?: string | null;
  pauta?: string | null;
  /** Quem marcou — vai no texto da equipe, para o convidado saber de quem veio. */
  marcadaPor?: string | null;
}

/** Duração da linha do local/link, comum às duas mensagens. */
function linhaOnde(c: Convite): string {
  if (c.modalidade === "presencial") return `📍 Presencial${c.local && c.local !== "Presencial" ? ` — ${c.local}` : ""}`;
  return c.link ? `🔗 ${c.link}` : "💻 Online — o link vem antes da reunião";
}

/**
 * O aviso no grupo da EQUIPE.
 *
 * `mencao` é o trecho já resolvido (@Fulano @Beltrano) — quem chama passa o resultado de
 * `mencionar()`, porque só ele conhece os telefones.
 */
export function textoConviteEquipe(c: Convite, mencao: string): string {
  const quem = mencao || [c.responsavel, ...c.colaboradores].filter(Boolean).join(", ");
  const linhas = [
    `📅 Reunião marcada com *${c.cliente}*`,
    `🗓️ ${c.quando}`,
    linhaOnde(c),
  ];
  // Só nomeia quem convidou quando há convidado: numa reunião de uma pessoa só, dizer "marcada por
  // ela mesma" é ruído.
  if (c.colaboradores.length && c.marcadaPor) {
    linhas.push(`👥 ${quem} — convite de ${c.marcadaPor}`);
  } else if (quem) {
    linhas.push(`👥 ${quem}`);
  }
  if (c.pauta) linhas.push(`📝 ${primeiraLinha(c.pauta)}`);
  linhas.push("_Aviso na véspera e uma hora antes._");
  return linhas.join("\n");
}

/**
 * O aviso no grupo do CLIENTE.
 *
 * Deliberadamente sem nada interno: nada de "convite de", nada de pauta, nada de menção a quem da
 * agência participa além de quem conduz. O cliente precisa de data, hora e como entrar.
 */
export function textoConviteCliente(c: Convite): string {
  const linhas = [
    `📅 Reunião confirmada — *${c.quando}*.`,
    linhaOnde(c),
    "Se precisar remarcar, é só falar aqui que eu ajusto. Até lá! 👋",
  ];
  return linhas.join("\n");
}

/** O aviso de REMARQUE, quando a data muda depois de marcada. */
export function textoRemarqueEquipe(c: Convite, mencao: string, antes: string): string {
  const quem = mencao || [c.responsavel, ...c.colaboradores].filter(Boolean).join(", ");
  return [
    `🔄 Reunião com *${c.cliente}* mudou de horário`,
    `~${antes}~ → *${c.quando}*`,
    linhaOnde(c),
    quem ? `👥 ${quem}` : "",
  ].filter(Boolean).join("\n");
}

export function textoRemarqueCliente(c: Convite, antes: string): string {
  return [
    `🔄 Nossa reunião mudou de horário: de ~${antes}~ para *${c.quando}*.`,
    linhaOnde(c),
    "Qualquer coisa me avisa por aqui.",
  ].join("\n");
}

/**
 * A pauta pode ser um texto longo; no aviso entra só a primeira linha ÚTIL.
 *
 * Título de markdown ("## Pontos") é pulado: a pauta gerada pela IA começa por um cabeçalho, e
 * mostrar "Pontos" no convite não diz nada sobre a reunião.
 */
function primeiraLinha(txt: string): string {
  const l = txt.split("\n")
    .filter((s) => !/^\s*#/.test(s))
    .map((s) => s.replace(/^[*\-\s]+/, "").trim())
    .find(Boolean) ?? "";
  return l.length > 90 ? `${l.slice(0, 87)}…` : l;
}
