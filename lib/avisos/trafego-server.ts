// lib/avisos/trafego-server.ts — o aviso de tráfego que o painel FALA (lib/avisos/fala.ts).
//
// Vai pro gestor do cliente e pra gestão (admin), como notificação do tipo "trafego" — uma linha
// por pessoa, porque `notifications.target_user` é um nome só. O WhatsApp do grupo de tráfego
// continua saindo igual; isto é a voz no computador de quem cuida da conta.
//
// Nunca lança: aviso falado é extra, não pode derrubar a rotina que o chama.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface AvisoTrafego {
  clientId: string | null;
  /** Curto: é a primeira coisa que a pessoa ouve. Ex.: "A conta do Maicon Minerais parou". */
  titulo: string;
  /** Uma ou duas frases com o número que importa. */
  corpo?: string;
}

/** Quem ouve: o gestor de tráfego do cliente + os admins ativos. Sem repetição. */
async function destinatarios(clientId: string | null): Promise<string[]> {
  const [{ data: admins }, cli] = await Promise.all([
    supabaseAdmin.from("team_members").select("name").eq("role", "admin").eq("is_active", true).is("deleted_at", null),
    clientId ? supabaseAdmin.from("clients").select("assigned_traffic").eq("id", clientId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const nomes = [((cli.data as { assigned_traffic?: string } | null)?.assigned_traffic ?? "").trim(), ...(admins ?? []).map((a) => String(a.name ?? "").trim())];
  return [...new Set(nomes.filter(Boolean))];
}

/** Grava o aviso pra cada pessoa. O mesmo título não repete pra mesma pessoa no mesmo dia. */
export async function avisarTrafego(avisos: AvisoTrafego[]): Promise<{ criados: number }> {
  let criados = 0;
  try {
    const inicioDoDia = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T00:00:00-03:00`).toISOString();
    for (const a of avisos) {
      const para = await destinatarios(a.clientId);
      if (!para.length) continue;
      const { data: ja } = await supabaseAdmin.from("notifications").select("target_user")
        .eq("type", "trafego").eq("title", a.titulo).gte("created_at", inicioDoDia).in("target_user", para);
      const jaRecebeu = new Set((ja ?? []).map((r) => r.target_user as string));
      const linhas = para.filter((p) => !jaRecebeu.has(p)).map((p) => ({
        type: "trafego", title: a.titulo, body: a.corpo ?? "", client_id: a.clientId, target_user: p, read: false,
      }));
      if (!linhas.length) continue;
      const { error } = await supabaseAdmin.from("notifications").insert(linhas);
      if (error) console.error("[avisos/trafego]", error.message);
      else criados += linhas.length;
    }
  } catch (e) {
    console.error("[avisos/trafego]", e instanceof Error ? e.message : e);
  }
  return { criados };
}
