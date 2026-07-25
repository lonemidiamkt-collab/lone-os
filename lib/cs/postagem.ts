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
