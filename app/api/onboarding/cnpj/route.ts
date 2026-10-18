export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/onboarding/cnpj?token=<token do cadastro>&cnpj=<cnpj> — consulta a Receita (BrasilAPI)
// para o formulário público de cadastro (app/onboarding/[token]). Ver lib/empresa/receita.ts.
//
// Pública como o resto de /api/onboarding, mas só para quem tem um link de cadastro válido: sem o
// token, a rota viraria um consultor de CNPJ aberto pago com o nosso nome. Limite por link, para um
// formulário com bug (ou um robô) não martelar a BrasilAPI.
//
// O que a Receita diz (porte, CNAE, situação) é gravado AQUI, no servidor, no cadastro em andamento
// — o navegador não manda esses campos, então ninguém os altera pelo formulário. O que o cliente vê
// e pode corrigir (razão social, nome, endereço, nicho) volta na resposta e segue pelo rascunho.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { consultarCnpj } from "@/lib/empresa/receita-server";
import { colunasDaReceita } from "@/lib/empresa/receita";

const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 12;
const TENTATIVAS = new Map<string, number[]>();

function estourou(token: string): boolean {
  const agora = Date.now();
  const recentes = (TENTATIVAS.get(token) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  TENTATIVAS.set(token, recentes);
  return recentes.length > MAX_POR_JANELA;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = (q.get("token") ?? "").trim();
  const cnpj = (q.get("cnpj") ?? "").replace(/\D/g, "");
  if (!token) return NextResponse.json({ error: "Link de cadastro ausente." }, { status: 400 });

  const { data: sub, error } = await supabaseAdmin
    .from("client_onboarding_submissions").select("id").eq("token", token).maybeSingle();
  if (error) return NextResponse.json({ error: "Não deu para validar o link agora. Tente de novo." }, { status: 500 });
  if (!sub) return NextResponse.json({ error: "Link de cadastro inválido." }, { status: 404 });
  if (estourou(token)) return NextResponse.json({ error: "Muitas consultas seguidas. Espere alguns minutos ou preencha à mão." }, { status: 429 });

  const r = await consultarCnpj(cnpj);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status });

  const { error: eGrava } = await supabaseAdmin.from("client_onboarding_submissions")
    .update(colunasDaReceita(r.empresa)).eq("id", sub.id as string);
  if (eGrava) console.error("[onboarding/cnpj] não gravou a consulta:", eGrava.message);

  return NextResponse.json({ ok: true, empresa: r.empresa });
}
