export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario } from "@/lib/api/require-role";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { logoComoDataUri } from "@/lib/clients/logo-data-uri";
import { fichaPdfHtml, montarFicha, tomDaFicha, type DadosFicha } from "@/lib/clientes/ficha-uma-pagina";

// GET /api/clients/[id]/ficha-uma-pagina[?formato=pdf] — A FICHA DE UMA PÁGINA (Leva 7C, N23).
// Posicionamento, tom, palavras proibidas, produtos, regras e marca, do briefing atual
// (client_briefings), do catálogo (client_products), das regras do Agente (cs_client_rules), do
// estilo visual lido (client_visual_style) e do cadastro. Regras de montagem em
// lib/clientes/ficha-uma-pagina.ts. Qualquer papel que abre a ficha pode ver — é o material de marca
// que o time (e o fornecedor) usa para criar. Sem preço de produto, sem dado cadastral.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!(await papelDoUsuario(user))) return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });
  const { id } = await params;
  const agoraIso = new Date().toISOString();

  const [cliQ, brQ, prodQ, regQ, estQ] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia, nicho, instagram_user, doc_logo, tone_of_voice").eq("id", id).maybeSingle(),
    supabaseAdmin.from("client_briefings")
      .select("resumo_estrategico, contato, produtos, publico_alvo, posicionamento, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar, ctas")
      .eq("client_id", id).eq("is_current", true).maybeSingle(),
    supabaseAdmin.from("client_products").select("nome, categoria").eq("client_id", id).eq("ativo", true).order("updated_at", { ascending: false }).limit(40),
    supabaseAdmin.from("cs_client_rules").select("texto, escopo").eq("client_id", id).eq("ativo", true)
      .or(`expires_at.is.null,expires_at.gt.${agoraIso}`).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("client_visual_style").select("analise").eq("client_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (cliQ.error) return NextResponse.json({ error: `clients: ${cliQ.error.message}` }, { status: 500 });
  const c = cliQ.data;
  if (!c) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const b = (brQ.data ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);
  const est = (estQ.data?.analise ?? null) as { paleta?: { hex: string; papel: string }[]; tipografia?: string; o_que_evitar?: string[] } | null;
  // Catálogo primeiro (é o vivo); o briefing completa o que o catálogo não tem.
  const produtos = [...(prodQ.data ?? []).map((p) => p.nome as string), ...arr(b.produtos)];

  const pdf = req.nextUrl.searchParams.get("formato") === "pdf";
  const dados: DadosFicha = {
    cliente: (c.nome_fantasia as string) || (c.name as string),
    nicho: (c.nicho as string) || null,
    instagram: (c.instagram_user as string) || null,
    logo: pdf ? await logoComoDataUri(c.doc_logo as string | null) : ((c.doc_logo as string) || null),
    resumo: (b.resumo_estrategico as string) || null,
    posicionamento: (b.posicionamento as string) || null,
    tom: tomDaFicha(b.tom_voz as string | null, c.tone_of_voice as string | null),
    publico: arr(b.publico_alvo),
    palavrasProibidas: arr(b.palavras_proibidas),
    concorrentesEvitar: arr(b.concorrentes_evitar_mencionar),
    produtos,
    destaques: arr(b.produtos_destaque_atual),
    ctas: arr(b.ctas),
    regras: (regQ.data ?? []).map((r) => ({ texto: r.texto as string, escopo: (r.escopo as string) ?? null })),
    paleta: Array.isArray(est?.paleta) ? est!.paleta : [],
    tipografia: est?.tipografia || null,
    evitarVisual: Array.isArray(est?.o_que_evitar) ? est!.o_que_evitar : [],
    contato: (b.contato as string) || null,
  };
  const ficha = montarFicha(dados);

  if (!pdf) return NextResponse.json({ ficha });

  if (!ficha.suficiente) {
    return NextResponse.json({ error: "A ficha ainda está vazia demais para virar PDF.", faltando: ficha.faltando }, { status: 422 });
  }
  const geradoEm = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const r = await htmlToPdf(fichaPdfHtml(ficha, geradoEm, await loadLoneLogo()));
  if (!r.ok || !r.buffer) return NextResponse.json({ error: r.error ?? "Falha ao gerar o PDF" }, { status: 502 });
  const slug = ficha.cliente.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(new Uint8Array(r.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="ficha-${slug}.pdf"` },
  });
}
