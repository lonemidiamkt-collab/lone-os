export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { coletarMateriaPrima, enriquecerBriefing } from "@/lib/cs/enriquecer-briefing";

// POST /api/system/cs-briefing-inicial — cria o briefing de quem nunca teve.
//
// O QUE A AUDITORIA MOSTROU (02/09): de 50 clientes ativos, só 19 tinham briefing, e a última versão
// era de 20/07. Enquanto isso, 29 dos que NÃO tinham já acumulavam conversa capturada no grupo. O
// material estava lá; ninguém tinha transformado em briefing.
//
// A causa não era falta de ferramenta: `/api/cs/enriquecer-briefing` gera o rascunho desde sempre,
// mas é suggest-only — devolve pra tela e espera alguém clicar em salvar. É o mesmo destino do
// briefing do designer, que era um botão usado em 46 de 510 cards. Ferramenta que depende de
// lembrar não é usada.
//
// SEM BRIEFING, O AGENTE TRABALHA NO ESCURO: legenda, roteiro e pauta saem no genérico do ramo,
// porque produtos, público, tom de voz e o que não pode ser dito moram aqui. Um briefing montado do
// material real do cliente é melhor que nenhum — e vem marcado como gerado por IA, com os campos que
// faltaram listados, para o social completar em vez de começar do zero.
//
// ?dry=1 mostra o que faria · ?clientId= um só · ?limite=N teto por execução

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soCliente = req.nextUrl.searchParams.get("clientId") || "";
  const limite = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("limite")) || 6));

  let q = supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, whatsapp_group_jid")
    .or("active.is.null,active.eq.true").is("draft_status", null);
  if (soCliente) q = q.eq("id", soCliente);
  const { data: clientes, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Quem JÁ tem briefing não entra: este job cria o primeiro, não reescreve o que o time revisou.
  const { data: comBriefing } = await supabaseAdmin
    .from("client_briefings").select("client_id").eq("is_current", true);
  const jaTem = new Set((comBriefing ?? []).map((b) => b.client_id as string));

  const candidatos = (clientes ?? []).filter((c) => !jaTem.has(c.id as string));
  const feitos: Record<string, unknown>[] = [];
  const pulados: string[] = [];
  const erros: string[] = [];

  for (const c of candidatos.slice(0, limite)) {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    try {
      const mp = await coletarMateriaPrima(c.id as string);
      if (!mp) { pulados.push(`${nome}: sem material`); continue; }

      const r = await enriquecerBriefing(mp);
      if (!r.ok || !r.data) { erros.push(`${nome}: ${r.error ?? "IA sem retorno"}`); continue; }
      const b = r.data;

      // Briefing que a IA não conseguiu preencher não vira briefing: um documento vazio ocupando o
      // lugar do "não temos" é pior que a ausência, porque some da lista de pendências.
      const temSubstancia =
        (b.resumo_estrategico?.trim().length ?? 0) > 40 &&
        ((b.produtos?.length ?? 0) > 0 || (b.publico_alvo?.length ?? 0) > 0);
      if (!temSubstancia) { pulados.push(`${nome}: material insuficiente pra um briefing útil`); continue; }

      feitos.push({
        cliente: nome,
        produtos: b.produtos?.length ?? 0,
        publico: b.publico_alvo?.length ?? 0,
        faltando: b.campos_faltando ?? [],
      });

      if (!dry) {
        await supabaseAdmin.from("client_briefings").insert({
          client_id: c.id, version: 1, is_current: true,
          resumo_estrategico: b.resumo_estrategico, posicionamento: b.posicionamento,
          publico_alvo: b.publico_alvo, produtos: b.produtos,
          produtos_destaque_atual: b.produtos_destaque_atual,
          dores: b.dores, desejos: b.desejos, objecoes: b.objecoes,
          crenca_atual: b.crenca_atual, crenca_desejada: b.crenca_desejada,
          diferenciais: b.diferenciais, angulos_concorrencia: b.angulos_concorrencia,
          maturidade_marca: b.maturidade_marca, mix_pilares: b.mix_pilares,
          ganchos: b.ganchos, ctas: b.ctas, tom_voz: b.tom_voz, pessoa_verbal: b.pessoa_verbal,
          palavras_proibidas: b.palavras_proibidas,
          concorrentes_evitar_mencionar: b.concorrentes_evitar_mencionar,
          hashtags_padrao: b.hashtags_padrao, contato: b.contato,
          // Deixa explícito de onde veio e o que falta — quem abrir sabe que é ponto de partida,
          // não conclusão, e já vê o que precisa perguntar ao cliente.
          observacoes_estrategicas: [
            b.observacoes_estrategicas,
            "",
            "— Montado pela IA a partir das conversas do grupo e do histórico de conteúdo. Revise com o cliente.",
            b.campos_faltando?.length ? `Falta confirmar: ${b.campos_faltando.join(", ")}.` : "",
          ].filter(Boolean).join("\n"),
        });
      }
    } catch (e) {
      erros.push(`${nome}: ${String(e).slice(0, 90)}`);
    }
  }

  return NextResponse.json({
    ok: erros.length === 0, dry,
    ativos: clientes?.length ?? 0,
    sem_briefing: candidatos.length,
    criados: feitos.length,
    restam: Math.max(0, candidatos.length - feitos.length - pulados.length),
    detalhe: feitos, pulados: pulados.slice(0, 10), erros: erros.slice(0, 5),
  });
}
