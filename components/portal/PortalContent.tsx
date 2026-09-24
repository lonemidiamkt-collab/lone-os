"use client";

// Seção de artes do portal do cliente. Mostra as artes ENTREGUES; nas mais novas, o cliente pode
// PEDIR AJUSTE por escrito. A aprovação é no WhatsApp com o time (decisão de 31/08) — o botão de
// aprovar só aparece com PORTAL_APROVACAO_CLIENTE=on.

import { useState, useEffect, useCallback } from "react";
import { Check, Palette, Pencil, Sparkles } from "lucide-react";
import { chamar } from "@/lib/api/chamar";

interface Item { id: string; title: string; format: string; status: string; imageUrl: string; date: string | null; pendente: boolean; aprovada: boolean }

// Data pura lida como dia do calendário; timestamp convertido para São Paulo.
const fmtDate = (d: string | null) => !d ? "" : d.length <= 10
  ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
  : new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

/**
 * `aprovacaoLigada` chega desligado por padrão: o cliente vê a arte e pode PEDIR AJUSTE, mas o
 * aceite final volta a ser com o time (Roberto, 31/08: "o cliente aprovar pelo painel ainda não").
 * O botão existia desde julho, antes dessa decisão.
 */
export default function PortalContent({ token, aprovacaoLigada = false }: { token: string; aprovacaoLigada?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [ajusteOpen, setAjusteOpen] = useState<string | null>(null);
  const [ajusteText, setAjusteText] = useState("");
  const [flash, setFlash] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setErroCarga(null);
    chamar<{ items: Item[] }>(`/api/portal/${token}/content`).then((r) => {
      if (!alive) return;
      // Falha NÃO é "nenhuma arte": antes a seção sumia e o cliente achava que nada tinha sido entregue.
      if (!r.ok || !r.data) { setErroCarga("Não consegui carregar suas artes agora."); return; }
      setItems(r.data.items ?? []);
    });
    return () => { alive = false; };
  }, [token, tentativa]);

  const act = useCallback(async (id: string, action: "approve" | "ajuste", comment?: string) => {
    setBusy(id);
    try {
      // Rota pública por token: `fetch` puro mesmo, mas com o mesmo cuidado — é a tela do CLIENTE,
      // e um "cliquei em aprovar e não aconteceu nada" aqui é pior que em qualquer tela interna.
      const r = await chamar(`/api/portal/${token}/approve`, { cardId: id, action, comment });
      if (!r.ok) {
        setFlash({ id, msg: r.status === 0 ? "Sem conexão agora. Tenta de novo em instantes?" : (r.erro || "Não consegui enviar agora. Tenta de novo em instantes?") });
        setTimeout(() => setFlash(null), 5000);
        return;
      }
      setItems((prev) => (prev ?? []).map((it) => it.id === id
        ? { ...it, pendente: false, aprovada: action === "approve" ? true : it.aprovada } : it));
      setFlash({ id, msg: action === "approve" ? "Aprovada! Avisamos o time." : "Ajuste enviado! Já vamos cuidar." });
      setAjusteOpen(null); setAjusteText("");
      setTimeout(() => setFlash(null), 4000);
    } finally { setBusy(null); }
  }, [token]);

  if (erroCarga) {
    return (
      <div className="mb-6 lg:mb-8 rounded-xl px-4 py-3.5 flex flex-wrap items-center gap-3 text-sm bg-lone-warning-bg border border-lone-warning-border text-lone-warning" role="alert">
        <span className="flex-1 min-w-[200px]">{erroCarga}</span>
        <button onClick={() => setTentativa((t) => t + 1)}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold min-h-[44px] bg-card border border-border text-foreground">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (items && items.length === 0) return null;

  const pendentes = (items ?? []).filter((i) => i.pendente);
  const entregues = (items ?? []).filter((i) => !i.pendente);

  return (
    <div className="mb-6 lg:mb-8 space-y-6">
      {/* Aguardando aprovação do cliente */}
      {pendentes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-primary shrink-0" aria-hidden="true" />
            <h2 className="text-base font-bold">Artes do mês</h2>
            <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-primary/[.13] text-lone-brand-soft">{pendentes.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendentes.map((it) => (
              <div key={it.id} className="rounded-xl overflow-hidden bg-card border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.title} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="p-3">
                  <p className="text-sm font-semibold truncate">{it.title}</p>
                  <p className="text-xs mb-3 text-lone-text-tertiary">{it.format}{it.date ? ` · ${fmtDate(it.date)}` : ""}</p>

                  {flash?.id === it.id ? (
                    <p className="text-sm font-medium py-2 text-lone-success">{flash.msg}</p>
                  ) : ajusteOpen === it.id ? (
                    <div className="space-y-2">
                      <textarea autoFocus value={ajusteText} onChange={(e) => setAjusteText(e.target.value)} rows={3}
                        placeholder="O que você quer que a gente ajuste?"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none bg-background border border-border text-foreground" />
                      <div className="flex gap-2">
                        <button disabled={busy === it.id || !ajusteText.trim()} onClick={() => act(it.id, "ajuste", ajusteText)}
                          className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px] bg-primary text-primary-foreground">{busy === it.id ? "Enviando…" : "Enviar ajuste"}</button>
                        <button onClick={() => { setAjusteOpen(null); setAjusteText(""); }}
                          className="rounded-lg py-2.5 px-3 text-sm min-h-[44px] text-muted-foreground">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {aprovacaoLigada && <button disabled={busy === it.id} onClick={() => act(it.id, "approve")}
                        className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5 bg-lone-success text-background"><Check size={16} aria-hidden="true" /> Aprovar</button>}
                      <button disabled={busy === it.id} onClick={() => setAjusteOpen(it.id)}
                        className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5 bg-card text-secondary-foreground border border-border"><Pencil size={15} aria-hidden="true" /> Pedir ajuste</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo entregue (galeria) */}
      {entregues.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Palette size={18} className="text-primary shrink-0" aria-hidden="true" />
            <h2 className="text-base font-bold">Conteúdo entregue</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {entregues.map((it) => (
              <div key={it.id} className="rounded-xl overflow-hidden relative bg-card border border-border">
                {it.aprovada && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold rounded-full px-1.5 py-0.5 z-10 bg-lone-success text-background">✓ Aprovada</span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.title} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{it.title}</p>
                  <p className="text-xs mt-0.5 text-lone-text-tertiary">{it.format}{it.date ? ` · ${fmtDate(it.date)}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
