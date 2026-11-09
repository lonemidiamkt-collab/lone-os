export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { garantirPastaDoCliente } from "@/lib/drive/sincronizar-pasta";

// /api/system/drive-pastas — a pasta do Drive para os clientes que JÁ existiam (uso manual, uma vez).
// Cliente novo ganha a pasta sozinho no fim do cadastro (lib/drive/sincronizar-pasta.ts).
//
// Por padrão SÓ LISTA. Nada é criado sem pedir:
//   GET  (ou POST ?dry=1) ...... ativos sem pasta e com falha na última tentativa
//   POST ?criar=1 .............. cria a pasta de quem não tem (sem aviso no grupo; o Google não manda
//                                e-mail de "compartilhou com você" a cada pasta — eram ~100 e-mails)
//   &ids=<uuid>,<uuid> ......... só esses clientes
//   &limite=N .................. no máximo N nesta chamada (padrão 10, teto 60)
// Cron-only: Authorization: Bearer <CRON_SECRET>.

const PAUSA_MS = 1000;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function executar(req: NextRequest, soListar: boolean) {
  const denied = requireCron(req); if (denied) return denied;
  const q = req.nextUrl.searchParams;
  const criar = !soListar && q.get("dry") === null && q.get("criar") === "1";
  const limiteBruto = parseInt(q.get("limite") ?? "", 10);
  const limite = Math.min(Math.max(Number.isFinite(limiteBruto) ? limiteBruto : 10, 1), 60);
  const ids = (q.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Ativo = na carteira (não arquivado, não ex-cliente) e fora de rascunho.
  let consulta = supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, drive_pasta_id, drive_erro")
    .or("active.is.null,active.eq.true").is("churned_at", null).is("draft_status", null).order("name");
  if (ids.length) consulta = consulta.in("id", ids);
  const { data, error } = await consulta;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const nome = (c: { name: string | null; nome_fantasia: string | null }) => c.nome_fantasia || c.name || "Cliente";
  const todos = data ?? [];
  const semPasta = todos.filter((c) => !c.drive_pasta_id).map((c) => ({ id: c.id as string, nome: nome(c) }));
  const comFalha = todos.filter((c) => c.drive_erro).map((c) => ({ id: c.id as string, nome: nome(c), erro: c.drive_erro as string }));

  const feitos: { id: string; nome: string; ok: boolean; criada: boolean; erro?: string; avisos: string[] }[] = [];
  if (criar) {
    for (const c of semPasta.slice(0, limite)) {
      const r = await garantirPastaDoCliente(c.id, { origem: "backfill", notificarEquipe: false });
      feitos.push({ id: c.id, nome: c.nome, ok: r.ok, criada: r.criada, erro: r.erro, avisos: r.avisos });
      // Google desconectado ou sem o Drive: as próximas falhariam igual. Para aqui.
      if (!r.ok && /Google da Lone|Google Drive API/.test(r.erro ?? "")) break;
      await espera(PAUSA_MS);
    }
  }

  return NextResponse.json({
    ok: true, criar, limite,
    ativos: todos.length,
    semPasta, comFalha, feitos,
    restantes: criar ? Math.max(0, semPasta.length - feitos.filter((f) => f.ok).length) : semPasta.length,
    ...(!criar ? { proximo: "Nada foi criado. POST ?criar=1 cria a pasta de quem não tem (&limite=N, &ids=…)." } : {}),
  });
}

export async function GET(req: NextRequest) { return executar(req, true); }
export async function POST(req: NextRequest) { return executar(req, false); }
