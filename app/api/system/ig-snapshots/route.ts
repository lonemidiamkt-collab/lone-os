export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getIgSnapshotCached, reconcileIgFromAdAccounts, IG_PERIODS } from "@/lib/meta/igSnapshot";
import { csSendGroupText } from "@/lib/cs/notify";
import type { IgPost } from "@/lib/meta/igSnapshot";

/** Acumula os posts reais em client_ig_posts. Best-effort: nunca derruba a geração do snapshot. */
async function guardarPosts(clientId: string, posts: IgPost[]): Promise<void> {
  try {
    const linhas = posts
      .filter((p) => p.id && p.data)
      .map((p) => ({
        media_id: p.id, client_id: clientId, posted_at: p.data,
        tipo: p.tipo || null, permalink: p.permalink, thumb: p.thumb,
        curtidas: p.curtidas, comentarios: p.comentarios,
        atualizado_em: new Date().toISOString(),
      }));
    if (linhas.length) await supabaseAdmin.from("client_ig_posts").upsert(linhas, { onConflict: "media_id" });
  } catch { /* histórico é secundário ao snapshot do dia */ }
}

// POST /api/system/ig-snapshots — pré-gera os relatórios de Instagram (semana + mês) de cada cliente
// com IG mapeado, guardando no cache (client_ig_snapshots). Assim o portal/interno lê do cache e NÃO
// bate na Meta ao vivo (evita rate limit). Cron sugerido: 1x/dia. Espaça as chamadas pra não estourar
// a cota da Meta. ?clientId=… roda só um.
export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const onlyClient = req.nextUrl.searchParams.get("clientId");

  // Auto-vincula IG pela conta de anúncio (cliente novo com anúncio já entra sozinho). Só no lote.
  const autoMapeados = onlyClient ? [] : await reconcileIgFromAdAccounts();

  // Só cliente que a gente atende de verdade — antes rodava em churned/rascunho e queimava cota.
  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia")
    .or("ig_business_account_id.not.is.null,ig_public_username.not.is.null")
    .in("status", ["good", "average", "onboarding"]).is("draft_status", null)
    .or("active.is.null,active.eq.true");
  if (onlyClient) q = supabaseAdmin.from("clients").select("id, name, nome_fantasia").eq("id", onlyClient);
  const { data: clients } = await q;

  const feitos: string[] = [];
  // FALHA TEM QUE APARECER. Antes só o sucesso entrava na resposta: o @ do Dumar deixou de existir
  // no Instagram e o relatório dele sumiu por 11 dias sem uma linha de log em lugar nenhum.
  const falhas: { cliente: string; periodo: string; motivo: string }[] = [];
  for (const c of clients ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    for (const periodo of IG_PERIODS) {
      const snap = await getIgSnapshotCached(c.id as string, periodo, true); // force = gera fresco e grava
      if (snap.mapped && !snap.error) {
        feitos.push(`${nome}/${periodo}`);
        // O snapshot é uma JANELA e é sobrescrito: sozinho ele nunca responde "e em maio?".
        // A janela de 30d alimenta o histórico post a post (client_ig_posts), que é a fonte
        // de "postou ou não" — o board tinha 3 cards publicados contra 307 posts reais.
        if (periodo === "30d" && snap.posts?.length) await guardarPosts(c.id as string, snap.posts);
      }
      else falhas.push({ cliente: nome, periodo, motivo: snap.error || (snap.mapped ? "sem dados" : "Instagram não vinculado") });
      // pequeno respiro entre chamadas pra não estourar a cota da Meta
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Avisa o time quando um cliente inteiro ficou sem Instagram (as 3 janelas falharam) — é isso que
  // derruba o relatório dele. Falha de uma janela só é ruído e fica só na resposta.
  const porCliente = new Map<string, string>();
  for (const f of falhas) if (!porCliente.has(f.cliente)) porCliente.set(f.cliente, f.motivo);
  const mortos = [...porCliente.entries()].filter(([cli]) => falhas.filter((f) => f.cliente === cli).length >= IG_PERIODS.length);
  const internalJid = process.env.CS_INTERNAL_GROUP_JID;
  if (mortos.length && internalJid && !onlyClient) {
    const linhas = mortos.map(([cli, motivo]) => `• *${cli}* — ${motivo}`).join("\n");
    await csSendGroupText(internalJid,
      `📉 *Instagram sem dados* — ${mortos.length} cliente(s) não vão ter a parte de Instagram no relatório:\n\n${linhas}\n\n` +
      `_Geralmente é o @ que mudou ou a conta saiu de Comercial. Vale conferir com o cliente._`);
  }

  return NextResponse.json({ ok: true, gerados: feitos.length, detalhe: feitos, falhas, clientes_sem_ig: mortos.map(([c]) => c), auto_vinculados: autoMapeados });
}
