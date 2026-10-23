"use client";

// components/fichaviva/FichaVivaClient.tsx — experiência do CLIENTE no link da Ficha Viva.
// Fluxo: (1) portão de PIN (1ª palavra do nome da loja) → (2) duas seções numeradas:
//   01 · Meu Crescimento — vê a evolução dele E lança o faturamento/vendas do mês
//   02 · Raio-X Comercial — responde o diagnóstico de 10 perguntas
// Tudo revalida o PIN no servidor. Navy, tokens do design system.

import { useState, useEffect, useRef } from "react";
import {
  Lock, Loader2, TrendingUp, TrendingDown, Minus, Check, Send, MessageCircle, Sparkles, LineChart as LineIcon, Pencil,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";
import type { GrowthSummary } from "@/lib/fichaViva/growth";
import {
  escolherInicio, lerRascunho, salvarRascunho, apagarRascunho, normalizarRespostas, MAX_RESPOSTA,
  type Respostas, type OrigemRespostas, type Armazenamento,
} from "@/lib/fichaViva/raiox";
import { chamar } from "@/lib/api/chamar";
import { linkWhatsapp } from "@/lib/portal/contato";
import { mesesPermitidosCliente, inicioJanelaMeses } from "@/lib/portal/mesesCliente";

interface SeriePonto { month: string; revenue: number; vendas: number | null; ticket: number | null }
interface AccessData {
  scope: "full" | "raiox";        // raiox = link do vendedor (sem financeiro)
  clientName: string;
  whatsappPhone: string;
  welcomeMessage: string | null;
  growth?: GrowthSummary;
  series?: SeriePonto[];
  alreadyAnswered: boolean;
  /** Quando foi o último envio do Raio-X (null = nunca). */
  respondidoEm?: string | null;
  /** Última resposta enviada — só no link do dono (com PIN). */
  ultimasRespostas?: Respostas | null;
}
type ResultadoEnvio = "inserir" | "atualizar" | "igual";

/** localStorage pode lançar só de ser lido (aba anônima, bloqueio de site): aí fica sem rascunho. */
function armazenamento(): Armazenamento | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
const dataBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
type Sub = "crescimento" | "raiox";
type Period = "mes" | "tri" | "sem";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]}/${y.slice(2)}`; };

/** Agrega a série por Mês / Trimestre (calendário) / Semestre — ticket = ΣfatΣvendas. */
function aggregate(series: SeriePonto[], period: Period, agora: Date = new Date()): { label: string; fat: number; ticket: number | null }[] {
  const data = series.filter((r) => r.revenue > 0);
  if (period === "mes") return data.map((r) => ({ label: mLabel(r.month), fat: r.revenue, ticket: r.vendas ? r.revenue / r.vendas : null }));
  if (period === "sem") {
    // Semestre = os últimos 6 meses; antes somava o histórico inteiro sob o nome "Semestre".
    const desde = inicioJanelaMeses(6, agora);
    const janela = data.filter((r) => r.month >= desde);
    const fat = janela.reduce((s, r) => s + r.revenue, 0);
    const ven = janela.reduce((s, r) => s + (r.vendas || 0), 0);
    return janela.length ? [{ label: "Últimos 6 meses", fat, ticket: ven ? fat / ven : null }] : [];
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

export default function FichaVivaClient({ token, scope }: { token: string; scope: "full" | "raiox" }) {
  const [code, setCode] = useState("");
  const [data, setData] = useState<AccessData | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [gateError, setGateError] = useState("");
  const [sub, setSub] = useState<Sub>("crescimento");

  // ── Raio-X: o estado mora AQUI, não na aba ───────────────────────────────────────────────────
  // 21/10/2026 (auditoria 1.3): trocar para "Meu Crescimento" desmontava a aba e as respostas
  // sumiam; recarregar também. Agora: estado no pai + rascunho no aparelho + o link do dono abre com a
  // última resposta enviada.
  const [respostas, setRespostas] = useState<Respostas>({});
  const [origem, setOrigem] = useState<OrigemRespostas>("vazio");
  const [enviado, setEnviado] = useState<ResultadoEnvio | null>(null);
  const [rascunhoOk, setRascunhoOk] = useState<boolean | null>(null);
  const iniciouRaiox = useRef(false);
  const digitou = useRef(false);

  // Abre o formulário UMA vez, quando os dados chegam (o refresh do crescimento não pode reabrir por cima).
  useEffect(() => {
    if (!data || iniciouRaiox.current) return;
    iniciouRaiox.current = true;
    const ini = escolherInicio({ rascunho: lerRascunho(armazenamento(), token), enviadas: data.ultimasRespostas, enviadasEm: data.respondidoEm });
    setRespostas(ini.respostas);
    setOrigem(ini.origem);
  }, [data, token]);

  // Cada mudança vai para o rascunho do aparelho (só depois que a pessoa digitou algo).
  useEffect(() => {
    if (!digitou.current) return;
    setRascunhoOk(salvarRascunho(armazenamento(), token, respostas));
  }, [respostas, token]);

  const mudarResposta = (id: string, valor: string) => {
    digitou.current = true;
    setRespostas((p) => ({ ...p, [id]: valor }));
  };

  const temEnviadas = Object.keys(normalizarRespostas(data?.ultimasRespostas)).length > 0;
  const descartarRascunho = () => {
    const destino = temEnviadas ? "voltar às respostas que você já enviou" : "limpar o formulário";
    if (!window.confirm(`Descartar o que foi digitado e não enviado, e ${destino}?`)) return;
    apagarRascunho(armazenamento(), token);
    digitou.current = false;
    setRascunhoOk(null);
    setRespostas(temEnviadas ? normalizarRespostas(data?.ultimasRespostas) : {});
    setOrigem(temEnviadas ? "enviadas" : "vazio");
  };

  const aoEnviar = (acao: ResultadoEnvio, respondidoEm: string | null) => {
    apagarRascunho(armazenamento(), token);
    digitou.current = false;
    setRascunhoOk(null);
    setEnviado(acao);
    setData((d) => d ? {
      ...d,
      alreadyAnswered: true,
      respondidoEm: respondidoEm ?? d.respondidoEm ?? null,
      // Dono: o que acabou de enviar passa a ser "o enviado" (para Descartar voltar a ele).
      ultimasRespostas: d.scope === "full" ? normalizarRespostas(respostas) : d.ultimasRespostas,
    } : d);
    setOrigem(data?.scope === "full" ? "enviadas" : "vazio");
  };

  // Link do vendedor (raiox): sem PIN — abre direto no formulário.
  useEffect(() => {
    if (scope === "raiox" && !data) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(e?: React.FormEvent) {
    e?.preventDefault();
    if (scope === "full" && !code.trim()) return; // raiox não exige código
    setUnlocking(true); setGateError("");
    const r = await chamar<AccessData>(`/api/ficha/${token}/access`, { code });
    if (r.ok && r.data) setData(r.data);
    else setGateError(r.status === 0 ? "Sem conexão agora. Tente de novo." : (r.erro || "Não foi possível entrar."));
    setUnlocking(false);
  }

  /** Recarrega os números depois de salvar. `false` = não conseguiu (a tela avisa). */
  async function refresh(): Promise<boolean> {
    const r = await chamar<AccessData>(`/api/ficha/${token}/access`, { code });
    if (r.ok && r.data) { setData(r.data); return true; }
    return false;
  }

  // ── Sem dados ainda ────────────────────────────────────────────────────
  if (!data) {
    // Vendedor (raiox): abre direto — sem PIN, só um loading enquanto carrega.
    if (scope === "raiox") {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
          {gateError ? <p className="text-sm text-destructive">{gateError}</p> : <Loader2 size={22} className="text-primary animate-spin" />}
        </div>
      );
    }
    // Dono (full): portão de PIN.
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
          <a href={linkWhatsapp()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 min-h-[44px] text-xs text-muted-foreground hover:text-primary transition-colors">
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
          <h1 className="text-lone-h1 font-semibold">Olá, {data.clientName}</h1>
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
                className={`flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${sub === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <span className={`text-[10px] font-bold ${sub === id ? "opacity-70" : "opacity-50"}`}>{num}</span>{icon}{label}
              </button>
            ))}
          </div>
        )}

        {data.scope === "full" && sub === "crescimento" && data.growth && data.series
          ? <Crescimento token={token} code={code} growth={data.growth} series={data.series} onSaved={refresh} />
          : <RaioX token={token} code={code} scope={data.scope} whatsappPhone={data.whatsappPhone}
              alreadyAnswered={data.alreadyAnswered} respondidoEm={data.respondidoEm ?? null}
              respostas={respostas} onMudar={mudarResposta} origem={origem}
              onDescartar={descartarRascunho} rascunhoOk={rascunhoOk}
              enviado={enviado} onEnviado={aoEnviar} onEditar={() => setEnviado(null)} />}

        <footer className="pt-2 text-center">
          <a href={linkWhatsapp(data.whatsappPhone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 min-h-[44px] text-xs text-muted-foreground hover:text-primary transition-colors">
            <MessageCircle size={12} /> Falar com a equipe da Lone
          </a>
        </footer>
      </div>
    </div>
  );
}

// ── 01 · Meu Crescimento ──────────────────────────────────────────────────
function Crescimento({ token, code, growth, series, onSaved }: { token: string; code: string; growth: GrowthSummary; series: SeriePonto[]; onSaved: () => Promise<boolean> }) {
  // Só mês atual ou anterior (SP) — é o que o servidor aceita pelo link.
  const [mesAnterior, mesAtual] = mesesPermitidosCliente();
  const [month, setMonth] = useState(mesAtual);
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
    const r = await chamar(`/api/ficha/${token}/growth`, { code, month, revenue: Number(fat), vendas: vendas ? Number(vendas) : null });
    setSaving(false);
    if (!r.ok) { setErr(r.status === 0 ? "Sem conexão agora. Tente de novo." : (r.erro || "Não foi possível salvar.")); return; }
    setSaved(true); setFat(""); setVendas("");
    setTimeout(() => setSaved(false), 2000);
    if (!(await onSaved())) setErr("Salvo! Só não consegui atualizar o gráfico — recarregue a página para ver.");
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
                    className={`px-3 py-1.5 min-h-[44px] rounded-md text-xs font-medium transition-colors ${period === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
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
        <p className="text-lone-caption text-muted-foreground">Dá pra lançar o mês atual ou o anterior. O ticket médio a Lone calcula.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mês</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)}
              className="w-full min-h-[44px] bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
              <option value={mesAtual}>{mLabel(mesAtual)} (este mês)</option>
              <option value={mesAnterior}>{mLabel(mesAnterior)} (mês passado)</option>
            </select>
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
// O estado (respostas, rascunho, enviado) vem do componente de cima: trocar de aba não apaga nada.
function RaioX({
  token, code, scope, whatsappPhone, alreadyAnswered, respondidoEm,
  respostas, onMudar, origem, onDescartar, rascunhoOk, enviado, onEnviado, onEditar,
}: {
  token: string; code: string; scope: "full" | "raiox"; whatsappPhone: string;
  alreadyAnswered: boolean; respondidoEm: string | null;
  respostas: Respostas; onMudar: (id: string, valor: string) => void; origem: OrigemRespostas;
  onDescartar: () => void; rascunhoOk: boolean | null;
  enviado: ResultadoEnvio | null; onEnviado: (acao: ResultadoEnvio, respondidoEm: string | null) => void; onEditar: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!Object.keys(normalizarRespostas(respostas)).length) { setErr("Responda pelo menos uma pergunta."); return; }
    setSending(true); setErr("");
    const r = await chamar<{ acao?: ResultadoEnvio; respondidoEm?: string }>(`/api/ficha/${token}/submit`, { code, respostas });
    setSending(false);
    if (r.ok) onEnviado(r.data?.acao ?? "inserir", r.data?.respondidoEm ?? null);
    else setErr(r.status === 0 ? "Sem conexão agora. Suas respostas continuam aqui — tente de novo." : `${r.erro || "Não foi possível enviar."} Suas respostas continuam aqui.`);
  }

  if (enviado) return (
    <div className="card border-lone-success-border bg-lone-success-bg flex items-start gap-3">
      <Check size={18} className="text-lone-success shrink-0 mt-0.5" />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-lone-success">
          {enviado === "igual" ? "Suas respostas já estavam com a gente — nada mudou." : enviado === "atualizar" ? "Atualizamos suas respostas, obrigado!" : "Recebemos, obrigado!"}
        </p>
        <p className="text-xs text-muted-foreground">Nosso time comercial vai analisar e falar com você. Qualquer coisa, chame no <a href={linkWhatsapp(whatsappPhone)} target="_blank" rel="noreferrer" className="text-primary underline">WhatsApp</a>.</p>
        {/* Errou alguma coisa? Volta ao formulário com o que enviou — e o próximo envio atualiza. */}
        <button onClick={onEditar} className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-medium text-primary hover:underline">
          <Pencil size={12} /> Corrigir ou completar minhas respostas
        </button>
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
      </p>
      {alreadyAnswered && (
        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
          {scope === "full"
            ? `Você já enviou${respondidoEm ? ` em ${dataBR(respondidoEm)}` : ""}. Suas respostas estão abaixo: ajuste o que mudou e envie de novo — a gente atualiza o que já tinha.`
            : `Já recebemos um raio-x deste negócio${respondidoEm ? ` em ${dataBR(respondidoEm)}` : ""}. O que você responder aqui completa o anterior; pergunta em branco não apaga nada.`}
        </p>
      )}
      {origem === "rascunho" && (
        <div className="rounded-lg border border-lone-info-border bg-lone-info-bg px-3 py-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-lone-info flex-1 min-w-[12rem]">Recuperamos o que você tinha digitado aqui e ainda não enviou.</p>
          <button onClick={onDescartar} className="text-xs min-h-[44px] px-2 text-muted-foreground hover:text-foreground underline">Descartar rascunho</button>
        </div>
      )}
      <div className="space-y-4">
        {DIAG_QUESTIONS.map((q, i) => (
          <div key={q.id} className="space-y-1.5">
            <label htmlFor={`raiox-${q.id}`} className="text-sm font-medium block"><span className="text-primary mr-1.5">{i + 1}.</span>{q.label}</label>
            <textarea id={`raiox-${q.id}`} value={respostas[q.id] ?? ""} onChange={(e) => onMudar(q.id, e.target.value)}
              rows={2} placeholder={q.placeholder} maxLength={MAX_RESPOSTA}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
          </div>
        ))}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <button onClick={submit} disabled={sending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
        {sending ? "Enviando…" : alreadyAnswered ? "Enviar atualização" : "Enviar diagnóstico"}
      </button>
      {rascunhoOk === true && <p className="text-[11px] text-muted-foreground text-center">Rascunho guardado neste aparelho — pode trocar de aba ou recarregar sem perder.</p>}
      {rascunhoOk === false && <p className="text-[11px] text-lone-warning text-center">Este navegador não deixou guardar rascunho: envie antes de fechar a página.</p>}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
