"use client";

// components/FichaVivaManagementCard.tsx — gestão da Ficha Viva na ficha do cliente (admin).
// Gera/copia/revoga o link do cliente (crescimento + diagnóstico) e mostra o diagnóstico que o
// cliente respondeu + o botão "Analisar com IA" (SWOT / prioridades / scripts pro time comercial).

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ClipboardList, Copy, Check, X, Link2, MessageSquare, Sparkles, Loader2, RotateCcw, Pencil, Save, FileDown,
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
  const [copiedRaiox, setCopiedRaiox] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [error, setError] = useState("");
  const [diag, setDiag] = useState<DiagRow | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DiagAnalise | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pdfing, setPdfing] = useState(false);
  const autoRef = useRef(false);

  const token = client.fichaVivaToken;
  const revoked = !!client.fichaVivaTokenRevokedAt;
  const active = !!token && !revoked;
  const url = token ? `${PORTAL_DOMAIN}/ficha/${token}` : null;
  const raioxUrl = client.fichaVivaRaioxToken ? `${PORTAL_DOMAIN}/ficha/${client.fichaVivaRaioxToken}` : null;

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

  // Auto-gera a estrutura quando o time abre e o cliente já respondeu (sem clicar).
  useEffect(() => {
    if (diag && diag.status === "respondido" && !diag.analise && !autoRef.current) {
      autoRef.current = true;
      analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diag]);

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
          fichaVivaRaioxToken: json.raioxToken,
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

  function startEdit() {
    if (!a) return;
    setDraft(JSON.parse(JSON.stringify(a)) as DiagAnalise);
    setEditing(true);
  }
  async function saveEdit() {
    if (!draft) return;
    setSavingEdit(true); setError("");
    try {
      const res = await authedFetch(`/api/clients/${client.id}/ficha-viva/analise`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analise: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      setDiag((d) => (d ? { ...d, analise: json.analise, status: "analisado" } : d));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingEdit(false);
    }
  }

  async function downloadPdf() {
    setPdfing(true); setError("");
    try {
      const res = await authedFetch(`/api/clients/${client.id}/ficha-viva/pdf`);
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Falha ao gerar PDF"); }
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = u; link.download = "estrutura-comercial.pdf";
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar PDF");
    } finally {
      setPdfing(false);
    }
  }

  async function copyUrl() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  async function copyRaiox() {
    if (!raioxUrl) return;
    await navigator.clipboard.writeText(raioxUrl);
    setCopiedRaiox(true); setTimeout(() => setCopiedRaiox(false), 2000);
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
        <div className="space-y-3">
          {/* Link do DONO — vê tudo */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Link do dono <span className="text-lone-success">· crescimento + Raio-X</span></p>
            <div className="flex items-center gap-2">
              <input readOnly value={url ?? ""} className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground font-mono truncate outline-none" />
              <button onClick={copyUrl} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-muted-foreground text-[11px] hover:text-foreground hover:border-primary/40 transition-colors">
                {copied ? <Check size={12} className="text-lone-success" /> : <Copy size={12} />}{copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
          {/* Link do RAIO-X — vendedores, sem financeiro */}
          {raioxUrl && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Link do Raio-X <span className="text-primary">· vendedores (sem faturamento)</span></p>
              <div className="flex items-center gap-2">
                <input readOnly value={raioxUrl} className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground font-mono truncate outline-none" />
                <button onClick={copyRaiox} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-muted-foreground text-[11px] hover:text-foreground hover:border-primary/40 transition-colors">
                  {copiedRaiox ? <Check size={12} className="text-lone-success" /> : <Copy size={12} />}{copiedRaiox ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          )}
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

            {/* Gerar estrutura (auto-dispara quando o cliente responde; botão = fallback/retry) */}
            {!a && (
              <button onClick={analyze} disabled={analyzing} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {analyzing ? "Gerando estrutura…" : "Gerar estrutura com IA"}
              </button>
            )}

            {/* Estrutura — visualização */}
            {a && !editing && (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground flex-1">{a.diagnostico}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={downloadPdf} disabled={pdfing} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                      {pdfing ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />} PDF
                    </button>
                    <button onClick={startEdit} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1"><Pencil size={11} /> Editar</button>
                    <button onClick={analyze} disabled={analyzing} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                      {analyzing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Refazer
                    </button>
                  </div>
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

            {/* Estrutura — edição (o time corrige falhas / atende pedido do cliente) */}
            {editing && draft && (
              <div className="space-y-3">
                <EditTA label="Diagnóstico" rows={3} value={draft.diagnostico} onChange={(v) => setDraft({ ...draft, diagnostico: v })} />
                <div className="grid grid-cols-2 gap-2">
                  {([["Forças", "forcas"], ["Fraquezas", "fraquezas"], ["Oportunidades", "oportunidades"], ["Ameaças", "ameacas"]] as [string, keyof DiagAnalise["swot"]][]).map(([label, key]) => (
                    <EditTA key={key} label={`${label} (1 por linha)`} rows={4} value={arrToText(draft.swot[key])}
                      onChange={(v) => setDraft({ ...draft, swot: { ...draft.swot, [key]: textToArr(v) } })} />
                  ))}
                </div>
                <EditTA label="Prioridades — 90 dias (1 por linha)" rows={4} value={arrToText(draft.prioridades)} onChange={(v) => setDraft({ ...draft, prioridades: textToArr(v) })} />
                <EditTA label="Scripts pro time (1 por linha)" rows={5} value={arrToText(draft.scripts)} onChange={(v) => setDraft({ ...draft, scripts: textToArr(v) })} />
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={savingEdit} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {savingEdit ? "Salvando…" : "Salvar estrutura"}
                  </button>
                  <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg bg-surface border border-border text-muted-foreground text-xs hover:text-foreground transition-colors">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

const arrToText = (arr: string[]) => (arr || []).join("\n");
const textToArr = (t: string) => t.split("\n").map((s) => s.trim()).filter(Boolean);

function EditTA({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary/50 resize-none" />
    </div>
  );
}
