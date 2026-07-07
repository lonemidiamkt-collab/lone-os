"use client";

// components/fichaviva/FichaVivaClient.tsx — a experiência do CLIENTE na Ficha Viva (link público).
// Duas partes no mesmo link: "Seu crescimento" (faturamento/ticket/saúde que a Lone acompanha) e
// "Diagnóstico comercial" (10 perguntas). Ao enviar, grava via /api/ficha/[token]/submit.

import { useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, Check, Loader2, MessageCircle, Send, Sparkles,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";
import type { GrowthSummary } from "@/lib/fichaViva/growth";

interface Props {
  token: string;
  clientName: string;
  whatsappPhone: string;
  welcomeMessage: string | null;
  growth: GrowthSummary;
  alreadyAnswered: boolean;
}

function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function FichaVivaClient({ token, clientName, whatsappPhone, welcomeMessage, growth, alreadyAnswered }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const chartData = growth.series.map((p) => ({ month: p.month.slice(5), Faturamento: p.faturamento }));
  const hasChart = chartData.length >= 2;

  async function submit() {
    if (Object.values(answers).every((v) => !v.trim())) {
      setError("Responda pelo menos uma pergunta antes de enviar.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/ficha/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: answers }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Não foi possível enviar.");
      }
      setSent(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-6">

        {/* Cabeçalho */}
        <header className="space-y-1">
          <p className="text-eyebrow text-primary">Lone Mídia</p>
          <h1 className="text-h1 font-bold">Olá, {clientName} 👋</h1>
          <p className="text-body text-muted-foreground">
            {welcomeMessage || "Aqui você acompanha seu crescimento com a gente e nos conta como está seu comercial. Leva 3 minutos."}
          </p>
        </header>

        {/* Confirmação de envio */}
        {sent && (
          <div className="card border-lone-success-border bg-lone-success-bg flex items-start gap-3">
            <Check size={18} className="text-lone-success shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-lone-success">Recebemos, obrigado!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nosso time comercial vai analisar e falar com você. Qualquer coisa, é só chamar no WhatsApp.</p>
            </div>
          </div>
        )}

        {/* ── Seu crescimento ─────────────────────────────────────────────── */}
        <section className="card space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            <h2 className="text-h2 font-semibold">Seu crescimento com a Lone</h2>
          </div>

          {growth.mesesRegistrados === 0 ? (
            <p className="text-sm text-muted-foreground">Estamos reunindo os primeiros meses de resultado — logo você vê sua evolução aqui.</p>
          ) : (
            <>
              {/* Selo de saúde */}
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                growth.level === "up" ? "bg-lone-success-bg border-lone-success-border" :
                growth.level === "down" ? "bg-lone-warning-bg border-lone-warning-border" :
                growth.level === "flat" ? "bg-muted/30 border-border" : "bg-muted/30 border-border"
              }`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  growth.level === "up" ? "bg-lone-success/15" :
                  growth.level === "down" ? "bg-lone-warning/15" : "bg-muted"
                }`}>
                  {growth.level === "up" ? <TrendingUp size={18} className="text-lone-success" /> :
                   growth.level === "down" ? <TrendingDown size={18} className="text-lone-warning" /> :
                   <Minus size={18} className="text-muted-foreground" />}
                </div>
                <div>
                  <p className={`text-sm font-bold ${
                    growth.level === "up" ? "text-lone-success" :
                    growth.level === "down" ? "text-lone-warning" : "text-foreground"
                  }`}>{growth.label}{growth.pct !== null ? ` · ${growth.pct >= 0 ? "+" : ""}${growth.pct}%` : ""}</p>
                  <p className="text-xs text-muted-foreground">{growth.reading}</p>
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">Faturamento total</p>
                  <p className="text-sm font-bold">{fmtBRL(growth.totalFaturamento)}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">Último mês</p>
                  <p className="text-sm font-bold">{growth.last ? fmtBRL(growth.last.faturamento) : "—"}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted-foreground">Ticket médio</p>
                  <p className="text-sm font-bold">{growth.last?.ticket ? fmtBRL(growth.last.ticket) : "—"}</p>
                </div>
              </div>

              {/* Gráfico de faturamento */}
              {hasChart && (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: "var(--muted-foreground)" }}
                        formatter={(v) => [fmtBRL(Number(v)), "Faturamento"]}
                      />
                      <Line type="monotone" dataKey="Faturamento" stroke="var(--lone-success)" strokeWidth={2} dot={{ fill: "var(--lone-success)", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Diagnóstico comercial ───────────────────────────────────────── */}
        {!sent && (
          <section className="card space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              <h2 className="text-h2 font-semibold">Diagnóstico do seu comercial</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Responda o que der — quanto mais completo, melhor a gente consegue te ajudar a vender mais.
              {alreadyAnswered && " Você já enviou um antes; pode atualizar quando quiser."}
            </p>

            <div className="space-y-4">
              {DIAG_QUESTIONS.map((q, i) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="text-sm font-medium block">
                    <span className="text-primary mr-1.5">{i + 1}.</span>{q.label}
                  </label>
                  <textarea
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                    rows={2}
                    placeholder={q.placeholder}
                    maxLength={1500}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
                  />
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              onClick={submit}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
              {sending ? "Enviando…" : "Enviar diagnóstico"}
            </button>
          </section>
        )}

        {/* Rodapé */}
        <footer className="pt-2 text-center">
          <a
            href={`https://wa.me/${whatsappPhone}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle size={12} /> Falar com a equipe da Lone
          </a>
        </footer>
      </div>
    </div>
  );
}
