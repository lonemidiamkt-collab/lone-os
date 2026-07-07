"use client";

// app/carteira/page.tsx — Carteira / Radar de receita (aba 03 do Ficha Viva 360, cross-cliente).
// A saúde de crescimento de todos os clientes ativos numa fila: verde = upsell, vermelho = reter.
// Admin apenas. Lê /api/ficha-viva/carteira (cruza o histórico de faturamento por cliente).

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Layers, TrendingUp, TrendingDown, Minus, Loader2, ChevronRight } from "lucide-react";

interface Item {
  clientId: string;
  nome: string;
  nicho: string | null;
  score: number;
  level: "up" | "ok" | "risk" | "unknown";
  situacao: string;
  acao: string;
  faturamentoMes: number | null;
  meses: number;
}
interface Resumo { total: number; upsell: number; risco: number; semDados: number }

const LVL = {
  up: { color: "var(--lone-success)", pill: "bg-lone-success-bg text-lone-success", icon: <TrendingUp size={12} /> },
  ok: { color: "var(--primary)", pill: "bg-primary/10 text-primary", icon: <Minus size={12} /> },
  risk: { color: "var(--destructive)", pill: "bg-destructive/10 text-destructive", icon: <TrendingDown size={12} /> },
  unknown: { color: "var(--muted-foreground)", pill: "bg-muted/30 text-muted-foreground", icon: <Minus size={12} /> },
} as const;

const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function CarteiraPage() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const [items, setItems] = useState<Item[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await authedFetch("/api/ficha-viva/carteira");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Erro");
        setItems(json.items); setResumo(json.resumo);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally { setLoading(false); }
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Carteira" />
        <div className="p-6"><p className="text-sm text-muted-foreground">Restrito a administradores.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Carteira" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers size={22} className="text-primary" /> Carteira · Radar de receita
          </h1>
          <p className="text-sm text-muted-foreground mt-1">A saúde de crescimento de cada cliente numa fila só. Verde é oportunidade de aumento de contrato; vermelho é sinal de churn antes que ele aconteça.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={22} className="text-primary animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            {/* Resumo */}
            {resumo && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <ResumoCard label="Clientes ativos" value={resumo.total} />
                <ResumoCard label="Prontos p/ upsell" value={resumo.upsell} accent="var(--lone-success)" />
                <ResumoCard label="Em risco" value={resumo.risco} accent="var(--destructive)" />
                <ResumoCard label="Sem dados" value={resumo.semDados} accent="var(--muted-foreground)" />
              </div>
            )}

            {/* Tabela */}
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium py-3 px-3">Cliente</th>
                    <th className="text-left font-medium py-3 px-3">Health</th>
                    <th className="text-left font-medium py-3 px-3">Situação</th>
                    <th className="text-left font-medium py-3 px-3">O que fazer</th>
                    <th className="py-3 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const c = LVL[it.level];
                    return (
                      <tr key={it.clientId} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-foreground">{it.nome}</div>
                          <div className="text-[11px] text-muted-foreground">{it.nicho || "—"}{it.faturamentoMes ? ` · ${brl(it.faturamentoMes)}/mês` : ""}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-24 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                              <span className="block h-full rounded-full" style={{ width: `${it.score}%`, background: c.color }} />
                            </span>
                            <span className="font-mono font-bold text-xs" style={{ color: c.color }}>{it.score}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full ${c.pill}`}>{c.icon}{it.situacao}</span>
                        </td>
                        <td className="py-3 px-3 text-xs text-muted-foreground max-w-xs">{it.acao}</td>
                        <td className="py-3 px-3 text-right">
                          <Link href={`/clients/${it.clientId}?tab=ficha-viva`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
                            Abrir <ChevronRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente ativo com dados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">O score cruza a tendência de faturamento de cada cliente (Painel de Crescimento). Lance faturamento nos clientes pra tirá-los de "Sem dados".</p>
          </>
        )}
      </div>
    </div>
  );
}

function ResumoCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-foreground" style={accent ? { color: accent } : undefined}>{value}</p>
    </div>
  );
}
