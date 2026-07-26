"use client";

// Relatório de Instagram orgânico no portal do cliente — seguidores + seguidores GANHOS + alcance +
// visualizações + engajamento (curtidas/comentários) do PERÍODO (7/14/30 dias) + posts mais engajados.
// Lê do cache (rota /api/meta/instagram/[clientId]?token=&period=).

import { useState, useEffect } from "react";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; curtidas: number | null; comentarios: number | null; views: number | null; alcance: number | null; engajamento: number }
interface Resumo { alcance: number | null; alcanceJanelaDias?: number | null; seguidoresGanhos: number | null; curtidas: number; comentarios: number; engajamento: number; postsNoPeriodo: number }
interface Audiencia { generoMascPct: number | null; generoFemPct: number | null; idades: { faixa: string; pct: number }[]; cidades: { nome: string; pct: number }[] }
interface Snap { conta?: { username: string; seguidores: number | null; posts: number | null }; resumo?: Resumo; audiencia?: Audiencia; posts?: Post[]; fonte?: "owned" | "publico" }

function Bar({ label, pct, color, max = 100 }: { label: string; pct: number; color: string; max?: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[11px] shrink-0" style={{ width: 58, color: "#8b91a1" }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "#1A1F33" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(Math.round((pct / max) * 100), 3)}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold text-right" style={{ width: 42 }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

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
  const a = data?.audiencia;
  // Fonte pública (business discovery): a Meta não entrega alcance nem seguidores-ganhos de conta que
  // não é nossa. Em vez de mostrar "—" (parece quebrado), escondemos esses e explicamos numa nota.
  const isPublico = data?.fonte === "publico";
  const cards = [
    { l: "Seguidores", v: nf(data?.conta?.seguidores ?? null) },
    ...(isPublico ? [] : [{ l: "Seguidores ganhos", v: nfSigned(r?.seguidoresGanhos ?? null) }]),
    // A Meta só entrega alcance sem repetir pessoa em janela de 7 ou 28 dias. Escolher "14 dias" no
    // seletor devolvia o número de 28 — rotulado como 14. O rótulo agora diz a janela que veio.
    ...(isPublico ? [] : [{ l: r?.alcanceJanelaDias ? `Alcance da conta · ${r.alcanceJanelaDias} dias` : "Alcance da conta", v: nf(r?.alcance ?? null) }]),
    { l: "Engajamento", v: nf(r?.engajamento ?? null) },
    { l: "Curtidas", v: nf(r?.curtidas ?? null) },
    { l: "Comentários", v: nf(r?.comentarios ?? null) },
    { l: "Posts no período", v: nf(r?.postsNoPeriodo ?? null) },
  ];
  const temAudiencia = !!a && (a.generoMascPct != null || a.idades.length > 0 || a.cidades.length > 0);

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

      {isPublico && (
        <p className="text-[11px] mb-4" style={{ color: "#6B7280" }}>
          📊 Alcance, seguidores ganhos e público (gênero/idade/cidades) ficam disponíveis quando o perfil é conectado ao nosso Business Manager.
        </p>
      )}

      {/* O alcance do perfil conta também quem chegou por anúncio — sem dizer isso, o cliente soma
          com o alcance do relatório de tráfego e conta a mesma pessoa duas vezes. */}
      {!isPublico && r?.alcance != null && (
        <p className="text-[11px] mb-4" style={{ color: "#6B7280" }}>
          O alcance do perfil inclui quem chegou pelos anúncios — não some com o alcance do tráfego pago.
        </p>
      )}

      {/* Sem post no período, os números da conta sozinhos dão a impressão de que houve trabalho. */}
      {!loading && data && (r?.postsNoPeriodo ?? 0) === 0 && (
        <p className="text-[11px] mb-4" style={{ color: "#8b91a1" }}>
          <strong style={{ color: "#c9ced9" }}>Nenhum post publicado neste período.</strong> Os números acima são do perfil como um todo.
        </p>
      )}

      {/* Público do perfil (gênero / idade / cidades) */}
      {temAudiencia && (
        <div className="rounded-xl p-4 mb-3" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
          <p className="text-xs font-semibold mb-3" style={{ color: "#8b91a1" }}>Público do perfil</p>
          <div className="grid gap-5 sm:grid-cols-3">
            {a!.generoMascPct != null && (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "#6B7280" }}>Gênero</p>
                <Bar label="Homens" pct={a!.generoMascPct} color="#2B3CFF" />
                {a!.generoFemPct != null && <Bar label="Mulheres" pct={a!.generoFemPct} color="#c13584" />}
              </div>
            )}
            {a!.idades.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "#6B7280" }}>Faixa etária</p>
                {a!.idades.slice(0, 5).map((x) => (
                  <Bar key={x.faixa} label={x.faixa} pct={x.pct} color="#2B3CFF" max={Math.max(...a!.idades.map((i) => i.pct), 1)} />
                ))}
              </div>
            )}
            {a!.cidades.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "#6B7280" }}>Principais cidades</p>
                {a!.cidades.map((c, i) => (
                  <div key={c.nome} className="flex items-center gap-2 mb-2">
                    <span className="flex items-center justify-center text-[9px] font-bold rounded-full shrink-0" style={{ width: 16, height: 16, background: "#c1358422", color: "#c13584" }}>{i + 1}</span>
                    <span className="flex-1 text-xs truncate">{c.nome}</span>
                    <span className="text-[11px] font-semibold" style={{ color: "#8b91a1" }}>{c.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Posts mais engajados do período */}
      {(data?.posts?.length ?? 0) > 0 && (
        <>
          <p className="text-xs font-semibold mb-2" style={{ color: "#8b91a1" }}>5 melhores posts</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(data!.posts ?? []).slice(0, 5).map((p) => (
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
