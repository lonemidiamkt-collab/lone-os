export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import * as db from "@/lib/supabase/queries";
import { supabaseAdmin } from "@/lib/supabase/server";
import { carregarExtras, EXTRAS_VAZIOS } from "@/lib/crm/extras";
import { normalizarQualificacao, notaDoLead } from "@/lib/crm/nota";
import { carregarConfig } from "@/lib/prospeccao/config";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { DIAS_REATIVACAO_SEM_VERBA, ROTULO_ETAPA, motivoValido, normalizarEtapa } from "@/lib/crm/etapas";
import { hojeSP } from "@/lib/crm/meta";
import { cancelarReunioesDoLead, reunioesFuturasDoLead } from "@/lib/crm/reunioes-server";
import { textoExcluirComReuniao } from "@/lib/crm/reunioes";
import { lerHistoricoDeEtapas, registrarEtapa } from "@/lib/crm/etapas-historico";
import { normalizarCidade } from "@/lib/crm/cidade";

// CRM comercial — CRUD dos leads.
// ESCOPO: só quem entra no comercial (lib/crm/acesso.ts → admin). O comercial guarda a mensalidade
// negociada e alimenta a meta de MRR novo: dinheiro da agência. Esconder o item no menu não é
// proteção — a rota confere o papel a cada request.
//   GET                       → lista os leads
//   POST   { ...campos }      → cria um lead (contatoNome obrigatório)
//   PATCH  { id, ...campos }  → atualiza (ex.: mover de etapa, marcar reunião)
//   DELETE ?id=…              → apaga (com reunião futura: 409 pedindo confirmação; com
//                               &cancelarReunioes=1, cancela no Google antes e só então apaga)

const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Campos do corpo que o cliente pode mandar, já saneados. Etapa sempre normalizada. */
function sanear(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if ("estagio" in out) out.estagio = normalizarEtapa(out.estagio);
  if ("probabilidade" in out) {
    const p = out.probabilidade === "" || out.probabilidade == null ? null : Number(out.probabilidade);
    // Aceita 0–1 e também 0–100 (o campo da tela é em %).
    out.probabilidade = p == null || !Number.isFinite(p) ? null : p > 1 ? Math.min(100, p) / 100 : Math.max(0, p);
  }
  for (const k of ["valorOrcamento", "valorImplantacao"]) {
    if (k in out) {
      const v = out[k] === "" || out[k] == null ? null : Number(out[k]);
      out[k] = v == null || !Number.isFinite(v) || v < 0 ? null : v;
    }
  }
  if ("motivoPerdaCodigo" in out && out.motivoPerdaCodigo != null && !motivoValido(out.motivoPerdaCodigo)) out.motivoPerdaCodigo = null;
  if ("cidade" in out) out.cidade = normalizarCidade(out.cidade as string | null);
  if ("temperatura" in out && !["quente", "morno", "frio", null, ""].includes(out.temperatura as string)) out.temperatura = null;
  for (const k of ["retomarEm", "previsaoFechamento", "proximoContato", "reuniaoData"]) {
    if (k in out && out[k] != null && out[k] !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(out[k]))) out[k] = null;
  }
  // Campos que só o servidor carimba.
  delete out.etapaDesde; delete out.primeiroContatoEm; delete out.externoId; delete out.fechadoEm; delete out.origemEtapa;
  return out;
}

/** Sem a migration 20261017100000, as colunas novas não existem: tira elas e salva o resto. */
async function comFallbackDeColunas<T>(fn: (patch: Record<string, unknown>) => Promise<T>, patch: Record<string, unknown>): Promise<{ r: T; aviso: string | null }> {
  try {
    return { r: await fn(patch), aviso: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/column|schema cache/i.test(msg)) throw e;
    const COLS_CAMEL = ["valorImplantacao", "probabilidade", "retomarEm", "previsaoFechamento", "motivoPerdaCodigo", "segmento", "cidade",
      "endereco", "instagram", "rotaLojaId", "temperatura", "etapaDesde", "primeiroContatoEm", "externoId"];
    const enxuto = Object.fromEntries(Object.entries(patch).filter(([k]) => !COLS_CAMEL.includes(k)));
    return { r: await fn(enxuto), aviso: "Parte dos campos novos não foi salva: falta aplicar a atualização do banco do comercial." };
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const leads = await db.fetchCrmLeads();
  // Leva 7C (N27/N28): nota A/B/C, toques da cadência e se já virou cliente — e os segmentos do ICP
  // para a qualificação (os mesmos da prospecção).
  const [extras, cfg, hist] = await Promise.all([carregarExtras(leads.map((l) => l.id)), carregarConfig(), lerHistoricoDeEtapas()]);
  return NextResponse.json({
    leads: leads.map((l) => ({ ...l, ...(extras.get(l.id) ?? EXTRAS_VAZIOS) })),
    segmentosIcp: cfg.segmentos.map((x) => x.nome),
    // Histórico de etapa (lib/crm/taxas.ts): sem ele a taxa de fechamento fica indisponível — nunca "0".
    historico: hist.ok ? hist.itens : null,
    historicoErro: hist.ok ? null : hist.erro,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  if (!body?.contatoNome?.trim()) return NextResponse.json({ error: "Nome do contato é obrigatório" }, { status: 400 });
  try {
    const patch = sanear(body);
    patch.estagio = normalizarEtapa(patch.estagio);
    patch.etapaDesde = new Date().toISOString();
    if (patch.estagio === "ganho" || patch.estagio === "perdido") patch.fechadoEm = hojeSP();
    const { r: lead, aviso } = await comFallbackDeColunas((p) => db.insertCrmLead(p), patch);
    await registrarEtapa({ leadId: lead.id, de: null, para: String(patch.estagio), autor: gate.user.email, origem: "criacao" });
    return NextResponse.json({ lead, aviso });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  const { id, ...bruto } = body ?? {};
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    const patch = sanear(bruto as Record<string, unknown>);
    // Transições automáticas (no servidor, pra valer também no arrastar do Kanban):
    // → ganho/perdido: carimba fechado_em (data REAL da venda — base do relatório e da meta do mês);
    // → volta pra etapa aberta: limpa fechado_em (e o motivo de perda, se saiu de perdido);
    // → proposta: marca proposta_enviada_em (1ª vez);
    // → qualquer mudança: etapa_desde = agora (dia zero da cadência da etapa).
    let etapaMudou: string | null = null;
    let etapaAnterior: string | null = null;
    const hoje = hojeSP();
    if (typeof patch.estagio === "string") {
      const atual = await db.fetchCrmLeadById(id);
      const fechado = patch.estagio === "ganho" || patch.estagio === "perdido";
      if (fechado && atual?.estagio !== patch.estagio) patch.fechadoEm = hoje;
      if (!fechado) {
        patch.fechadoEm = null;
        if (atual?.estagio === "perdido" && patch.motivoPerda === undefined) { patch.motivoPerda = null; patch.motivoPerdaCodigo = null; }
        // Saiu de Ganho/Perdido com chance de 100%/0% (a chance do fechamento, não uma estimativa): volta para
        // o padrão da etapa. Achado de 17/10/2026: dois negócios devolvidos para Negociação ficaram com 100%
        // e inflavam o ponderado.
        const chanceDeFechado = atual?.probabilidade === 1 || atual?.probabilidade === 0;
        if ((atual?.estagio === "ganho" || atual?.estagio === "perdido") && chanceDeFechado && patch.probabilidade === undefined) patch.probabilidade = null;
      }
      if (patch.estagio === "proposta" && !atual?.propostaEnviadaEm && patch.propostaEnviadaEm === undefined) {
        patch.propostaEnviadaEm = hoje;
      }
      if (atual && atual.estagio !== patch.estagio) { etapaMudou = patch.estagio; etapaAnterior = atual.estagio; patch.etapaDesde = new Date().toISOString(); }
    }
    // "Sem verba agora" volta sozinho: marca a retomada em 90 dias se ninguém marcou outra.
    if (patch.motivoPerdaCodigo === "sem_verba" && patch.retomarEm === undefined) patch.retomarEm = somaDias(hoje, DIAS_REATIVACAO_SEM_VERBA);

    // Qualificação → nota pela régua da prospecção (lib/crm/nota.ts). Colunas da migration
    // 20260926100000: sem ela, o resto do lead salva e a nota volta com aviso.
    const { qualificacao, cadenciaInicio, ...resto } = patch as Record<string, unknown>;
    let avisoNota: string | null = null;
    if (qualificacao !== undefined || cadenciaInicio !== undefined) {
      const extra: Record<string, unknown> = {};
      if (qualificacao !== undefined) {
        const q = normalizarQualificacao(qualificacao);
        const n = notaDoLead(q, await carregarConfig());
        Object.assign(extra, { qualificacao: q, nota: n.nota, nota_score: n.score, nota_detalhe: n.detalhe });
      }
      if (cadenciaInicio !== undefined) extra.cadencia_inicio = typeof cadenciaInicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cadenciaInicio) ? cadenciaInicio : null;
      const { error } = await supabaseAdmin.from("crm_leads").update(extra).eq("id", id);
      if (error) avisoNota = /column|schema cache/i.test(error.message) ? "A nota não foi salva: falta aplicar a migration 20260926100000." : error.message;
    }
    const { r: lead, aviso } = await comFallbackDeColunas((p) => db.updateCrmLead(id, p), resto);
    // Auto-registra a mudança de etapa na timeline (best-effort — não derruba o update).
    if (etapaMudou) {
      await registrarEtapa({ leadId: id, de: etapaAnterior, para: etapaMudou, autor: gate.user.email, origem: bruto.origemEtapa === "lote" ? "lote" : "tela" });
      const rotulo = ROTULO_ETAPA[normalizarEtapa(etapaMudou)];
      db.insertLeadActivity({ leadId: id, tipo: "etapa", texto: `Movido para ${rotulo}`, autor: (resto.responsavel as string) ?? lead.responsavel ?? null }).catch(() => {});
    }
    const extras = (await carregarExtras([lead.id])).get(lead.id) ?? EXTRAS_VAZIOS;
    return NextResponse.json({ lead: { ...lead, ...extras }, avisoNota, aviso });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    // LEAD COM REUNIÃO MARCADA (21/10/2026). Excluir apaga as reuniões em cascata e o evento do Google
    // ficava de pé: o lead seguia com o convite e o Meet. Agora a reunião futura é cancelada ANTES
    // (Google primeiro, mesmo caminho do botão Cancelar) e, se o Google não confirmar, o lead não é
    // excluído. Sem `cancelarReunioes=1` (a tela não sabia da reunião — outra aba, aba antiga, ou
    // marcada para além do que a tela carregou) devolve 409 com o texto da confirmação, e a tela pergunta.
    const futuras = await reunioesFuturasDoLead(id);
    if (!futuras.ok) return NextResponse.json({ error: `${futuras.erro} O lead não foi excluído.` }, { status: 500 });
    let canceladas = 0;
    if (futuras.reunioes.length) {
      if (req.nextUrl.searchParams.get("cancelarReunioes") !== "1") {
        return NextResponse.json({ error: textoExcluirComReuniao(futuras.reunioes) }, { status: 409 });
      }
      const autor = req.nextUrl.searchParams.get("autor")?.slice(0, 80) || null;
      const c = await cancelarReunioesDoLead(id, autor);
      if (!c.ok) {
        const ja = c.canceladas.length ? ` ${c.canceladas.length === 1 ? "Uma reunião já foi cancelada" : `${c.canceladas.length} reuniões já foram canceladas`}.` : "";
        return NextResponse.json({ error: `O lead não foi excluído: ${c.erro}${ja}` }, { status: 502 });
      }
      canceladas = c.canceladas.length;
    }
    await db.deleteCrmLead(id);
    return NextResponse.json({ ok: true, reunioesCanceladas: canceladas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
