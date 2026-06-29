// lib/cs/postagem.ts — Relatório de POSTAGEM do Agente CS (pauta do dia).
// Lógica PURA: recebe os clientes do dia (e se cada um tem post agendado) e monta a
// mensagem pro grupo da equipe. Sem I/O — a rota busca os dados e chama isto.
//
// Regra (decisão do Roberto): roda nos dias FIRMES (seg/sex) com o balanço completo
// (quem tem pauta e quem não tem); e num dia FORA (ter/qua/qui) só aparece SE algum
// cliente tiver post agendado pra aquele dia (aí lista quem tem).

export interface PostingClient {
  nome: string;
  temPost: boolean; // tem card com due_date = hoje?
}

export interface PostingInput {
  diaLabel: string;          // ex.: "segunda, 30/06"
  firme: boolean;            // seg/sex = dia firme (todo cliente é esperado postar)
  clientes: PostingClient[]; // clientes ativos com social
}

/** Monta o relatório de postagem. Retorna null = não deve postar (dia fora sem nada agendado). */
export function buildPostingReport(inp: PostingInput): string | null {
  const { diaLabel, firme, clientes } = inp;
  const comPost = clientes.filter((c) => c.temPost).map((c) => c.nome);
  const semPost = clientes.filter((c) => !c.temPost).map((c) => c.nome);

  if (firme) {
    // Dia firme: balanço completo da pauta.
    const linhas = [`🗓️ *Pauta de hoje* (${diaLabel})`, ""];
    linhas.push(`✅ *Com post:* ${comPost.length ? comPost.join(", ") : "—"}`);
    linhas.push(`❌ *Sem post:* ${semPost.length ? semPost.join(", ") : "nenhum 🎉"}`);
    linhas.push("");
    linhas.push(
      semPost.length
        ? `${semPost.length} cliente${semPost.length > 1 ? "s" : ""} sem pauta pra hoje — bora criar? 👀`
        : "Todo mundo com pauta hoje! Mandaram bem 🚀",
    );
    return linhas.join("\n");
  }

  // Dia fora (ter/qua/qui): só aparece se houver post agendado pra hoje.
  if (comPost.length === 0) return null;
  return [
    `🗓️ *Posts de hoje* (${diaLabel})`,
    "",
    `Tem post agendado pra hoje: *${comPost.join(", ")}*`,
  ].join("\n");
}
