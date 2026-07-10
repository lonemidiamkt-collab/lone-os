"use client";

// Métricas ORGÂNICAS do Instagram do cliente (seguidores, curtidas, comentários, alcance, views).
// Requer: mapear a conta de IG (discover) + token Meta com escopo instagram_manage_insights
// (reconectar concedendo). Admin mapeia aqui; todos veem as métricas.

import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useRole } from "@/lib/context/RoleContext";
import { Instagram, Loader2, Heart, MessageCircle, Eye, Users, Link2, RefreshCw } from "lucide-react";

interface Post { id: string; tipo: string; thumb: string | null; permalink: string | null; legenda: string; data: string | null; curtidas: number | null; comentarios: number | null; alcance: number | null; views: number | null; salvamentos: number | null }
interface Conta { username: string; seguidores: number | null; posts: number | null }
interface DiscoverConta { pageId: string; pageName: string; igId: string; igUsername: string; followers: number | null; sugestaoClienteId: string | null; jaMapeadoClienteId: string | null }

const nfmt = (n: number | null) => n == null ? "—" : n.toLocaleString("pt-BR");
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";

export default function InstagramOrganico({ clientId }: { clientId: string }) {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ mapped: boolean; conta?: Conta; posts?: Post[] } | null>(null);
  const [erro, setErro] = useState<{ msg: string; needsReconnect?: boolean } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [contas, setContas] = useState<DiscoverConta[] | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setErro(null);
    authedFetch(`/api/meta/instagram/${clientId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok) setData(d);
        else if (r.status === 404 && d.mapped === false) setData({ mapped: false });
        else setErro({ msg: d.error || "Falha ao buscar", needsReconnect: d.needsReconnect });
      })
      .catch(() => setErro({ msg: "Falha de conexão" }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [clientId]);

  const abrirMapa = async () => {
    setMapOpen(true); setContas(null);
    const r = await authedFetch("/api/meta/instagram/discover");
    const d = await r.json().catch(() => ({}));
    if (r.ok) setContas(d.contas ?? []);
    else { setContas([]); setErro({ msg: d.error || "Falha ao listar contas", needsReconnect: d.needsReconnect }); }
  };

  const mapear = async (c: DiscoverConta | null) => {
    setSalvando(c?.igId ?? "clear");
    await authedFetch("/api/meta/instagram/discover", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c ? { clientId, igId: c.igId, pageId: c.pageId, igUsername: c.igUsername } : { clientId, igId: "" }),
    });
    setSalvando(null); setMapOpen(false); load();
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground flex items-center gap-2"><Instagram size={16} className="text-primary" /> Social orgânico (Instagram)</h3>
        <div className="flex items-center gap-2">
          {data?.mapped && <button onClick={load} className="text-muted-foreground hover:text-foreground" title="Atualizar"><RefreshCw size={13} /></button>}
          {isAdmin && <button onClick={abrirMapa} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Link2 size={11} /> {data?.mapped ? "Trocar conta" : "Mapear conta"}</button>}
        </div>
      </div>

      {erro && (
        <div className="rounded-lg bg-lone-warning-bg border border-lone-warning-border px-3 py-2 text-xs text-lone-warning">
          {erro.needsReconnect ? "Reconecte o Meta concedendo as permissões de Instagram (instagram_manage_insights)." : erro.msg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-primary" /></div>
      ) : !data?.mapped ? (
        <p className="text-xs text-muted-foreground py-3">
          Instagram ainda não mapeado pra este cliente. {isAdmin ? "Clique em “Mapear conta”." : "Peça pro admin mapear."}
        </p>
      ) : (
        <>
          {/* Conta */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Users size={11} /> Seguidores</p>
              <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">{nfmt(data.conta?.seguidores ?? null)}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Posts</p>
              <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">{nfmt(data.conta?.posts ?? null)}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">@</p>
              <p className="text-sm font-semibold text-foreground truncate mt-1">@{data.conta?.username}</p>
            </div>
          </div>

          {/* Posts */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Últimos posts</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {(data.posts ?? []).map((p) => (
                <a key={p.id} href={p.permalink ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border bg-background overflow-hidden hover:border-primary/40 transition-colors">
                  {p.thumb ? <img src={p.thumb} alt="" className="w-full aspect-square object-cover" loading="lazy" /> : <div className="w-full aspect-square bg-muted grid place-items-center"><Instagram size={20} className="text-muted-foreground" /></div>}
                  <div className="p-2 space-y-1">
                    <div className="flex items-center gap-2.5 text-[11px] text-foreground">
                      <span className="flex items-center gap-0.5"><Heart size={11} className="text-destructive" /> {nfmt(p.curtidas)}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle size={11} className="text-primary" /> {nfmt(p.comentarios)}</span>
                      {p.views != null && <span className="flex items-center gap-0.5"><Eye size={11} className="text-muted-foreground" /> {nfmt(p.views)}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{p.alcance != null ? `Alcance ${nfmt(p.alcance)} · ` : ""}{fmtDate(p.data)}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Modal de mapeamento */}
      {mapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setMapOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-semibold text-foreground mb-3">Mapear conta de Instagram</h4>
            {!contas ? (
              <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-primary" /></div>
            ) : contas.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">Nenhuma conta de Instagram comercial encontrada no token. Reconecte o Meta com as permissões de Instagram, e confirme que o IG do cliente é Conta Comercial ligada a uma Página.</p>
            ) : (
              <div className="space-y-1.5">
                {contas.map((c) => (
                  <button key={c.igId} onClick={() => mapear(c)} disabled={!!salvando}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${c.sugestaoClienteId === clientId ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">@{c.igUsername || "—"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.pageName} · {nfmt(c.followers)} seg.{c.sugestaoClienteId === clientId ? " · sugerido" : ""}</p>
                    </div>
                    {salvando === c.igId ? <Loader2 size={14} className="animate-spin text-primary shrink-0" /> : <span className="text-[11px] text-primary shrink-0">Usar</span>}
                  </button>
                ))}
                <button onClick={() => mapear(null)} disabled={!!salvando} className="w-full text-[11px] text-destructive hover:underline pt-2">Desmapear</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
