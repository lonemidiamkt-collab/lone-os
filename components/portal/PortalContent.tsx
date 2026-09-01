"use client";

// Seção de artes do portal do cliente. Mostra as artes ENTREGUES e, pras que estão aguardando o OK
// do cliente, deixa ele APROVAR ou PEDIR AJUSTE ali mesmo (tira o vai-e-vem do WhatsApp). Público via
// token. Aprovar → marca no card + notifica o time; ajuste → salva o comentário + notifica.

import { useState, useEffect, useCallback } from "react";

interface Item { id: string; title: string; format: string; status: string; imageUrl: string; date: string | null; pendente: boolean; aprovada: boolean }

const fmtDate = (d: string | null) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";

/**
 * `aprovacaoLigada` chega desligado por padrão: o cliente vê a arte e pode PEDIR AJUSTE, mas o
 * aceite final volta a ser com o time (Roberto, 31/08: "o cliente aprovar pelo painel ainda não").
 * O botão existia desde julho, antes dessa decisão.
 */
export default function PortalContent({ token, aprovacaoLigada = false }: { token: string; aprovacaoLigada?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ajusteOpen, setAjusteOpen] = useState<string | null>(null);
  const [ajusteText, setAjusteText] = useState("");
  const [flash, setFlash] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/content`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setItems(d?.items ?? []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [token]);

  const act = useCallback(async (id: string, action: "approve" | "ajuste", comment?: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/portal/${token}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id, action, comment }),
      });
      if (res.ok) {
        setItems((prev) => (prev ?? []).map((it) => it.id === id
          ? { ...it, pendente: false, aprovada: action === "approve" ? true : it.aprovada } : it));
        setFlash({ id, msg: action === "approve" ? "Aprovada! ✅ Avisamos o time." : "Ajuste enviado! ✏️ Já vamos cuidar." });
        setAjusteOpen(null); setAjusteText("");
        setTimeout(() => setFlash(null), 4000);
      }
    } finally { setBusy(null); }
  }, [token]);

  if (items && items.length === 0) return null;

  const pendentes = (items ?? []).filter((i) => i.pendente);
  const entregues = (items ?? []).filter((i) => !i.pendente);

  return (
    <div className="mb-6 lg:mb-8 space-y-6">
      {/* Aguardando aprovação do cliente */}
      {pendentes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">✋</span>
            <h2 className="text-base font-bold">Aprove suas artes</h2>
            <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#2B3CFF22", color: "#7d8cff" }}>{pendentes.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendentes.map((it) => (
              <div key={it.id} className="rounded-xl overflow-hidden" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.title} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="p-3">
                  <p className="text-sm font-semibold truncate">{it.title}</p>
                  <p className="text-[11px] mb-3" style={{ color: "#6B7280" }}>{it.format}{it.date ? ` · ${fmtDate(it.date)}` : ""}</p>

                  {flash?.id === it.id ? (
                    <p className="text-sm font-medium py-2" style={{ color: "#22c55e" }}>{flash.msg}</p>
                  ) : ajusteOpen === it.id ? (
                    <div className="space-y-2">
                      <textarea autoFocus value={ajusteText} onChange={(e) => setAjusteText(e.target.value)} rows={3}
                        placeholder="O que você quer que a gente ajuste?"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        style={{ background: "#060814", border: "1px solid #1A1F33", color: "#fff" }} />
                      <div className="flex gap-2">
                        <button disabled={busy === it.id || !ajusteText.trim()} onClick={() => act(it.id, "ajuste", ajusteText)}
                          className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px]"
                          style={{ background: "#2B3CFF", color: "#fff" }}>{busy === it.id ? "Enviando…" : "Enviar ajuste"}</button>
                        <button onClick={() => { setAjusteOpen(null); setAjusteText(""); }}
                          className="rounded-lg py-2.5 px-3 text-sm min-h-[44px]" style={{ color: "#8b91a1" }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {aprovacaoLigada && <button disabled={busy === it.id} onClick={() => act(it.id, "approve")}
                        className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
                        style={{ background: "#22c55e", color: "#04120a" }}>✅ Aprovar</button>}
                      <button disabled={busy === it.id} onClick={() => setAjusteOpen(it.id)}
                        className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 min-h-[44px]"
                        style={{ background: "#0B0E1E", color: "#c7cbd8", border: "1px solid #1A1F33" }}>✏️ Pedir ajuste</button>
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
            <span className="text-lg">🎨</span>
            <h2 className="text-base font-bold">Conteúdo entregue</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {entregues.map((it) => (
              <div key={it.id} className="rounded-xl overflow-hidden relative" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
                {it.aprovada && (
                  <span className="absolute top-2 right-2 text-[10px] font-bold rounded-full px-1.5 py-0.5 z-10"
                    style={{ background: "rgba(34,197,94,0.9)", color: "#04120a" }}>✓ Aprovada</span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.title} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{it.title}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>{it.format}{it.date ? ` · ${fmtDate(it.date)}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
