"use client";

// components/FichaVivaManagementCard.tsx — gestão da Ficha Viva na ficha do cliente (admin).
// Gera/copia/revoga o link do cliente (crescimento + diagnóstico) e mostra o diagnóstico que o
// cliente respondeu + o botão "Analisar com IA" (SWOT / prioridades / scripts pro time comercial).
//
// 21/10/2026 (auditoria de erro recuperável, 3.2): "Novo link" trocava em um clique, sem confirmar,
// e o link enviado ao cliente morria na hora. Agora pede confirmação (como o portal) dizendo isso.
// O `onUpdate` precisa chegar ao extra da página (token é campo sensível) — ver AbaMarca.
//
// 25/10/2026 (onda 6, itens 12.1–12.3): o diagnóstico vem da rota (/ficha-viva/analise, GET) e falha de
// leitura aparece como falha, com "Tentar de novo" — antes virava "O cliente ainda não respondeu" e a
// estrutura automática não rodava. "Refazer" pede confirmação quando a estrutura foi editada à mão e
// sempre guarda a anterior (Desfazer + "Voltar à anterior"). A edição guarda o texto cru: o Enter dos
// campos "1 por linha" não some mais.

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ClipboardList, Copy, Check, X, Link2, MessageSquare, Sparkles, Loader2, RotateCcw, Pencil, Save, FileDown, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { DIAG_QUESTIONS } from "@/lib/fichaViva/questions";
import {
  descreverEdicao, doRascunho, lerEstrutura, paraRascunho, precisaConfirmarRefazer,
  type EstruturaGuardada, type RascunhoEstrutura,
} from "@/lib/fichaViva/analise";

const PORTAL_DOMAIN = process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "https://resultados.lonemidia.com";

interface Props {
  client: Client;
  onUpdate: (patch: Partial<Client>) => void;
}

interface DiagRow {
  id: string;
  respostas: Record<string, string>;
  analise: EstruturaGuardada | null;
  status: string;
  answered_at: string;
}

export default function FichaVivaManagementCard({ client, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  // Trocar e revogar matam o link que o cliente tem: os dois pedem confirmação antes.
  const [confirmar, setConfirmar] = useState<null | "novo" | "revogar">(null);
  const [copied, setCopied] = useState(false);
  const [copiedRaiox, setCopiedRaiox] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [error, setError] = useState("");
  const [diag, setDiag] = useState<DiagRow | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);
  // Falha ao ler o diagnóstico ≠ "o cliente não respondeu" (12.1).
  const [erroDiag, setErroDiag] = useState<string | null>(null);
  // "Refazer" de uma estrutura editada à mão pede confirmação (12.2).
  const [confirmarRefazer, setConfirmarRefazer] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [editing, setEditing] = useState(false);
  // Rascunho com o TEXTO CRU dos campos "1 por linha" — converter a cada tecla engolia o Enter (12.3).
  const [draft, setDraft] = useState<RascunhoEstrutura | null>(null);
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
    setErroDiag(null);
    const r = await chamar<{ diagnostico: DiagRow | null }>(`/api/clients/${client.id}/ficha-viva/analise`);
    if (!r?.ok) {
      setErroDiag(r?.erro ?? "Não consegui carregar o diagnóstico agora.");
      setLoadingDiag(false);
      return;
    }
    const d = r.data?.diagnostico ?? null;
    setDiag(d ? { ...d, analise: lerEstrutura(d.analise) } : null);
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

  async function callAction(endpoint: "generate-token" | "revoke") {
    const trocando = endpoint === "generate-token" && active;
    setBusy(true);
    setError("");
    const r = await chamar<{ token?: string; raioxToken?: string }>(`/api/clients/${client.id}/ficha-viva/${endpoint}`, undefined, { method: "POST" });
    setBusy(false);
    setConfirmar(null);
    if (!r.ok) { setError(r.erro ?? "Não consegui completar agora."); return; }
    if (endpoint === "generate-token") {
      if (!r.data?.token) { setError("O link foi gerado, mas a resposta veio sem ele. Recarregue a página para ver o link atual."); return; }
      onUpdate({
        fichaVivaToken: r.data.token,
        fichaVivaRaioxToken: r.data.raioxToken,
        fichaVivaTokenCreatedAt: new Date().toISOString(),
        fichaVivaTokenRevokedAt: undefined,
        fichaVivaEnabled: true,
      });
      toast.success(trocando ? "Link trocado. O antigo não abre mais — mande o novo ao cliente." : "Ficha Viva ativada. Mande o link ao cliente.");
    } else {
      onUpdate({ fichaVivaTokenRevokedAt: new Date().toISOString(), fichaVivaEnabled: false });
      toast.success("Link revogado. Ele não abre mais.");
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setError("");
    setConfirmarRefazer(false);
    const r = await chamar<{ analise: EstruturaGuardada; guardouAnterior?: boolean }>(`/api/clients/${client.id}/ficha-viva/analyze`, undefined, { method: "POST" });
    setAnalyzing(false);
    if (!r?.ok || !r.data?.analise) { setError(r?.erro ?? "A IA não conseguiu gerar a estrutura agora."); return; }
    setDiag((d) => (d ? { ...d, analise: lerEstrutura(r.data!.analise), status: "analisado" } : d));
    // A versão que estava ficou guardada: dá para voltar na hora (e depois, pelo "Voltar à anterior").
    if (r.data.guardouAnterior) {
      toast.success("Estrutura refeita pela IA. A anterior ficou guardada.", {
        duration: 15000,
        action: { label: "Desfazer", onClick: () => { void voltarParaAnterior(); } },
      });
    }
  }

  /** "Refazer": se alguém editou à mão, pergunta antes (12.2). */
  function pedirRefazer() {
    if (precisaConfirmarRefazer(a)) { setConfirmarRefazer(true); return; }
    void analyze();
  }

  async function voltarParaAnterior() {
    setError("");
    const r = await chamar<{ analise: EstruturaGuardada }>(`/api/clients/${client.id}/ficha-viva/analise`, { acao: "voltar_anterior", diagId: diag?.id });
    if (!r?.ok || !r.data?.analise) { setError(r?.erro ?? "Não consegui voltar à versão anterior."); return; }
    setDiag((d) => (d ? { ...d, analise: lerEstrutura(r.data!.analise), status: "analisado" } : d));
    toast.success("Voltou à versão anterior. A que estava ficou guardada — dá para voltar de novo.");
  }

  function startEdit() {
    if (!a) return;
    setDraft(paraRascunho(a));
    setConfirmarRefazer(false);
    setEditing(true);
  }
  async function saveEdit() {
    if (!draft) return;
    setSavingEdit(true); setError("");
    const r = await chamar<{ analise: EstruturaGuardada }>(`/api/clients/${client.id}/ficha-viva/analise`, { analise: doRascunho(draft), diagId: diag?.id });
    setSavingEdit(false);
    if (!r?.ok || !r.data?.analise) { setError(r?.erro ?? "Não consegui salvar a estrutura. O que você escreveu continua aqui."); return; }
    setDiag((d) => (d ? { ...d, analise: lerEstrutura(r.data!.analise), status: "analisado" } : d));
    setEditing(false);
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
            {!confirmar && (
              <>
                <button type="button" onClick={() => setConfirmar("novo")} disabled={busy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-muted-foreground text-[11px] hover:bg-muted/20 border border-border transition-colors disabled:opacity-50">
                  <RotateCcw size={11} /> Novo link
                </button>
                <button type="button" onClick={() => setConfirmar("revogar")} disabled={busy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface text-destructive text-[11px] hover:bg-destructive/10 border border-border transition-colors disabled:opacity-50">
                  <X size={11} /> Revogar
                </button>
              </>
            )}
          </div>
          {confirmar && (
            <div className="space-y-2 rounded-lg border border-border bg-muted p-3" role="alertdialog" aria-label={confirmar === "novo" ? "Trocar o link da Ficha Viva" : "Revogar o link da Ficha Viva"}>
              <p className="text-[11px] leading-relaxed text-foreground">
                {confirmar === "novo"
                  ? "O link enviado ao cliente deixa de abrir na hora (o do Raio-X dos vendedores também). Nascem links novos — quem tem o antigo precisa receber o novo."
                  : "O link enviado ao cliente deixa de abrir (o do Raio-X dos vendedores também). Para voltar, só gerando um link novo."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => callAction(confirmar === "novo" ? "generate-token" : "revoke")} disabled={busy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50 ${confirmar === "novo" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-destructive/20 text-destructive"}`}>
                  {busy && <Loader2 size={11} className="animate-spin" />}
                  {confirmar === "novo" ? "Trocar o link" : "Revogar o link"}
                </button>
                <button type="button" onClick={() => setConfirmar(null)} disabled={busy} className="px-3 py-1.5 rounded-lg bg-surface text-muted-foreground text-[11px] hover:text-foreground">
                  Cancelar
                </button>
              </div>
            </div>
          )}
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
        ) : erroDiag ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">
            <span>{erroDiag} Isso não quer dizer que o cliente não respondeu.</span>
            <button type="button" onClick={() => void loadDiag()} className="shrink-0 rounded-md bg-card px-2.5 py-1 font-medium text-foreground hover:bg-accent">Tentar de novo</button>
          </div>
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
                    <button onClick={pedirRefazer} disabled={analyzing} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                      {analyzing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Refazer
                    </button>
                  </div>
                </div>
                {(descreverEdicao(a) || a.anterior) && (
                  <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                    {descreverEdicao(a) && <span>Estrutura {descreverEdicao(a)}.</span>}
                    {a.anterior && (
                      <button type="button" onClick={() => void voltarParaAnterior()} className="flex items-center gap-1 text-primary hover:underline">
                        <Undo2 size={11} /> Voltar à versão anterior
                      </button>
                    )}
                  </div>
                )}
                {confirmarRefazer && (
                  <div role="alertdialog" aria-label="Refazer a estrutura com a IA" className="space-y-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg p-3">
                    <p className="text-[11px] leading-relaxed text-foreground">
                      Esta estrutura foi {descreverEdicao(a)}. Refazer troca o diagnóstico, o SWOT, as prioridades e os scripts pela nova
                      saída da IA. A versão atual fica guardada e dá para voltar a ela.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void analyze()} disabled={analyzing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50">
                        {analyzing && <Loader2 size={11} className="animate-spin" />} Refazer mesmo assim
                      </button>
                      <button type="button" onClick={() => setConfirmarRefazer(false)} className="px-3 py-1.5 rounded-lg bg-surface text-muted-foreground text-[11px] hover:text-foreground">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
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
                  {([["Forças", "forcas"], ["Fraquezas", "fraquezas"], ["Oportunidades", "oportunidades"], ["Ameaças", "ameacas"]] as [string, "forcas" | "fraquezas" | "oportunidades" | "ameacas"][]).map(([label, key]) => (
                    <EditTA key={key} label={`${label} (1 por linha)`} rows={4} value={draft[key]}
                      onChange={(v) => setDraft({ ...draft, [key]: v })} />
                  ))}
                </div>
                <EditTA label="Prioridades — 90 dias (1 por linha)" rows={4} value={draft.prioridades} onChange={(v) => setDraft({ ...draft, prioridades: v })} />
                <EditTA label="Scripts pro time (1 por linha)" rows={5} value={draft.scripts} onChange={(v) => setDraft({ ...draft, scripts: v })} />
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

function EditTA({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary/50 resize-none" />
    </label>
  );
}
