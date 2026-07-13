// lib/reports/teamWeekly.ts — Relatório INTERNO semanal (sexta): produção do time.
// Backstage — o cliente nunca vê. Duas páginas no design system da Lone:
//   Página 1 — Produção: entregas por designer + publicações/demandas por social + não-entregas.
//   Página 2 — Tráfego (Julio): clientes trabalhados na rotina + onde a verba se moveu na semana.
//
// IMPORTANTE (honestidade dos dados): o sistema NÃO registra edição campanha-a-campanha — o Julio
// mexe direto no Gerenciador da Meta e nós apenas LEMOS/sincronizamos. Então a página de tráfego
// mostra dois sinais reais: (a) a rotina que o Julio registrou por cliente e (b) a variação de
// VERBA (spend) da semana vs a anterior — o melhor proxy de "onde ele mexeu".

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd, addDays, spDateKeyOf } from "@/lib/cs/vigilancia";

const C = { bg: "#060814", card: "#0b0e1e", card2: "#0e1226", border: "#1a1f33", primary: "#2b3cff", text: "#eef0f6", muted: "#8b91a1", faint: "#5b6172", green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

function reportBaseUrl(): string {
  return process.env.NEXT_PUBLIC_PORTAL_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "https://painel.lonemidia.com";
}
function dm(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const brl = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
const esc = (s: string) => (s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

export interface DesignerStat { nome: string; entregues: number; noPrazo: number }
export interface SocialStat { nome: string; publicados: number; demandas: number; entregues: number }
export interface NaoEntrega { cliente: string; motivo: string; por: string | null }
export interface RotinaItem { cliente: string; nota: string; tipo: string; data: string }
export interface VerbaItem { cliente: string; atual: number; anterior: number; deltaPct: number | null; sinal: "subiu" | "caiu" | "ligou" | "pausou" }

export interface TeamWeeklyData {
  periodoLabel: string;
  totalEntregues: number;
  publicados: number;
  emProducao: number;
  demandasCriadas: number;
  designers: DesignerStat[];
  socials: SocialStat[];
  naoEntregas: NaoEntrega[];
  rotina: RotinaItem[];
  verba: VerbaItem[];
}

/** Coleta os números da semana corrente (segunda 00:00 SP → agora). Nunca lança pro chamador cuidar. */
export async function buildTeamWeeklyData(): Promise<TeamWeeklyData> {
  const now = spNow();
  const offsetSeg = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const segunda = addDays(now, -offsetSeg);
  const segKey = ymd(segunda);
  const hojeKey = ymd(now);
  const periodoLabel = `${dm(segunda)} a ${dm(now)}`;
  const desde = new Date(Date.now() - 9 * 86400000).toISOString(); // filtro largo no banco; fino no fuso SP
  const naSemana = (iso?: string | null) => { const k = spDateKeyOf(iso); return k !== null && k >= segKey && k <= hojeKey; };

  // ── Cards entregues na semana → por designer (com no-prazo) + não-entregas ──
  const { data: cards } = await supabaseAdmin
    .from("content_cards")
    .select("client_name, due_date, designer_delivered_at, designer_delivered_by, social_media, social_confirmed_at, status, status_changed_at, non_delivery_reason, non_delivery_reported_at, non_delivery_reported_by")
    .is("archived_at", null)
    .or(`designer_delivered_at.gte.${desde},social_confirmed_at.gte.${desde},status_changed_at.gte.${desde},non_delivery_reported_at.gte.${desde}`);

  const desMap = new Map<string, DesignerStat>();
  const socMap = new Map<string, SocialStat>();
  const naoEntregas: NaoEntrega[] = [];
  let publicados = 0;

  const socialOf = (nome: string) => {
    const g = socMap.get(nome) ?? { nome, publicados: 0, demandas: 0, entregues: 0 };
    socMap.set(nome, g);
    return g;
  };

  for (const k of cards ?? []) {
    // Entrega do designer
    if (naSemana(k.designer_delivered_at as string) && k.designer_delivered_by) {
      const nome = (k.designer_delivered_by as string).trim();
      const g = desMap.get(nome) ?? { nome, entregues: 0, noPrazo: 0 };
      g.entregues++;
      const dKey = spDateKeyOf(k.designer_delivered_at as string);
      const due = (k.due_date as string) || null;
      if (!due || (dKey && dKey <= due)) g.noPrazo++;
      desMap.set(nome, g);
    }
    // Publicação (social confirmou OU status virou published na semana)
    const pubKey = (k.status === "published") ? (k.status_changed_at as string) : null;
    if (naSemana(k.social_confirmed_at as string) || naSemana(pubKey)) {
      publicados++;
      if (k.social_media) socialOf((k.social_media as string).trim()).publicados++;
    }
    // Não-entrega reportada
    if (naSemana(k.non_delivery_reported_at as string) && k.non_delivery_reason) {
      naoEntregas.push({
        cliente: (k.client_name as string) || "—",
        motivo: (k.non_delivery_reason as string) || "—",
        por: (k.non_delivery_reported_by as string) || null,
      });
    }
  }

  // ── Demandas criadas na semana → crédito por social (quem gerou o trabalho) ──
  const { data: drData } = await supabaseAdmin
    .from("design_requests").select("requested_by, status, created_at").gte("created_at", desde);
  let demandasCriadas = 0;
  for (const d of drData ?? []) {
    if (!naSemana(d.created_at as string)) continue;
    demandasCriadas++;
    const autor = ((d.requested_by as string) || "").trim();
    if (!autor) continue;
    const g = socialOf(autor);
    g.demandas++;
    if (d.status === "done") g.entregues++;
  }

  // ── Em produção agora (snapshot) ──
  const { count: emProducao } = await supabaseAdmin
    .from("content_cards").select("id", { count: "exact", head: true })
    .eq("status", "in_production").is("archived_at", null).is("designer_delivered_at", null);

  // ── Tráfego / Julio: rotina registrada na semana ──
  const { data: checks } = await supabaseAdmin
    .from("traffic_routine_checks").select("client_name, note, type, date, completed_by").gte("date", segKey).lte("date", hojeKey);
  const rotina: RotinaItem[] = (checks ?? [])
    .filter((c) => ((c.completed_by as string) || "").toLowerCase().includes("julio") || (c.completed_by as string))
    .map((c) => ({ cliente: (c.client_name as string) || "—", nota: (c.note as string) || "", tipo: (c.type as string) || "análise", data: (c.date as string) || "" }))
    .sort((a, b) => b.data.localeCompare(a.data));

  // ── Tráfego / Julio: onde a VERBA se moveu (semana vs anterior) ──
  const verba: VerbaItem[] = [];
  const { data: spendRows } = await supabaseAdmin.rpc("team_traffic_spend_week");
  if (Array.isArray(spendRows) && spendRows.length > 0) {
    const ids = spendRows.map((r: { client_id: string }) => r.client_id);
    const { data: cli } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", ids);
    const nomeMap = new Map<string, string>((cli ?? []).map((c) => [c.id as string, (c.nome_fantasia as string) || (c.name as string) || "—"]));
    for (const r of spendRows as Array<{ client_id: string; spend_atual: number; spend_anterior: number }>) {
      const atual = Number(r.spend_atual) || 0;
      const anterior = Number(r.spend_anterior) || 0;
      const teto = Math.max(atual, anterior);
      if (teto < 30) continue; // ignora ruído de contas paradas
      let sinal: VerbaItem["sinal"]; let deltaPct: number | null = null;
      if (anterior < 5 && atual >= 30) sinal = "ligou";
      else if (atual < 5 && anterior >= 30) sinal = "pausou";
      else {
        deltaPct = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : null;
        if (deltaPct === null || Math.abs(deltaPct) < 25) continue; // só variações relevantes
        sinal = deltaPct > 0 ? "subiu" : "caiu";
      }
      verba.push({ cliente: nomeMap.get(r.client_id) || "—", atual, anterior, deltaPct, sinal });
    }
    verba.sort((a, b) => Math.abs(b.deltaPct ?? 999) - Math.abs(a.deltaPct ?? 999));
  }

  return {
    periodoLabel,
    totalEntregues: [...desMap.values()].reduce((s, d) => s + d.entregues, 0),
    publicados, emProducao: emProducao ?? 0, demandasCriadas,
    designers: [...desMap.values()].sort((a, b) => b.entregues - a.entregues),
    socials: [...socMap.values()].sort((a, b) => (b.publicados + b.demandas) - (a.publicados + a.demandas)),
    naoEntregas, rotina, verba,
  };
}

// ── HTML branded (design system Lone) ─────────────────────────────────────────

function kpi(label: string, value: string): string {
  return `<div style="flex:1;background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:16px 18px;">
    <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">${label}</div>
    <div style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-.02em;line-height:1;">${value}</div>
  </div>`;
}
function head(logoUrl: string, titulo: string, sub: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid ${C.border};margin-bottom:22px;">
    <img src="${logoUrl}" style="width:30px;height:30px;object-fit:contain;" alt=""/>
    <div style="flex:1;">
      <div style="font-size:19px;font-weight:900;color:#fff;letter-spacing:-.01em;">${titulo}</div>
      <div style="font-size:11px;color:${C.muted};margin-top:2px;">${sub}</div>
    </div>
    <div style="font-size:10px;color:${C.faint};text-transform:uppercase;letter-spacing:.08em;">Uso interno</div>
  </div>`;
}
function sectionTitle(t: string): string {
  return `<div style="font-size:13px;font-weight:800;color:#fff;margin:24px 0 12px;letter-spacing:-.01em;">${t}</div>`;
}

export function buildTeamWeeklyHtml(d: TeamWeeklyData): string {
  const logoUrl = `${reportBaseUrl()}/logo.png`;

  const desRows = d.designers.length
    ? d.designers.map((x) => {
        const pct = x.entregues ? Math.round((x.noPrazo / x.entregues) * 100) : 0;
        const cor = pct >= 80 ? C.green : pct >= 50 ? C.amber : C.red;
        return `<tr>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};font-weight:700;color:${C.text};">${esc(x.nome)}</td>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:center;font-weight:800;color:#fff;">${x.entregues}</td>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:center;color:${cor};font-weight:700;">${x.noPrazo}/${x.entregues} · ${pct}%</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="3" style="padding:14px;color:${C.muted};text-align:center;border-top:1px solid ${C.border};">Nenhuma entrega registrada na semana.</td></tr>`;

  const socRows = d.socials.length
    ? d.socials.map((x) => `<tr>
        <td style="padding:11px 14px;border-top:1px solid ${C.border};font-weight:700;color:${C.text};">${esc(x.nome)}</td>
        <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:center;font-weight:800;color:#fff;">${x.publicados}</td>
        <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:center;color:${C.text};">${x.demandas}</td>
        <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:center;color:${C.muted};">${x.entregues}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" style="padding:14px;color:${C.muted};text-align:center;border-top:1px solid ${C.border};">Sem atividade de social na semana.</td></tr>`;

  const naoEntregasHtml = d.naoEntregas.length
    ? `${sectionTitle("⚠️ Não-entregas reportadas")}
      <div style="background:${C.card};border:1px solid ${C.red}44;border-radius:14px;padding:6px 16px;">
        ${d.naoEntregas.map((n) => `<div style="padding:9px 0;border-top:1px solid ${C.border};font-size:12px;color:${C.text};">
          <strong>${esc(n.cliente)}</strong> — ${esc(n.motivo)}${n.por ? ` <span style="color:${C.faint};">(${esc(n.por)})</span>` : ""}
        </div>`).join("").replace("border-top:1px solid " + C.border + ";", "")}
      </div>`
    : "";

  // Página 1 — Produção
  const page1 = `<div style="padding:40px 44px;">
    ${head(logoUrl, "Produção da semana", `Relatório interno do time · ${d.periodoLabel}`)}
    <div style="display:flex;gap:12px;margin-bottom:6px;">
      ${kpi("Artes entregues", String(d.totalEntregues))}
      ${kpi("Publicados", String(d.publicados))}
      ${kpi("Demandas criadas", String(d.demandasCriadas))}
      ${kpi("Em produção", String(d.emProducao))}
    </div>

    ${sectionTitle("🎨 Designers — entregas de arte")}
    <table style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;font-size:12px;">
      <thead><tr style="background:${C.card2};">
        <th style="padding:11px 14px;text-align:left;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Designer</th>
        <th style="padding:11px 14px;text-align:center;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Entregues</th>
        <th style="padding:11px 14px;text-align:center;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">No prazo</th>
      </tr></thead>
      <tbody>${desRows}</tbody>
    </table>

    ${sectionTitle("📱 Social media — publicações e demandas")}
    <table style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;font-size:12px;">
      <thead><tr style="background:${C.card2};">
        <th style="padding:11px 14px;text-align:left;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Social</th>
        <th style="padding:11px 14px;text-align:center;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Publicados</th>
        <th style="padding:11px 14px;text-align:center;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Demandas</th>
        <th style="padding:11px 14px;text-align:center;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Concluídas</th>
      </tr></thead>
      <tbody>${socRows}</tbody>
    </table>

    ${naoEntregasHtml}
  </div>`;

  // Página 2 — Tráfego (Julio)
  const rotinaHtml = d.rotina.length
    ? d.rotina.map((r) => `<div style="padding:12px 16px;border-top:1px solid ${C.border};">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
          <strong style="font-size:12px;color:${C.text};">${esc(r.cliente)}</strong>
          <span style="font-size:10px;color:${C.faint};">${esc(r.data)}</span>
        </div>
        ${r.nota ? `<div style="font-size:11.5px;color:${C.muted};margin-top:4px;line-height:1.5;">${esc(r.nota)}</div>` : ""}
      </div>`).join("")
    : `<div style="padding:14px 16px;color:${C.muted};font-size:12px;">Nenhuma rotina registrada pelo Julio nesta semana.</div>`;

  const verbaHtml = d.verba.length
    ? d.verba.map((v) => {
        const map = {
          subiu: { ico: "▲", cor: C.green, txt: `verba subiu ${v.deltaPct}%` },
          caiu: { ico: "▼", cor: C.amber, txt: `verba caiu ${Math.abs(v.deltaPct ?? 0)}%` },
          ligou: { ico: "●", cor: C.green, txt: "campanha ligada (estava parada)" },
          pausou: { ico: "○", cor: C.red, txt: "campanha pausada (estava ativa)" },
        }[v.sinal];
        return `<tr>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};font-weight:700;color:${C.text};">${esc(v.cliente)}</td>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:right;color:${C.muted};">${brl(v.anterior)}</td>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:right;font-weight:800;color:#fff;">${brl(v.atual)}</td>
          <td style="padding:11px 14px;border-top:1px solid ${C.border};text-align:left;color:${map.cor};font-weight:700;white-space:nowrap;">${map.ico} ${map.txt}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="4" style="padding:14px;color:${C.muted};text-align:center;border-top:1px solid ${C.border};">Nenhuma variação relevante de verba na semana.</td></tr>`;

  const page2 = `<div style="padding:40px 44px;break-before:page;page-break-before:always;">
    ${head(logoUrl, "Tráfego pago — Julio", `Trabalho da semana · ${d.periodoLabel}`)}

    <div style="background:${C.card2};border:1px solid ${C.border};border-radius:12px;padding:12px 16px;margin-bottom:6px;font-size:11px;color:${C.muted};line-height:1.5;">
      ℹ️ O sistema <strong style="color:${C.text};">lê e sincroniza</strong> a Meta — ele não registra cada edição feita no Gerenciador.
      Abaixo, os dois sinais reais do trabalho do Julio: a <strong style="color:${C.text};">rotina</strong> que ele registrou e a
      <strong style="color:${C.text};">variação de verba</strong> por cliente (semana vs. anterior).
    </div>

    ${sectionTitle("🗂️ Rotina do Julio — clientes trabalhados")}
    <div style="background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;">${rotinaHtml.replace(`border-top:1px solid ${C.border};`, "")}</div>

    ${sectionTitle("💸 Onde a verba se moveu")}
    <table style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;font-size:12px;">
      <thead><tr style="background:${C.card2};">
        <th style="padding:11px 14px;text-align:left;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Cliente</th>
        <th style="padding:11px 14px;text-align:right;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Sem. ant.</th>
        <th style="padding:11px 14px;text-align:right;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Esta sem.</th>
        <th style="padding:11px 14px;text-align:left;color:${C.muted};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.05em;">Movimento</th>
      </tr></thead>
      <tbody>${verbaHtml}</tbody>
    </table>
  </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:${C.bg}; color:${C.text}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    @page { size:A4; margin:0; }
  </style></head><body>${page1}${page2}</body></html>`;
}
