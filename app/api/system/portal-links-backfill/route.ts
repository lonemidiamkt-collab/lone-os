export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  faltaColunaDaTrava, garantirLinkDoPortal, situacaoParaBackfill,
  type ClienteLinkPortal, type ResultadoLinkPortal,
} from "@/lib/portal/link-automatico";

// /api/system/portal-links-backfill — clientes ATIVOS sem link do portal (uso manual, uma vez).
//
// Por padrão SÓ LISTA. Nada é gerado nem enviado sem pedir:
//   GET  (ou POST ?dry=1) .......... lista: sem link, link que o grupo de cadastro nunca recebeu, desativados
//   POST ?gerar=1 .................. gera o link de quem não tem (sem mandar nada)
//   POST ?enviar=1 ................. avisa o grupo de cadastro dos links que ele nunca recebeu
//   POST ?gerar=1&enviar=1 ......... as duas coisas
//   &ids=<uuid>,<uuid> ............. só esses clientes
//   &limite=N ...................... no máximo N clientes nesta chamada (padrão 100; 15 quando envia)
//
// Mensagem só para o grupo INTERNO de cadastro, uma por cliente, uma vez na vida (a trava de
// lib/portal/link-automatico.ts vale aqui também). Link revogado de propósito nunca é recriado.
// Cron-only: Authorization: Bearer <CRON_SECRET>.

const COLS = "id, name, nome_fantasia, paused_at, paused_until, public_report_token, public_report_token_revoked_at, public_report_enabled";
const PAUSA_ENTRE_ENVIOS_MS = 1500;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function executar(req: NextRequest, soListar: boolean) {
  const denied = requireCron(req); if (denied) return denied;
  const q = req.nextUrl.searchParams;
  const dry = soListar || q.get("dry") !== null;
  const gerar = !dry && q.get("gerar") === "1";
  const enviar = !dry && q.get("enviar") === "1";
  const limiteBruto = parseInt(q.get("limite") ?? "", 10);
  const limite = Math.min(Math.max(Number.isFinite(limiteBruto) ? limiteBruto : enviar ? 15 : 100, 1), 200);
  const ids = (q.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Ativo = na carteira (não arquivado, não ex-cliente) e fora de rascunho.
  const ler = (cols: string) => {
    let s = supabaseAdmin.from("clients").select(cols)
      .or("active.is.null,active.eq.true").is("churned_at", null).is("draft_status", null).order("name");
    if (ids.length) s = s.in("id", ids);
    return s;
  };
  let semColuna = false;
  let r = await ler(`${COLS}, portal_link_avisado_em`);
  if (r.error && faltaColunaDaTrava(r.error)) { semColuna = true; r = await ler(COLS); }
  if (r.error) return NextResponse.json({ ok: false, erro: r.error.message }, { status: 500 });

  const clientes = (r.data ?? []) as unknown as ClienteLinkPortal[];
  const nome = (c: ClienteLinkPortal) => c.nome_fantasia || c.name || "Cliente";
  const grupo = (s: ReturnType<typeof situacaoParaBackfill>) =>
    clientes.filter((c) => situacaoParaBackfill(c, semColuna) === s).map((c) => ({ id: c.id, nome: nome(c) }));
  const semLink = grupo("sem_link");
  const semAviso = grupo("sem_aviso");
  const desativados = grupo("desativado");

  // Com gerar+enviar, quem ganha link agora também é avisado (garantirLinkDoPortal faz os dois).
  const alvos = [...(gerar ? semLink : []), ...(enviar ? semAviso : [])];
  const fila = alvos.slice(0, limite);
  const feitos: Omit<ResultadoLinkPortal, "url">[] = [];
  for (const a of fila) {
    const res = await garantirLinkDoPortal(a.id, { origem: "backfill", gerar, enviar });
    // O link fica fora da resposta: quem precisa dele abre a ficha → Portal.
    feitos.push({ clientId: res.clientId, nome: res.nome, gerado: res.gerado, enviado: res.enviado, motivo: res.motivo });
    if (res.enviado) await espera(PAUSA_ENTRE_ENVIOS_MS);
  }

  return NextResponse.json({
    ok: true, dry, gerar, enviar, limite,
    migracaoPendente: semColuna,
    ativos: clientes.length,
    semLink, semAviso, desativados,
    feitos,
    restantes: Math.max(0, alvos.length - fila.length),
    ...(dry || (!gerar && !enviar) ? {
      proximo: "Nada foi gerado nem enviado. ?gerar=1 gera o link de quem não tem; ?enviar=1 avisa o grupo de cadastro (uma vez por cliente). Juntos: ?gerar=1&enviar=1.",
    } : {}),
  });
}

export async function GET(req: NextRequest) { return executar(req, true); }
export async function POST(req: NextRequest) { return executar(req, false); }
