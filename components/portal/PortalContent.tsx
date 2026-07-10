"use client";

// Seção "Conteúdo entregue" do portal — pro cliente que tem pacote de social/design. Mostra as artes
// entregues (posts com imagem). Público via token (mesmo token do portal).

import { useState, useEffect } from "react";

interface Item { id: string; title: string; format: string; status: string; imageUrl: string; date: string | null }

const fmtDate = (d: string | null) => d ? new Date(d.length <= 10 ? d + "T00:00:00" : d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";

export default function PortalContent({ token }: { token: string }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/content`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setItems(d?.items ?? []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [token]);

  if (items && items.length === 0) return null; // sem artes → não mostra a seção

  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎨</span>
        <h2 className="text-base font-bold">Conteúdo entregue</h2>
      </div>
      {!items ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl animate-pulse" style={{ background: "#0B0E1E" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl overflow-hidden" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.imageUrl} alt={it.title} className="w-full aspect-square object-cover" loading="lazy" />
              <div className="p-2.5">
                <p className="text-xs font-medium truncate">{it.title}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>
                  {it.format}{it.date ? ` · ${fmtDate(it.date)}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
