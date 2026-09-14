export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// CATÁLOGO DE PRODUTOS do cliente (Product Library).
//   GET → produtos ativos + em quantos anúncios cada um apareceu (creative_attributes.produto).
//   POST json { nome, marca?, codigo?, categoria?, preco?, descricao? } → cria.
//   POST multipart (file, produtoId) → sobe foto para brand-assets/<cliente>/produtos/… e anexa.
//   PATCH json { id, ...campos } · DELETE json { id } (desativa; nada some).

const PODE_EDITAR = new Set(["admin", "manager", "social", "designer", "traffic"]);
const PUB = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://painel.lonemidia.com/supabase").replace(/\/$/, "")}/storage/v1/object/public/brand-assets`;
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "foto";
const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function podeEditar(email: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const { data } = await supabaseAdmin.from("team_members").select("role").eq("email", email).eq("is_active", true).maybeSingle();
  return PODE_EDITAR.has((data?.role as string) ?? "");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  const [{ data: prods, error }, { data: attrs }] = await Promise.all([
    supabaseAdmin.from("client_products").select("id, nome, marca, codigo, categoria, preco, descricao, fotos, origem, updated_at").eq("client_id", id).eq("ativo", true).order("nome"),
    supabaseAdmin.from("creative_attributes").select("ad_id, produto").eq("client_id", id).not("produto", "is", null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // "criativos onde apareceu": casamento por nome (melhor esforço — o atributo é texto livre da visão)
  const itens = (prods ?? []).map((p) => {
    const n = sem(p.nome as string);
    const anuncios = (attrs ?? []).filter((a) => { const ap = sem(String(a.produto)); return ap.includes(n) || n.includes(ap); }).map((a) => a.ad_id as string);
    return { ...p, anuncios: [...new Set(anuncios)] };
  });
  return NextResponse.json({ itens });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!(await podeEditar(user.email, user.isAdmin))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const b = await req.json().catch(() => null);
    const nome = String(b?.nome ?? "").trim();
    if (!nome) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });
    const preco = b?.preco === "" || b?.preco == null ? null : Number(String(b.preco).replace(",", "."));
    if (preco != null && !Number.isFinite(preco)) return NextResponse.json({ error: "preço inválido" }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("client_products").insert({
      client_id: id, nome: nome.slice(0, 120), marca: (b?.marca ?? null) || null, codigo: (b?.codigo ?? null) || null, categoria: (b?.categoria ?? null) || null,
      preco, descricao: (b?.descricao ?? null) || null, created_by: user.email,
    }).select("id, nome, marca, codigo, categoria, preco, descricao, fotos, origem").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: { ...data, anuncios: [] } });
  }
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file"); const produtoId = String(fd?.get("produtoId") ?? "");
  if (!(file instanceof File) || !produtoId) return NextResponse.json({ error: "file e produtoId são obrigatórios" }, { status: 400 });
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Foto em PNG, JPG ou WebP." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Foto acima de 10 MB." }, { status: 400 });
  const { data: prod } = await supabaseAdmin.from("client_products").select("id, fotos").eq("id", produtoId).eq("client_id", id).maybeSingle();
  if (!prod) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const path = `${id}/produtos/${produtoId}/${slug(file.name.replace(/\.[a-z0-9]+$/i, ""))}-${Date.now().toString(36)}.${ext}`;
  const { error: up } = await supabaseAdmin.storage.from("brand-assets").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
  if (up) return NextResponse.json({ error: `não consegui subir a foto: ${up.message}` }, { status: 500 });
  const url = `${PUB()}/${path}`;
  const fotos = [...((prod.fotos as string[]) ?? []), url];
  const { error } = await supabaseAdmin.from("client_products").update({ fotos, updated_at: new Date().toISOString() }).eq("id", produtoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url, fotos });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!(await podeEditar(user.email, user.isAdmin))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["nome", "marca", "codigo", "categoria", "descricao"]) if (k in b) patch[k] = b[k] === "" ? null : String(b[k]).slice(0, 500);
  if ("preco" in b) { const preco = b.preco === "" || b.preco == null ? null : Number(String(b.preco).replace(",", ".")); if (preco != null && !Number.isFinite(preco)) return NextResponse.json({ error: "preço inválido" }, { status: 400 }); patch.preco = preco; }
  if (Array.isArray(b.fotos)) patch.fotos = b.fotos.filter((f: unknown) => typeof f === "string");
  const { data, error } = await supabaseAdmin.from("client_products").update(patch).eq("id", b.id).eq("client_id", id).select("id, nome, marca, codigo, categoria, preco, descricao, fotos, origem").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!(await podeEditar(user.email, user.isAdmin))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await supabaseAdmin.from("client_products").update({ ativo: false, updated_at: new Date().toISOString() }).eq("id", b.id).eq("client_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
