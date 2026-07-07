"use client";

// components/FichaVivaManagementCard.tsx — gestão da Ficha Viva na ficha do cliente (admin).
// Gera/copia/revoga o link do cliente (crescimento + diagnóstico) e mostra o diagnóstico que o
// cliente respondeu + o botão "Analisar com IA" (SWOT / prioridades / scripts pro time comercial).

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList, Copy, Check, X, Link2, MessageSquare, Sparkles, Loader2, RotateCcw,
} from "lucide-react";
import type { Client } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { supabase } from "@/lib/supabase/client";
import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";

const PORTAL_DOMAIN = process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "https://resultados.lonemidia.com";

interface Props {
  client: Client;
  onUpdate: (patch: Partial<Client>) => void;
}

interface DiagAnalise {
  diagnostico: string;
  swot: { forcas: string[]; fraquezas: string[]; oportunidades: string[]; ameacas: string[] };
  prioridades: string[];
  scripts: string[];
}
interface DiagRow {
  id: string;
  respostas: Record<string, string>;
  analise: DiagAnalise | null;
  status: string;
  answered_at: string;
}

export default function FichaVivaManagementCard({ client, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [error, setError] = useState("");
  const [diag, setDiag] = useState<DiagRow | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);

  const token = client.fichaVivaToken;
  const revoked = !!client.fichaVivaTokenRevokedAt;
  const active = !!token && !revoked;
  const url = token ? `${PORTAL_DOMAIN}/ficha/${token}` : null;

  const loadDiag = useCallback(async () => {
    setLoadingDiag(true);
    const { data } = await supabase
      .from("client_diagnostics")
      .select("id, respostas, analise, status, answered_at")
      .eq("client_id", client.id)
      .order("answered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setDiag((data as DiagRow) ?? null);
    setLoadingDiag(false);
  }, [client.id]);

  useEffect(() => { loadDiag(); }, [loadDiag]);

  async function callAction(endpoint: string) {
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`/api/clients/${client.id}/ficha-viva/${endpoint}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro");
      if (json.token) {
        onUpdate({
          fichaVivaToken: json.token,
          fichaVivaTokenCreatedAt: new Date().toISOString(),
          fichaVivaTokenRevokedAt: undefined,
          fichaVivaEnabled: true,
        });
      } else {
        onUpdate({ fichaVivaTokenRevokedAt: new Date().toISOString(), fichaVivaEnabled: false });
      }
      setConfirmRevoke(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao executar ação");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setError("");
    try {
      const res = await authedFetch(`/api/clients/${client.id}/ficha-viva/analyze`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na análise");
      setDiag((d) => (d ? { ...d, analise: json.analise, status: "analisado" } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na análise");
    } finally {
      setAnalyzing(false);
    }
  }

  async function copyUrl() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  async function copyWa() {
    if (!url) return;
    const phone = client.whatsappTeamPhone || "5522981530700";
    const text =
      `Olá! Preparamos um espaço só seu na Lone Mídia: você acompanha seu crescimento e nos conta ` +
      `rapidinho como está seu comercial pra gente te ajudar a vender mais.\n\nAcesse pelo link:\n${url}` +
      `\n\nDúvidas? Fale com a gente: wa.me/${phone}`;
    await navigator.clipboard.writeText(text);
    setCopiedWa(true); setTimeout(() => setCopiedWa(false), 2000);
  }

  const a = diag?.analise;

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardList size={14} className="text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Ficha Viva do Cliente</h3>
        {active && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-lone-success-bg text-lone-success border border-lone-success-border">Ativo</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Link exclusivo (sem login) onde o cliente vê o crescimento dele e responde um diagnóstico
        comercial. A IA transforma as respostas em SWOT + prioridades + scripts pro time.
      </p>

      {/* Link */}
      {!active ? (
        <button
          onClick={() => callAction("generate-token")}
          disabled={busy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Link2 size={13} /> {busy ? "Gerando…" : revoked ? "Reativar com novo link" : "Ativar Ficha Viva"}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input readOnly value={url ?? ""} className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground font-mono truncate outline-none" />
            <button onClick={copyUrl} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-muted-foreground text-[11px] hover:text-foreground hover:border-primary/40 transition-colors">
              {copied ? <Check size={12} className="text-lone-success" /> : <Copy size={12} />}{copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={copyWa} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lone-success-bg text-lone-success text-[11px] font-semibold hover:opacity-90 border border-lone-success-border transition-colors">
              {copiedWa ? <><Check size={12} /> Copiado!</> : <><MessageSquare size={12} /> Copiar mensagem WhatsApp</>}
            </button>
            {confirmRevoke ? (
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-destructive">Revogar o link?</span>
                <button onClick={() => callAction("revoke")} disabled={busy} className="px-2 py-1 rounded-md bg-destructive/20 text-destructive text-[11px] font-semibold">Sim</button>
                <button onClick={() => setConfirmRevoke(false)} className="px-2 py-1 rounded-md bg-surface text-muted-foreground text-[11px]">Não</button>
              </span>
            ) : (
              <>
                <button onClick={() => callAction("generate-token")} disabled={busy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-muted-foreground text-[11px] hover:bg-muted/20 border border-border transition-colors disabled:opacity-50">
                  <RotateCcw size={11} /> Novo link
                </button>
                <button onClick={() => setConfirmRevoke(true)} disabled={busy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-destructive text-[11px] hover:bg-destructive/10 border border-border transition-colors disabled:opacity-50">
                  <X size={11} /> Revogar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Diagnóstico */}
      <div className="pt-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Diagnóstico comercial</p>
          {diag && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${diag.status === "analisado" ? "bg-primary/10 text-primary border-primary/20" : "bg-lone-warning-bg text-lone-warning border-lone-warning-border"}`}>
              {diag.status === "analisado" ? "Analisado" : "Respondido — falta analisar"}
            </span>
          )}
        </div>

        {loadingDiag ? (
          <div className="flex justify-center py-3"><Loader2 size={16} className="text-primary animate-spin" /></div>
        ) : !diag ? (
          <p className="text-xs text-muted-foreground">O cliente ainda não respondeu. Envie o link acima.</p>
        ) : (
          <div className="space-y-3">
            {/* Respostas (colapsável) */}
            <button onClick={() => setShowAnswers((v) => !v)} className="text-xs text-primary hover:underline">
              {showAnswers ? "Ocultar respostas" : "Ver respostas do cliente"}
            </button>
            {showAnswers && (
              <div className="space-y-2">
                {DIAG_QUESTIONS.map((q) => (
                  <div key={q.id} className="text-xs">
                    <p className="text-muted-foreground">{q.label}</p>
                    <p className="text-foreground">{diag.respostas?.[q.id]?.trim() || "—"}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Ação de análise */}
            {!a && (
              <button onClick={analyze} disabled={analyzing} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {analyzing ? "Analisando…" : "Analisar com IA"}
              </button>
            )}

            {/* Resultado da IA */}
            {a && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">{a.diagnostico}</p>
                  <button onClick={analyze} disabled={analyzing} className="shrink-0 ml-2 text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                    {analyzing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Refazer
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["Forças", a.swot.forcas, "text-lone-success"],
                    ["Fraquezas", a.swot.fraquezas, "text-destructive"],
                    ["Oportunidades", a.swot.oportunidades, "text-primary"],
                    ["Ameaças", a.swot.ameacas, "text-lone-warning"],
                  ] as [string, string[], string][]).map(([titulo, itens, cor]) => (
                    <div key={titulo} className="rounded-lg border border-border p-2.5">
                      <p className={`text-[11px] font-semibold mb-1 ${cor}`}>{titulo}</p>
                      <ul className="space-y-0.5">
                        {itens.length ? itens.map((it, i) => <li key={i} className="text-[11px] text-muted-foreground">• {it}</li>) : <li className="text-[11px] text-muted-foreground">—</li>}
                      </ul>
                    </div>
                  ))}
                </div>
                {a.prioridades.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-foreground mb-1">Prioridades (90 dias)</p>
                    <ol className="space-y-0.5 list-decimal list-inside">
                      {a.prioridades.map((p, i) => <li key={i} className="text-xs text-muted-foreground">{p}</li>)}
                    </ol>
                  </div>
                )}
                {a.scripts.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-foreground mb-1">Scripts pro time</p>
                    <div className="space-y-1.5">
                      {a.scripts.map((s, i) => (
                        <p key={i} className="text-xs text-muted-foreground bg-surface border border-border rounded-lg p-2 whitespace-pre-wrap">{s}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
