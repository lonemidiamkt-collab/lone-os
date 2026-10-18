export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/system/receita-clientes — consulta na Receita (BrasilAPI) o CNPJ dos clientes ativos e
// grava porte, atividade (CNAE) e situação na ficha. O nicho só é preenchido onde está vazio — o
// que a equipe definiu à mão vale mais que o palpite pelo CNAE. Ver lib/empresa/receita.ts.
//
// Roberto (18/10/2026) autorizou rodar para os clientes atuais ("sim"). Também serve para refazer
// de tempos em tempos: empresa que aparece BAIXADA ou INAPTA é sinal que ninguém vê de outro jeito.
//
//   sem parâmetro → ensaio: consulta e devolve o que gravaria, sem gravar
//   ?aplicar=1    → grava
//   ?forcar=1     → reconsulta também quem foi consultado nos últimos 30 dias

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { consultarCnpj } from "@/lib/empresa/receita-server";
import { colunasDaReceita, cnpjValido } from "@/lib/empresa/receita";

const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
const PAUSA_MS = 1500; // a BrasilAPI é gratuita: uma consulta por vez, com folga
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  const aplicar = q.get("aplicar") === "1";
  const forcar = q.get("forcar") === "1";

  const { data: clientes, error } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, cnpj, nicho, receita_consultada_em")
    .eq("active", true).is("churned_at", null).is("draft_status", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agora = Date.now();
  const linhas: Record<string, unknown>[] = [];
  const pulados: { cliente: string; motivo: string }[] = [];
  let gravados = 0, nichos = 0;

  for (const c of clientes ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    if (!c.cnpj || !cnpjValido(c.cnpj)) { pulados.push({ cliente: nome, motivo: c.cnpj ? "CNPJ inválido no cadastro" : "sem CNPJ" }); continue; }
    const ultima = c.receita_consultada_em ? Date.parse(c.receita_consultada_em as string) : NaN;
    if (!forcar && Number.isFinite(ultima) && agora - ultima < TRINTA_DIAS) { pulados.push({ cliente: nome, motivo: "consultado há menos de 30 dias" }); continue; }

    const r = await consultarCnpj(c.cnpj as string);
    if (!r.ok) { pulados.push({ cliente: nome, motivo: r.motivo }); if (!r.ok && r.status === 503) await espera(PAUSA_MS * 2); continue; }

    const e = r.empresa;
    const campos: Record<string, unknown> = colunasDaReceita(e);
    const nichoVazio = !(c.nicho as string | null)?.trim();
    if (nichoVazio && e.nichoRotulo) campos.nicho = e.nichoRotulo;

    if (aplicar) {
      const { error: eGrava } = await supabaseAdmin.from("clients").update(campos).eq("id", c.id as string);
      if (eGrava) { pulados.push({ cliente: nome, motivo: `não gravou: ${eGrava.message}` }); continue; }
      gravados++;
      if ("nicho" in campos) nichos++;
    }
    linhas.push({
      cliente: nome, porte: e.porte, cnae: `${e.cnaePrincipal} ${e.cnaeDescricao ?? ""}`.trim(), situacao: e.situacao,
      nicho_atual: (c.nicho as string) || null, nicho_sugerido: e.nichoRotulo, nicho_gravado: "nicho" in campos ? e.nichoRotulo : null,
    });
    if (!r.doCache) await espera(PAUSA_MS);
  }

  const naoAtivas = linhas.filter((l) => l.situacao && l.situacao !== "ATIVA").map((l) => `${l.cliente}: ${l.situacao}`);
  return NextResponse.json({
    ok: true, aplicar, consultados: linhas.length, gravados, nichos_preenchidos: nichos,
    empresas_nao_ativas: naoAtivas, pulados, linhas,
  });
}
