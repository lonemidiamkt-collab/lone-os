"use client";

// Relatório de Instagram orgânico no portal do cliente — seguidores + alcance/curtidas/comentários do
// PERÍODO (semana/mês) + posts. Lê do cache (rota /api/meta/instagram/[clientId]?token=&period=).

import { useState, useEffect } from "react";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null }
interface Snap { conta?: { username: string; seguidores: number | null; posts: number | null }; resumo?: { alcance: number | null; curtidas: number; comentarios: number; postsNoPeriodo: number }; posts?: Post[] }

const nf = (n: number | null) => n == null ? "—" : n.toLocaleString("pt-BR");
const PERIODOS: [("week" | "month"), string][] = [["week", "Semana"], ["month", "Mês"]];

export default function PortalInstagram({ token, clientId }: { token: string; clientId: string }) {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [data, setData] = useState<Snap | null>(null);
  const [hide, setHide] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true; setLoading(true);
    fetch(`/api/meta/instagram/${clientId}?token=${token}&period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!alive) return; if (d?.conta) { setData(d); } else if (!data) setHide(true); })
      .catch(() => { if (alive && !data) setHide(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clientId, period]);

  if (hide) return null;

  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg">📸</span>
          <h2 className="text-base font-bold">Instagram</h2>
          {data?.conta?.username && <span className="text-xs" style={{ color: "#6B7280" }}>@{data.conta.username}</span>}
        </div>
        <div className="flex gap-0.5 rounded-full p-0.5" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
          {PERIODOS.map(([p, l]) => (
            <button key={p} onClick={() => setPeriod(p)} className="rounded-full text-xs font-semibold px-3 py-1.5 min-h-[36px]"
              style={period === p ? { background: "#2B3CFF", color: "#fff" } : { color: "#8b91a1" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Resumo do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[
          { l: "Seguidores", v: nf(data?.conta?.seguidores ?? null) },
          { l: `Alcance (${period === "week" ? "7d" : "30d"})`, v: nf(data?.resumo?.alcance ?? null) },
          { l: "Curtidas", v: nf(data?.resumo?.curtidas ?? null) },
          { l: "Comentários", v: nf(data?.resumo?.comentarios ?? null) },
        ].map((k) => (
          <div key={k.l} className="rounded-xl p-4" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
            <p className="text-xs mb-1" style={{ color: "#6B7280" }}>{k.l}</p>
            <p className="text-2xl font-bold">{loading && !data ? "…" : k.v}</p>
          </div>
        ))}
      </div>

      {/* Posts do período */}
      {(data?.posts?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(data!.posts ?? []).slice(0, 8).map((p) => (
            <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-xl overflow-hidden block" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
              {p.thumb
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                : <div className="w-full aspect-square" style={{ background: "#1A1F33" }} />}
              <div className="p-2 flex items-center gap-3 text-xs flex-wrap">
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
