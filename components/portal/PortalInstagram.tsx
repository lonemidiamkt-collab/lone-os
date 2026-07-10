"use client";

// Seção "Instagram" do portal do cliente — seguidores + últimos posts com curtidas/comentários/views.
// Público via token do portal (a rota /api/meta/instagram/[clientId] aceita ?token). Só aparece se a
// conta de IG estiver mapeada (admin faz o mapeamento na ficha) e a Meta liberar as métricas.

import { useState, useEffect } from "react";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null }
interface Conta { username: string; seguidores: number | null; posts: number | null }

const nf = (n: number | null) => n == null ? "—" : n.toLocaleString("pt-BR");

export default function PortalInstagram({ token, clientId }: { token: string; clientId: string }) {
  const [data, setData] = useState<{ conta?: Conta; posts?: Post[] } | null>(null);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/meta/instagram/${clientId}?token=${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!alive) return; if (d?.conta) setData(d); else setHide(true); })
      .catch(() => { if (alive) setHide(true); });
    return () => { alive = false; };
  }, [token, clientId]);

  if (hide || !data) return null; // sem conta mapeada / sem dado → não mostra a seção

  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📸</span>
        <h2 className="text-base font-bold">Instagram</h2>
        {data.conta?.username && <span className="text-xs" style={{ color: "#6B7280" }}>@{data.conta.username}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div className="rounded-xl p-4" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
          <p className="text-xs mb-1" style={{ color: "#6B7280" }}>Seguidores</p>
          <p className="text-2xl font-bold">{nf(data.conta?.seguidores ?? null)}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
          <p className="text-xs mb-1" style={{ color: "#6B7280" }}>Publicações</p>
          <p className="text-2xl font-bold">{nf(data.conta?.posts ?? null)}</p>
        </div>
      </div>

      {(data.posts?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(data.posts ?? []).slice(0, 8).map((p) => (
            <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-xl overflow-hidden block" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
              {p.thumb
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                : <div className="w-full aspect-square" style={{ background: "#1A1F33" }} />}
              <div className="p-2 flex items-center gap-3 text-xs">
                <span>❤️ {nf(p.curtidas)}</span>
                <span>💬 {nf(p.comentarios)}</span>
                {p.views != null && <span>▶️ {nf(p.views)}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
