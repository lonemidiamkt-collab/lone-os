export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { analisarEstiloVisual } from "@/lib/traffic/estilo-visual";
import { lerEstiloDasArtes, candidatasDoCliente } from "@/lib/traffic/estilo-ler";
import { escolherArtes } from "@/lib/traffic/estilo-automatico";

// ESTILO VISUAL por prints (item 12 do brief): GET último + histórico; POST multipart (files[] 1–4)
// sobe para brand-assets/<id>/estilo/… e a visão descreve; DELETE ?id= apaga uma leitura.
const PUB = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://painel.lonemidia.com/supabase").replace(/\/$/, "")}/storage/v1/object/public/brand-assets`;
const MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  const [{ data, error }, { cands, novasDesde }] = await Promise.all([
    supabaseAdmin.from("client_visual_style").select("id, fonte, imagens, analise, resumo, created_by, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(6),
    candidatasDoCliente(id),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const atual = data?.[0] ?? null;
  return NextResponse.json({ atual, historico: (data ?? []).slice(1), artesElegiveis: escolherArtes(cands).length, artesNovas: novasDesde((atual?.created_at as string) ?? null) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await req.json().catch(() => null) as { fonte?: string } | null;
    if (body?.fonte !== "artes") return NextResponse.json({ error: "fonte inválida" }, { status: 400 });
    return comExecucao({ origem: "api:estilo-visual-artes", ator: user.email }, async () => {
      const r = await lerEstiloDasArtes({ clientId: id, por: user.email, forcar: true });
      if (!r.lido) return NextResponse.json({ error: r.motivo === "erro" ? `Não consegui ler: ${r.erro}` : r.artes < 2 ? "Este cliente ainda não tem 2 artes entregues no sistema — sobe prints por enquanto." : `não releu (${r.motivo})` }, { status: r.motivo === "erro" ? 502 : 400 });
      const { data } = await supabaseAdmin.from("client_visual_style").select("id, fonte, imagens, analise, resumo, created_by, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      anotar(`estilo visual relido das artes: ${r.cliente} (${r.artes})`);
      return NextResponse.json({ ok: true, atual: data });
    });
  }
  const fd = await req.formData().catch(() => null);
  const arquivos = (fd?.getAll("files") ?? []).filter((f): f is File => f instanceof File).slice(0, 4);
  if (!arquivos.length) return NextResponse.json({ error: "Manda de 1 a 4 prints (PNG, JPG ou WebP)." }, { status: 400 });
  for (const f of arquivos) {
    if (!MIMES.has(f.type)) return NextResponse.json({ error: `"${f.name}" não é PNG/JPG/WebP.` }, { status: 400 });
    if (f.size > 12 * 1024 * 1024) return NextResponse.json({ error: `"${f.name}" passa de 12 MB.` }, { status: 400 });
  }
  return comExecucao({ origem: "api:estilo-visual", ator: user.email }, async () => {
    const { data: cli } = await supabaseAdmin.from("clients").select("name, nome_fantasia, nicho").eq("id", id).maybeSingle();
    const cliente = (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente";
    const urls: string[] = [];
    for (const [i, f] of arquivos.entries()) {
      const ext = f.type === "image/jpeg" ? "jpg" : f.type === "image/webp" ? "webp" : "png";
      const path = `${id}/estilo/${Date.now().toString(36)}-${i + 1}.${ext}`;
      const { error } = await supabaseAdmin.storage.from("brand-assets").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: true });
      if (error) return NextResponse.json({ error: `não consegui subir "${f.name}": ${error.message}` }, { status: 500 });
      urls.push(`${PUB()}/${path}`);
    }
    const r = await analisarEstiloVisual({ imagens: urls, cliente, nicho: (cli?.nicho as string) ?? null });
    if (!r.ok || !r.data) return NextResponse.json({ error: `A visão não conseguiu ler os prints: ${r.ok ? "resposta vazia" : r.error}` }, { status: 502 });
    const { data, error } = await supabaseAdmin.from("client_visual_style")
      .insert({ client_id: id, fonte: "print", imagens: urls, analise: r.data, resumo: r.data.resumo, modelo: "gpt-4o", created_by: user.email })
      .select("id, fonte, imagens, analise, resumo, created_by, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    anotar(`estilo visual lido: ${cliente} (${urls.length} prints)`);
    return NextResponse.json({ ok: true, atual: data });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  const rid = req.nextUrl.searchParams.get("id");
  if (!rid) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await supabaseAdmin.from("client_visual_style").delete().eq("client_id", id).eq("id", rid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
