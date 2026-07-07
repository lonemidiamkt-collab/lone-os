"use client";

// components/fichaviva/FichaVivaClient.tsx — experiência do CLIENTE no link da Ficha Viva.
// Fluxo: (1) portão de PIN (1ª palavra do nome da loja) → (2) duas seções numeradas:
//   01 · Meu Crescimento — vê a evolução dele E lança o faturamento/vendas do mês
//   02 · Raio-X Comercial — responde o diagnóstico de 10 perguntas
// Tudo revalida o PIN no servidor. Navy, tokens do design system.

import { useState } from "react";
import {
  Lock, Loader2, TrendingUp, TrendingDown, Minus, Check, Send, MessageCircle, Sparkles, LineChart as LineIcon,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";
import type { GrowthSummary } from "@/lib/fichaViva/growth";

interface SeriePonto { month: string; revenue: number; vendas: number | null; ticket: number | null }
interface AccessData {
  scope: "full" | "raiox";        // raiox = link do vendedor (sem financeiro)
  clientName: string;
  whatsappPhone: string;
  welcomeMessage: string | null;
  growth?: GrowthSummary;
  series?: SeriePonto[];
  alreadyAnswered: boolean;
}
type Sub = "crescimento" | "raiox";
type Period = "mes" | "tri" | "sem";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]}/${y.slice(2)}`; };

/** Agrega a série por Mês / Trimestre (calendário) / Semestre — ticket = ΣfatΣvendas. */
function aggregate(series: SeriePonto[], period: Period): { label: string; fat: number; ticket: number | null }[] {
  const data = series.filter((r) => r.revenue > 0);
  if (period === "mes") return data.map((r) => ({ label: mLabel(r.month), fat: r.revenue, ticket: r.vendas ? r.revenue / r.vendas : null }));
  if (period === "sem") {
    const fat = data.reduce((s, r) => s + r.revenue, 0);
    const ven = data.reduce((s, r) => s + (r.vendas || 0), 0);
    return data.length ? [{ label: "Semestre", fat, ticket: ven ? fat / ven : null }] : [];
  }
  const map = new Map<string, SeriePonto[]>();
  data.forEach((r) => { const [y, m] = r.month.split("-").map(Number); const k = `${y}-Q${Math.ceil(m / 3)}`; (map.get(k) ?? map.set(k, []).get(k)!).push(r); });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, chunk]) => {
    const fat = chunk.reduce((s, r) => s + r.revenue, 0);
    const ven = chunk.reduce((s, r) => s + (r.vendas || 0), 0);
    const first = MESES[+chunk[0].month.split("-")[1] - 1], last = MESES[+chunk[chunk.length - 1].month.split("-")[1] - 1];
    return { label: first === last ? first : `${first}–${last}`, fat, ticket: ven ? fat / ven : null };
  });
}
const fmtBRL = (v: number) => "R$ " + (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const TT = {
  contentStyle: { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "var(--muted-foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--foreground)", fontWeight: 600 },
} as const;

export default function FichaVivaClient({ token }: { token: string }) {
  const [code, setCode] = useState("");
  const [data, setData] = useState<AccessData | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [gateError, setGateError] = useState("");
  const [sub, setSub] = useState<Sub>("crescimento");

  async function unlock(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim()) return;
    setUnlocking(true); setGateError("");
    try {
      const res = await fetch(`/api/ficha/${token}/access`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Não foi possível entrar.");
      setData(j as AccessData);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally { setUnlocking(false); }
  }

  async function refresh() {
    try {
      const res = await fetch(`/api/ficha/${token}/access`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      if (res.ok) setData(await res.json());
    } catch { /* silencioso */ }
  }

  // ── Portão de PIN ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <form onSubmit={unlock} className="w-full max-w-sm text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Lock size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-lone-eyebrow text-primary">Lone Mídia</p>
            <h1 className="text-lone-h2 font-semibold mt-1">Acesso ao seu painel</h1>
            <p className="text-sm text-muted-foreground mt-1">Digite o código de acesso que a Lone enviou pra você.</p>
          </div>
          <input
            value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off"
            placeholder="Código de acesso"
            className="w-full text-center bg-card border border-border rounded-xl px-4 py-3 text-base text-foreground outline-none focus:border-primary/60"
          />
          {gateError && <p className="text-xs text-destructive">{gateError}</p>}
          <button type="submit" disabled={unlocking || !code.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />} Entrar
          </button>
          <a href={`https://wa.me/5522981530700`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            <MessageCircle size={12} /> Não sabe seu código? Fale com a Lone
          </a>
        </form>
      </div>
    );
  }

  // ── Painel do cliente ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <p className="text-lone-eyebrow text-primary">Lone Mídia</p>
          <h1 className="text-lone-h1 font-semibold">Olá, {data.clientName} 👋</h1>
          <p className="text-lone-body text-muted-foreground">
            {data.welcomeMessage || (data.scope === "raiox"
              ? "Responda o raio-x comercial rapidinho — leva uns 3 minutos."
              : "Acompanhe seu crescimento e nos ajude com um raio-x rápido do seu comercial.")}
          </p>
        </header>

        {/* Botões numerados — só o link do DONO mostra o crescimento */}
        {data.scope === "full" && (
          <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
            {([["crescimento", "01", "Meu Crescimento", <LineIcon key="i" size={13} />],
               ["raiox", "02", "Raio-X Comercial", <Sparkles key="i" size={13} />]] as [Sub, string, string, React.ReactNode][]).map(([id, num, label, icon]) => (
              <button key={id} onClick={() => setSub(id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${sub === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <span className={`text-[10px] font-bold ${sub === id ? "opacity-70" : "opacity-50"}`}>{num}</span>{icon}{label}
              </button>
            ))}
          </div>
        )}

        {data.scope === "full" && sub === "crescimento" && data.growth && data.series
          ? <Crescimento token={token} code={code} growth={data.growth} series={data.series} onSaved={refresh} />
          : <RaioX token={token} code={code} alreadyAnswered={data.alreadyAnswered} whatsappPhone={data.whatsappPhone} />}

        <footer className="pt-2 text-center">
          <a href={`https://wa.me/${data.whatsappPhone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            <MessageCircle size={12} /> Falar com a equipe da Lone
          </a>
        </footer>
      </div>
    </div>
  );
}

// ── 01 · Meu Crescimento ──────────────────────────────────────────────────
function Crescimento({ token, code, growth, series, onSaved }: { token: string; code: string; growth: GrowthSummary; series: SeriePonto[]; onSaved: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [fat, setFat] = useState("");
  const [vendas, setVendas] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const [period, setPeriod] = useState<Period>("mes");
  const agg = aggregate(series, period);
  const monthly = series.filter((r) => r.revenue > 0);

  async function save() {
    if (!fat.trim()) { setErr("Informe o faturamento do mês."); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/ficha/${token}/growth`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, month, revenue: Number(fat), vendas: vendas ? Number(vendas) : null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Não foi possível salvar.");
      setSaved(true); setFat(""); setVendas("");
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" />
          <h2 className="text-lone-h2 font-semibold">Seu crescimento com a Lone</h2>
        </div>
        {growth.mesesRegistrados === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não temos meses lançados. Comece registrando seu faturamento abaixo.</p>
        ) : (
          <>
            <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
              growth.level === "up" ? "bg-lone-success-bg border-lone-success-border" :
              growth.level === "down" ? "bg-lone-warning-bg border-lone-warning-border" : "bg-muted/30 border-border"}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${growth.level === "up" ? "bg-lone-success-bg" : growth.level === "down" ? "bg-lone-warning-bg" : "bg-muted"}`}>
                {growth.level === "up" ? <TrendingUp size={18} className="text-lone-success" /> : growth.level === "down" ? <TrendingDown size={18} className="text-lone-warning" /> : <Minus size={18} className="text-muted-foreground" />}
              </div>
              <div>
                <p className={`text-sm font-bold ${growth.level === "up" ? "text-lone-success" : growth.level === "down" ? "text-lone-warning" : "text-foreground"}`}>
                  {growth.label}{growth.pct !== null ? ` · ${growth.pct >= 0 ? "+" : ""}${growth.pct}%` : ""}
                </p>
                <p className="text-xs text-muted-foreground">{growth.reading}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Mini label="Faturamento total" value={fmtBRL(growth.totalFaturamento)} />
              <Mini label="Último mês" value={growth.last ? fmtBRL(growth.last.faturamento) : "—"} />
              <Mini label="Ticket médio" value={growth.last?.ticket ? fmtBRL(growth.last.ticket) : "—"} />
            </div>
            {/* Seletor de período */}
            <div className="flex items-center gap-2">
              <span className="text-lone-caption text-muted-foreground mr-1">Ver por</span>
              <div className="flex bg-card border border-border rounded-lg p-0.5">
                {([["mes", "Mês"], ["tri", "Trimestre"], ["sem", "Semestre"]] as [Period, string][]).map(([p, l]) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
                ))}
              </div>
            </div>

            {agg.length >= 1 && (
              <div>
                <p className="text-lone-caption text-muted-foreground mb-1">Faturamento</p>
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={agg} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                      <Tooltip {...TT} formatter={(v) => [fmtBRL(Number(v)), "Faturamento"]} />
                      <Line type="monotone" dataKey="fat" stroke="var(--lone-success)" strokeWidth={2.5} dot={{ fill: "var(--lone-success)", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {agg.filter((a) => a.ticket).length >= 2 && (
              <div>
                <p className="text-lone-caption text-muted-foreground mb-1">Ticket médio</p>
                <div className="h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={agg} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtBRL(Number(v))} width={54} />
                      <Tooltip {...TT} formatter={(v) => [fmtBRL(Number(v)), "Ticket"]} />
                      <Line type="monotone" dataKey="ticket" stroke="var(--primary)" strokeWidth={2.5} dot={{ fill: "var(--primary)", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tabela mês a mês */}
            <div className="overflow-x-auto pt-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-lone-eyebrow text-muted-foreground">
                    <th className="text-left font-medium py-2 pr-3">Mês</th>
                    <th className="text-right font-medium py-2 px-3">Faturamento</th>
                    <th className="text-right font-medium py-2 pl-3">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((r) => (
                    <tr key={r.month} className="border-t border-border/50">
                      <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{mLabel(r.month)}</td>
                      <td className="py-1.5 px-3 text-right font-medium">{fmtBRL(r.revenue)}</td>
                      <td className="py-1.5 pl-3 text-right text-primary">{r.vendas ? fmtBRL(r.revenue / r.vendas) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Lançar faturamento */}
      <section className="card space-y-3">
        <h2 className="text-lone-h2 font-semibold">Lançar meu faturamento</h2>
        <p className="text-lone-caption text-muted-foreground">Informe o mês que você quer registrar. O ticket médio a Lone calcula.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mês</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Faturamento (R$)</label>
            <input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="0"
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Vendas (nº)</label>
            <input type="number" inputMode="numeric" value={vendas} onChange={(e) => setVendas(e.target.value)} placeholder="0"
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
          </div>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Send size={14} />}
          {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar faturamento"}
        </button>
      </section>
    </div>
  );
}

// ── 02 · Raio-X Comercial ─────────────────────────────────────────────────
function RaioX({ token, code, alreadyAnswered, whatsappPhone }: { token: string; code: string; alreadyAnswered: boolean; whatsappPhone: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (Object.values(answers).every((v) => !v.trim())) { setErr("Responda pelo menos uma pergunta."); return; }
    setSending(true); setErr("");
    try {
      const res = await fetch(`/api/ficha/${token}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, respostas: answers }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Não foi possível enviar.");
      setSent(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Não foi possível enviar."); }
    finally { setSending(false); }
  }

  if (sent) return (
    <div className="card border-lone-success-border bg-lone-success-bg flex items-start gap-3">
      <Check size={18} className="text-lone-success shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-lone-success">Recebemos, obrigado!</p>
        <p className="text-xs text-muted-foreground mt-0.5">Nosso time comercial vai analisar e falar com você. Qualquer coisa, chame no <a href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noreferrer" className="text-primary underline">WhatsApp</a>.</p>
      </div>
    </div>
  );

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-primary" />
        <h2 className="text-lone-h2 font-semibold">Raio-X do seu comercial</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Responda o que der — quanto mais completo, melhor a gente te ajuda a vender mais.
        {alreadyAnswered && " Você já enviou antes; pode atualizar quando quiser."}
      </p>
      <div className="space-y-4">
        {DIAG_QUESTIONS.map((q, i) => (
          <div key={q.id} className="space-y-1.5">
            <label className="text-sm font-medium block"><span className="text-primary mr-1.5">{i + 1}.</span>{q.label}</label>
            <textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
              rows={2} placeholder={q.placeholder} maxLength={1500}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
          </div>
        ))}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button onClick={submit} disabled={sending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />} {sending ? "Enviando…" : "Enviar diagnóstico"}
      </button>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
