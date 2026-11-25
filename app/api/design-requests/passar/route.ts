export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// As artes abertas de um cliente que estão com outra pessoa → quem é o designer DO CLIENTE (25/11/2026).
//   GET  ?clientId          → { para, artes } o que está com outra pessoa
//   POST { clientId, ids }  → passa essas artes. O destino sai do cadastro, nunca do corpo.
// Gestão passa tudo; o designer do cliente, o que ninguém começou. Só grava o que ainda está com quem foi lido.

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { artesComOutro, podePassarJunto, type ArteComOutro } from "@/lib/design/carteira";
import { estadoDoDesign } from "@/lib/conteudo/producao";
import { membroDaEquipe, mesmaPessoa } from "@/lib/equipe/pessoa";
import type { ContentCard, DesignRequest } from "@/lib/types";

type Linha = Record<string, unknown>;
const LOTE = 60;
const PAGINA = 1000;

async function paginas(ler: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Linha[]> {
  const todas: Linha[] = [];
  for (let de = 0; de < 20_000; de += PAGINA) {
    const { data, error } = await ler(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const l = (data ?? []) as Linha[];
    todas.push(...l);
    if (l.length < PAGINA) break;
  }
  return todas;
}

interface Situacao { cliente: { id: string; nome: string; designer: string } | null; artes: ArteComOutro[]; gravado: Map<string, string> }

async function situacao(clientId: string): Promise<Situacao> {
  const { data: c, error } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_designer").eq("id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return { cliente: null, artes: [], gravado: new Map() };
  const designer = String(c.assigned_designer ?? "").trim();
  const cliente = { id: c.id as string, nome: (c.nome_fantasia as string) || (c.name as string), designer };
  if (!designer) return { cliente, artes: [], gravado: new Map() };
  const [pedidos, cards] = await Promise.all([
    paginas((de, ate) => supabaseAdmin.from("design_requests").select("id, status, assigned_designer, content_card_id, created_at").eq("client_id", clientId).neq("status", "done").order("id").range(de, ate)),
    paginas((de, ate) => supabaseAdmin.from("content_cards").select("id, title, status, client_id, archived_at, designer_delivered_at, alteracao_pendente_em, design_request_id").eq("client_id", clientId).is("archived_at", null).order("id").range(de, ate)),
  ]);
  const itens = cards.flatMap((k) => {
    const p = pedidos.find((x) => x.id === k.design_request_id)
      ?? (k.design_request_id ? undefined : [...pedidos].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))).find((x) => x.content_card_id === k.id));
    if (!p) return [];
    const pedido = { id: p.id, status: p.status, assignedDesigner: p.assigned_designer ?? undefined } as unknown as DesignRequest;
    const estado = estadoDoDesign({ status: k.status as ContentCard["status"], designerDeliveredAt: (k.designer_delivered_at as string) ?? undefined, alteracaoPendenteEm: (k.alteracao_pendente_em as string) ?? undefined }, pedido);
    return [{ card: { id: k.id, title: k.title, clientId: k.client_id } as unknown as ContentCard, pedido, estado }];
  });
  return { cliente, artes: artesComOutro(itens, clientId, designer), gravado: new Map(pedidos.map((p) => [p.id as string, String(p.assigned_designer ?? "")])) };
}

const falhou = (e: unknown, fim: string) => NextResponse.json({ error: `${fim} (${e instanceof Error ? e.message : "erro"}).` }, { status: 500 });

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  try {
    const s = await situacao(clientId);
    if (!s.cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    return NextResponse.json({ para: s.cliente.designer || null, artes: s.artes });
  } catch (e) {
    return falhou(e, "Não consegui ver as artes abertas deste cliente");
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "designer"]);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { clientId?: unknown; ids?: unknown } | null;
  const ids = Array.isArray(b?.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === "string" && !!x))].slice(0, 500) : [];
  if (typeof b?.clientId !== "string" || !b.clientId || !ids.length) return NextResponse.json({ error: "Informe o cliente e as artes." }, { status: 400 });
  try {
    const [s, { data: equipe, error: erroEquipe }] = await Promise.all([
      situacao(b.clientId),
      supabaseAdmin.from("team_members").select("name, email, role, is_active, deleted_at"),
    ]);
    if (erroEquipe) throw new Error(erroEquipe.message);
    if (!s.cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    if (!s.cliente.designer) return NextResponse.json({ error: "Este cliente está sem designer na ficha. Defina primeiro quem é." }, { status: 409 });
    const ativos = ((equipe ?? []) as Linha[]).filter((m) => m.is_active !== false && !m.deleted_at) as (Linha & { name: string })[];
    const pessoa = membroDaEquipe(s.cliente.designer, ativos.filter((m) => m.role === "designer"));
    if (!pessoa) return NextResponse.json({ error: `${s.cliente.designer} não é designer ativo na equipe. Corrija o campo Designer na ficha do cliente. Nada mudou.` }, { status: 409 });
    if (gate.papel === "designer") {
      const meu = (gate.user.email || "").toLowerCase();
      const eu = ativos.find((m) => String(m.email ?? "").toLowerCase() === meu)?.name;
      if (!mesmaPessoa(eu, pessoa.name)) return NextResponse.json({ error: `Este cliente é de ${pessoa.name}. Só a gestão ou o próprio designer passa as artes.` }, { status: 403 });
    }
    const pedidas = s.artes.filter((a) => ids.includes(a.pedidoId));
    const lista = pedidas.filter((a) => podePassarJunto(gate.papel, a));

    // Por nome gravado: a trava é no valor lido, letra por letra.
    const grupos = new Map<string, string[]>();
    for (const a of lista) grupos.set(s.gravado.get(a.pedidoId)!, [...(grupos.get(s.gravado.get(a.pedidoId)!) ?? []), a.pedidoId]);
    const passadas: string[] = [];
    let falha: string | null = null;
    for (const [antes, todos] of grupos) {
      for (let i = 0; i < todos.length; i += LOTE) {
        let q = supabaseAdmin.from("design_requests").update({ assigned_designer: pessoa.name }).in("id", todos.slice(i, i + LOTE)).eq("assigned_designer", antes).neq("status", "done");
        // O designer não leva a arte que o colega começou entre a leitura e a gravação.
        if (gate.papel === "designer") q = q.neq("status", "in_progress");
        const { data, error } = await q.select("id");
        if (error) { falha = error.message; break; }
        passadas.push(...((data ?? []) as Linha[]).map((x) => x.id as string));
      }
    }
    if (falha && !passadas.length) return NextResponse.json({ error: `Não consegui passar as artes (${falha}). Nada mudou.` }, { status: 500 });

    if (passadas.length) {
      const foram = lista.filter((a) => passadas.includes(a.pedidoId));
      const avisos: Linha[] = [];
      const aviso = (target: string, title: string, artes: ArteComOutro[]) => avisos.push({
        type: "content", title, body: `${s.cliente!.nome}: ${artes.slice(0, 3).map((a) => a.titulo).join(", ")}${artes.length > 3 ? ` e mais ${artes.length - 3}` : ""}`,
        client_id: s.cliente!.id, card_id: artes.length === 1 ? artes[0].cardId : null, target_user: target,
      });
      if (gate.papel !== "designer") aviso(pessoa.name, foram.length === 1 ? "Uma arte passou para você" : `${foram.length} artes passaram para você`, foram);
      for (const antes of new Set(foram.map((a) => a.com))) {
        const dele = foram.filter((a) => a.com === antes);
        aviso(antes, dele.length === 1 ? `Uma arte passou para ${pessoa.name}` : `${dele.length} artes passaram para ${pessoa.name}`, dele);
      }
      const { error } = await supabaseAdmin.from("notifications").insert(avisos);
      if (error) console.error("[design-requests/passar] aviso:", error.message);
    }
    const fazendo = pedidas.length - lista.length;
    const ficaram = ids.length - passadas.length - fazendo;
    const avisos = [
      fazendo ? `${fazendo === 1 ? "1 arte já começada ficou" : `${fazendo} artes já começadas ficaram`} com quem está fazendo.` : "",
      falha ? `${ficaram} não ${ficaram === 1 ? "foi passada" : "foram passadas"} (${falha}).` : ficaram > 0 ? `${ficaram === 1 ? "1 arte mudou" : `${ficaram} artes mudaram`} no meio e ${ficaram === 1 ? "ficou" : "ficaram"} como ${ficaram === 1 ? "está" : "estão"}.` : "",
    ].filter(Boolean).join(" ");
    return NextResponse.json({ passadas, para: pessoa.name, ...(avisos ? { aviso: avisos } : {}) });
  } catch (e) {
    return falhou(e, "Não consegui passar as artes");
  }
}
