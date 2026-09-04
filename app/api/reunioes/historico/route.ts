export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/reunioes/historico?clientId=…[&q=texto][&id=reuniaoId]
//
// Roberto (04/09): "eu vou na aba do cliente, 'reuniões cadastradas', e consigo ter esse histórico
// de reunião — até pra gente ir buscar alguma informação."
//
// Três modos, porque são três perguntas diferentes:
//   • sem `q` nem `id` → a LISTA (resumo de cada uma, sem carregar transcrição)
//   • com `q`          → BUSCA no texto das transcrições, com o trecho que casou
//   • com `id`         → uma reunião INTEIRA, transcrição e análise
//
// A lista nunca traz a transcrição: são milhares de palavras por reunião e a tela só precisa do
// resumo. Carregar tudo faria a aba do cliente demorar por informação que ninguém está olhando.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const id = req.nextUrl.searchParams.get("id");

  // ── Uma reunião inteira ─────────────────────────────────────────────────
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("meetings")
      .select("id, client_id, title, start_at, end_at, responsavel, estado, resumo, transcricao, transcricao_origem, transcricao_em, transcricao_por, transcricao_palavras, analise, pontos_atencao, pdf_path, pauta, pauta_origem, pauta_em, pauta_por, anexos, location, description, meeting_type")
      .eq("id", id).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "reunião não encontrada" }, { status: 404 });

    // Link temporário para o PDF. Assinado e curto: transcrição de reunião com cliente não é
    // material público, e URL de bucket privado sem assinatura simplesmente não abre.
    let pdfUrl: string | null = null;
    if (data.pdf_path) {
      const { data: signed } = await supabaseAdmin.storage
        .from("meeting-records").createSignedUrl(data.pdf_path as string, 3600);
      pdfUrl = signed?.signedUrl ?? null;
    }
    // Cada anexo ganha um link assinado: o bucket é privado, e URL sem assinatura não abre.
    const anexos = await Promise.all(
      ((Array.isArray(data.anexos) ? data.anexos : []) as { path: string; nome: string; tamanho: number; tipo: string }[])
        .map(async (a) => {
          const { data: signed } = await supabaseAdmin.storage
            .from("meeting-records").createSignedUrl(a.path, 3600);
          return { ...a, url: signed?.signedUrl ?? null };
        }),
    );
    return NextResponse.json({ ok: true, reuniao: { ...data, pdfUrl, anexos } });
  }

  if (!clientId) return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });

  // ── Busca no texto ──────────────────────────────────────────────────────
  if (q) {
    // `websearch_to_tsquery` entende aspas e o "-" de exclusão como o usuário espera de uma busca,
    // e não quebra com pontuação — diferente de `to_tsquery`, que lança erro em "reunião,".
    const { data, error } = await supabaseAdmin.rpc("buscar_transcricoes", {
      p_client_id: clientId, p_termo: q, p_limite: 20,
    });
    if (error) {
      // Sem a função no banco (migration não aplicada), cai numa busca simples em vez de quebrar
      // a aba do cliente inteira.
      const { data: simples } = await supabaseAdmin
        .from("meetings")
        .select("id, start_at, responsavel, resumo, transcricao_palavras")
        .eq("client_id", clientId).not("transcricao", "is", null)
        .ilike("transcricao", `%${q}%`)
        .order("start_at", { ascending: false }).limit(20);
      return NextResponse.json({ ok: true, busca: q, reunioes: simples ?? [], modo: "simples" });
    }
    return NextResponse.json({ ok: true, busca: q, reunioes: data ?? [], modo: "texto" });
  }

  // ── A lista ─────────────────────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select("id, title, start_at, end_at, responsavel, estado, status, resumo, transcricao_palavras, pontos_atencao, pdf_path, analise, meeting_type, location, description, pauta, pauta_origem, anexos")
    .eq("client_id", clientId)
    .order("start_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reunioes = (data ?? []).map((m) => {
    const a = (m.analise ?? {}) as { clima?: string; decisoes?: unknown[]; proximas_acoes?: unknown[]; pendencias_cliente?: unknown[]; sugestoes_briefing?: unknown[] };
    return {
      id: m.id, quando: m.start_at, fim: m.end_at, responsavel: m.responsavel,
      // Reunião marcada pelo agendador antigo nasce sem `estado`: se tem data e não foi
      // cancelada, está agendada — é o que a pessoa quis dizer ao marcar.
      estado: (m.estado as string) || (m.status === "cancelled" ? "cancelada" : "agendada"),
      tipo: m.meeting_type, resumo: m.resumo,
      titulo: m.title, local: m.location, descricao: m.description,
      pauta: m.pauta, pautaOrigem: m.pauta_origem,
      anexos: (Array.isArray(m.anexos) ? m.anexos : []) as { path: string; nome: string; tamanho: number }[],
      palavras: m.transcricao_palavras ?? 0,
      temTranscricao: (m.transcricao_palavras ?? 0) > 0,
      temPdf: !!m.pdf_path,
      pontosAtencao: m.pontos_atencao ?? [],
      clima: a.clima ?? null,
      contagens: {
        decisoes: a.decisoes?.length ?? 0,
        acoes: a.proximas_acoes?.length ?? 0,
        pendencias: a.pendencias_cliente?.length ?? 0,
        sugestoes: a.sugestoes_briefing?.length ?? 0,
      },
    };
  });

  return NextResponse.json({
    ok: true,
    total: reunioes.length,
    comTranscricao: reunioes.filter((r) => r.temTranscricao).length,
    // Os pontos de atenção de TODAS as reuniões, do mais recente: é a memória viva do cliente.
    pontosAtencao: [...new Set(reunioes.flatMap((r) => r.pontosAtencao as string[]))].slice(0, 12),
    reunioes,
  });
}
