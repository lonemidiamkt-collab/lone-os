export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// MATERIAIS DA MARCA do cliente (Roberto, 14/09: "para eles poderem ver, baixar, ter no cadastro").
//   GET  → logo de capa + todas as versões + links (Figma/Drive) + materiais da agência.
//   POST multipart (file | tipo | nome | capa=1)  → sobe para brand-assets/<id>/marca/… e registra.
//   POST json { tipo: 'link_figma'|'link_drive', url, nome? } → registra um link.
//   DELETE json { assetId } → remove (o arquivo fica no storage; só some da lista).
// Qualquer pessoa logada lê; upload/remoção: admin, gestor, social, designer.

const PODE_EDITAR = new Set(["admin", "manager", "social", "designer", "traffic"]);
const MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf"]);
const PUB = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://painel.lonemidia.com/supabase").replace(/\/$/, "")}/storage/v1/object/public/brand-assets`;
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "arquivo";

async function papel(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("team_members").select("role").eq("email", email).eq("is_active", true).maybeSingle();
  return (data?.role as string) ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  const [{ data: cli }, { data: itens, error }, { data: agencia }] = await Promise.all([
    supabaseAdmin.from("clients").select("doc_logo, drive_link").eq("id", id).maybeSingle(),
    supabaseAdmin.from("client_brand_assets").select("id, tipo, nome, url, mime, bytes, largura, altura, origem, created_at").eq("client_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("client_brand_assets").select("id, tipo, nome, url, mime, bytes").is("client_id", null).order("nome"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ capa: cli?.doc_logo ?? null, driveLink: cli?.drive_link ?? null, itens: itens ?? [], agencia: agencia ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const p = user.isAdmin ? "admin" : await papel(user.email);
  if (!p || !PODE_EDITAR.has(p)) return NextResponse.json({ error: "Sem permissão para mexer na marca do cliente." }, { status: 403 });
  const { id } = await params;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const tipo = body?.tipo as string;
    const url = String(body?.url ?? "").trim();
    if (!["link_figma", "link_drive"].includes(tipo) || !/^https?:\/\//.test(url)) return NextResponse.json({ error: "tipo (link_figma|link_drive) e url válidos são obrigatórios" }, { status: 400 });
    const nome = String(body?.nome ?? (tipo === "link_figma" ? "Figma" : "Drive / Photoshop")).slice(0, 80);
    const { data, error } = await supabaseAdmin.from("client_brand_assets").insert({ client_id: id, tipo, nome, url, origem: "painel", created_by: user.email }).select("id, tipo, nome, url").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo obrigatório" }, { status: 400 });
  if (!MIMES.has(file.type)) return NextResponse.json({ error: "Formato não aceito — use PNG, JPG, WebP, SVG ou PDF." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Arquivo acima de 15 MB." }, { status: 400 });
  const capa = fd?.get("capa") === "1";
  const tipo = capa ? "logo" : (String(fd?.get("tipo") ?? "logo_variante") === "marca_dagua" ? "marca_dagua" : "logo_variante");
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/svg+xml" ? "svg" : file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const path = `${id}/marca/${slug(file.name.replace(/\.[a-z0-9]+$/i, ""))}-${Date.now().toString(36)}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: up } = await supabaseAdmin.storage.from("brand-assets").upload(path, bytes, { contentType: file.type, upsert: true });
  if (up) return NextResponse.json({ error: `não consegui subir o arquivo: ${up.message}` }, { status: 500 });
  const url = `${PUB()}/${path}`;
  const { data, error } = await supabaseAdmin.from("client_brand_assets")
    .insert({ client_id: id, tipo, nome: file.name.slice(0, 120), url, path, mime: file.type, bytes: file.size, origem: "painel", created_by: user.email })
    .select("id, tipo, nome, url, mime, bytes").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (capa) {
    const { error: e2 } = await supabaseAdmin.from("clients").update({ doc_logo: url }).eq("id", id);
    if (e2) return NextResponse.json({ error: `arquivo salvo, mas a capa não mudou: ${e2.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data, capa: capa ? url : undefined });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const p = user.isAdmin ? "admin" : await papel(user.email);
  if (!p || !PODE_EDITAR.has(p)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.assetId) return NextResponse.json({ error: "assetId obrigatório" }, { status: 400 });
  const { error } = await supabaseAdmin.from("client_brand_assets").delete().eq("id", body.assetId).eq("client_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
