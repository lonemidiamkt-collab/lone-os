export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { extrairProdutos, montarTexto } from "@/lib/clients/produtos-do-briefing";

// POST /api/system/produtos-do-briefing?max=20[&clientId=] — completa o catálogo de cada cliente
// ativo com o que o briefing/regras NOMEIAM e ainda não está lá. Marca origem 'briefing_ia' para a
// equipe saber que veio da leitura (e corrigir). Roda uma vez agora; depois só quando o briefing muda.
export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  const max = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 20) || 20));
  const so = req.nextUrl.searchParams.get("clientId");
  return comExecucao({ origem: "cron:produtos-do-briefing", ator: "cron" }, async () => {
    let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, nicho, fixed_briefing, campaign_briefing").eq("active", true).is("churned_at", null).order("name");
    if (so) q = q.eq("id", so);
    const { data: clientes } = await q;
    const inicio = Date.now();
    const resultados: { cliente: string; novos: number; erro?: string }[] = [];
    let feitos = 0;
    for (const c of clientes ?? []) {
      if (feitos >= max || Date.now() - inicio > 240_000) break;
      const [{ data: b }, { data: ex }, { data: rg }] = await Promise.all([
        supabaseAdmin.from("client_briefings").select("resumo_estrategico, produtos, produtos_destaque_atual").eq("client_id", c.id).eq("is_current", true).maybeSingle(),
        supabaseAdmin.from("client_products").select("nome").eq("client_id", c.id),
        supabaseAdmin.from("cs_client_rules").select("texto").eq("client_id", c.id).eq("ativo", true).limit(60),
      ]);
      const texto = montarTexto({ resumo: b?.resumo_estrategico as string, destaques: b?.produtos_destaque_atual as string[], produtosBriefing: b?.produtos as string[], fixo: c.fixed_briefing as string, campanha: c.campaign_briefing as string, regras: (rg ?? []).map((r) => r.texto as string).filter((t) => /r\$|produto|linha|marca|kit|servi[cç]o|promo/i.test(t)) });
      if (texto.length < 80) continue; // nada para ler
      feitos++;
      const nome = (c.nome_fantasia as string) || (c.name as string);
      const r = await extrairProdutos({ cliente: nome, nicho: c.nicho as string, texto, existentes: (ex ?? []).map((e) => e.nome as string) });
      if (!r.ok) { resultados.push({ cliente: nome, novos: 0, erro: r.erro }); console.error("[produtos-do-briefing]", nome, r.erro); continue; }
      if (r.produtos.length) {
        const { error } = await supabaseAdmin.from("client_products").insert(r.produtos.map((p) => ({ client_id: c.id, nome: p.nome, categoria: p.categoria, marca: p.marca, preco: p.preco, descricao: p.descricao, origem: "briefing_ia", created_by: "ia" })));
        if (error) { resultados.push({ cliente: nome, novos: 0, erro: error.message }); continue; }
      }
      resultados.push({ cliente: nome, novos: r.produtos.length });
    }
    const total = resultados.reduce((s, r) => s + r.novos, 0);
    anotar(`produtos do briefing: ${total} novos em ${resultados.filter((r) => r.novos).length} clientes, ${resultados.filter((r) => r.erro).length} erros`);
    return NextResponse.json({ ok: !resultados.some((r) => r.erro), lidos: feitos, novos: total, segundos: Math.round((Date.now() - inicio) / 1000), porCliente: resultados });
  });
}
