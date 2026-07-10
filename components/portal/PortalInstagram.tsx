"use client";

// Relatório de Instagram orgânico no portal do cliente — seguidores + seguidores GANHOS + alcance +
// visualizações + engajamento (curtidas/comentários) do PERÍODO (7/14/30 dias) + posts mais engajados.
// Lê do cache (rota /api/meta/instagram/[clientId]?token=&period=).

import { useState, useEffect } from "react";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null; engajamento: number }
interface Resumo { alcance: number | null; visualizacoes: number; seguidoresGanhos: number | null; curtidas: number; comentarios: number; engajamento: number; postsNoPeriodo: number }
interface Snap { conta?: { username: string; seguidores: number | null; posts: number | null }; resumo?: Resumo; posts?: Post[] }

type Period = "7d" | "14d" | "30d";
const nf = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const nfSigned = (n: number | null | undefined) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toLocaleString("pt-BR"));
const PERIODOS: [Period, string][] = [["7d", "7 dias"], ["14d", "14 dias"], ["30d", "30 dias"]];

export default function PortalInstagram({ token, clientId }: { token: string; clientId: string }) {
  const [period, setPeriod] = useState<Period>("7d");
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

  const r = data?.resumo;
  const cards = [
    { l: "Seguidores", v: nf(data?.conta?.seguidores ?? null) },
    { l: "Seguidores ganhos", v: nfSigned(r?.seguidoresGanhos ?? null) },
    { l: "Alcance", v: nf(r?.alcance ?? null) },
    { l: "Visualizações", v: nf(r?.visualizacoes ?? null) },
    { l: "Curtidas", v: nf(r?.curtidas ?? null) },
    { l: "Comentários", v: nf(r?.comentarios ?? null) },
    { l: "Engajamento", v: nf(r?.engajamento ?? null) },
    { l: "Posts no período", v: nf(r?.postsNoPeriodo ?? null) },
  ];

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
        {cards.map((k) => (
          <div key={k.l} className="rounded-xl p-4" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
            <p className="text-xs mb-1" style={{ color: "#6B7280" }}>{k.l}</p>
            <p className="text-2xl font-bold">{loading && !data ? "…" : k.v}</p>
          </div>
        ))}
      </div>

      {/* Posts mais engajados do período */}
      {(data?.posts?.length ?? 0) > 0 && (
        <>
          <p className="text-xs font-semibold mb-2" style={{ color: "#8b91a1" }}>Posts com mais engajamento</p>
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
        </>
      )}
    </div>
  );
}
