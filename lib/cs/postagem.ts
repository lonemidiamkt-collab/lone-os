// lib/cs/postagem.ts — Relatório de POSTAGEM do Agente CS (pauta do dia).
// Lógica PURA: recebe os clientes do dia (com flag "esperado" já calculada) e monta a
// mensagem pro grupo da equipe. Sem I/O — a rota busca os dados e chama isto.
//
// Regra (Playbook §2 + decisões do Roberto):
//   - SEG/SEX: todo cliente é esperado postar (balanço completo).
//   - QUARTA: dia de Reels — só os clientes que FAZEM vídeo são esperados.
//   - TER/QUI: "dia fora" — só aparece se alguém tiver post agendado.
//   - SEGUNDA: lembrete pra adiantar os roteiros dos vídeos de quarta.

export interface PostingClient {
  nome: string;
  temPost: boolean;   // tem card com due_date = hoje?
  esperado: boolean;  // esperado postar HOJE (seg/sex: todos; qua: só quem faz vídeo)
}

export interface PostingInput {
  diaLabel: string;          // ex.: "segunda, 30/06"
  videoDay: boolean;         // hoje é quarta (dia de Reels)?
  clientes: PostingClient[]; // ativos com social, com 'esperado' já calculado
  videoQuarta?: string[];    // (segunda) clientes de vídeo — lembrete pra adiantar roteiro
}

/** Monta o relatório de postagem. Retorna null = não há nada a postar hoje. */
export function buildPostingReport(inp: PostingInput): string | null {
  const { diaLabel, videoDay, clientes, videoQuarta } = inp;
  const esperados = clientes.filter((c) => c.esperado);
  const comPost = esperados.filter((c) => c.temPost).map((c) => c.nome);
  const semPost = esperados.filter((c) => !c.temPost).map((c) => c.nome);
  const extras = clientes.filter((c) => !c.esperado && c.temPost).map((c) => c.nome);
  const temReminder = !!(videoQuarta && videoQuarta.length);

  // Nada a dizer (dia fora, sem posts agendados e sem lembrete) → não posta.
  if (esperados.length === 0 && extras.length === 0 && !temReminder) return null;

  const blocos: string[] = [];
  let extrasMostrados = false;

  if (esperados.length > 0) {
    // Balanço dos esperados (pauta de seg/sex, ou vídeos de quarta).
    const palavra = videoDay ? "vídeo" : "post";
    const b = [videoDay ? `🎬 *Vídeos de hoje — quarta* (${diaLabel})` : `🗓️ *Pauta de hoje* (${diaLabel})`, ""];
    b.push(`✅ *Com ${palavra}:* ${comPost.length ? comPost.join(", ") : "—"}`);
    b.push(`❌ *Sem ${palavra}:* ${semPost.length ? semPost.join(", ") : "nenhum 🎉"}`);
    b.push(
      semPost.length
        ? (videoDay
            ? `${semPost.length} sem Reels pra hoje — cadê os roteiros? 🎬`
            : `${semPost.length} cliente${semPost.length > 1 ? "s" : ""} sem pauta pra hoje — bora criar? 👀`)
        : (videoDay ? "Todos com vídeo hoje! 🎬" : "Todo mundo com pauta hoje! Mandaram bem 🚀"),
    );
    blocos.push(b.join("\n"));
  } else if (extras.length > 0) {
    // Dia fora, mas alguém agendou post pra hoje.
    blocos.push(`🗓️ *Posts de hoje* (${diaLabel})\n\nTem post agendado pra hoje: *${extras.join(", ")}*`);
    extrasMostrados = true;
  }

  if (extras.length > 0 && !extrasMostrados) {
    blocos.push(`➕ *Também com post hoje:* ${extras.join(", ")}`);
  }

  // Lembrete de roteiro (segunda): adiantar os vídeos de quarta.
  if (temReminder) {
    blocos.push(`📹 *Vídeo de quarta:* ${videoQuarta!.join(", ")} — já tem roteiro? Bora adiantar essa semana. 🎬`);
  }

  return blocos.join("\n\n");
}

// ── FECHAMENTO DO DIA: "postou?" ─────────────────────────────────────────────
// O furo que isto resolve: em 30 dias o designer entregou 156 artes e só 67 viraram "publicado" —
// 89 ficaram paradas em aprovação/agendado. Quase sempre a arte FOI postada e ninguém moveu o card;
// aí o post some de toda métrica. Em vez de adivinhar, o CS pergunta ao TIME no fim do dia
// (decisão do Roberto: cobrar no grupo da EQUIPE, não no do cliente) e marca quando confirmam.

export interface CardDoDia {
  cardId: string;
  cliente: string;
  titulo: string;
  temArte: boolean;    // designer já entregou
}

/** Mensagem do fechamento. null = nada pendente hoje (não posta, pra não virar ruído diário). */
export function buildFechamentoDia(cards: CardDoDia[], diaLabel: string): string | null {
  if (!cards.length) return null;

  // Agrupa por cliente — o time responde por cliente, não por card.
  const porCliente = new Map<string, CardDoDia[]>();
  for (const c of cards) {
    if (!porCliente.has(c.cliente)) porCliente.set(c.cliente, []);
    porCliente.get(c.cliente)!.push(c);
  }

  const linhas = [`🌙 *Fechando o dia* (${diaLabel}) — esses tinham post hoje e ainda não estão marcados como publicados:`, ""];
  for (const [cliente, lista] of porCliente) {
    const semArte = lista.filter((c) => !c.temArte).length;
    const detalhe = semArte === lista.length ? " _(sem arte ainda)_" : semArte ? ` _(${semArte} sem arte)_` : "";
    linhas.push(`• *${cliente}* — ${lista.length} post${lista.length > 1 ? "s" : ""}${detalhe}`);
  }
  linhas.push(
    "",
    "Postaram? Responde aqui: *todos* · *postou Império e Contele* · *só faltou a Farmácia*",
    "_Se não marcar, o post não entra em nenhuma métrica — nem na sua meta._",
  );
  return linhas.join("\n");
}

/** Entende a resposta do time. Retorna quem postou, ou "todos". */
export function parseConfirmacaoPostagem(texto: string, clientesPendentes: string[]): {
  todos: boolean; confirmados: string[]; excecoes: string[];
} {
  const t = (texto || "").toLowerCase().trim();
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // "só faltou X" / "menos o X" — todos MENOS os citados.
  const ehExcecao = /\b(s[óo] (faltou|falta|nao|n[ãa]o)|menos o?a?|exceto|fora o?a?)\b/.test(t);
  const citados = clientesPendentes.filter((c) => {
    const primeira = norm(c).split(/[\s\-–]/)[0];
    return primeira.length >= 3 && norm(t).includes(primeira);
  });

  if (ehExcecao) {
    return { todos: false, confirmados: clientesPendentes.filter((c) => !citados.includes(c)), excecoes: citados };
  }
  // "todos", "todos postaram", "tudo postado", "sim"
  if (/\b(todos|todas|tudo|sim|postamos tudo|ok)\b/.test(t) && !citados.length) {
    return { todos: true, confirmados: clientesPendentes, excecoes: [] };
  }
  return { todos: false, confirmados: citados, excecoes: [] };
}
