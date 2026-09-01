"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Radar, ExternalLink, Check, X, Bookmark, TrendingUp, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import EmptyState from "@/components/ui/EmptyState";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { MOTIVOS_LISTA, type MotivoDescarte } from "@/lib/radar/decisao";
import { toast } from "sonner";

// A entrega do Radar ao social media.
//
// Sem esta tela o sistema produz pauta e ninguém vê — foi o que aconteceu com os alertas de queda,
// detectados por meses sem chegar a ninguém. Aqui o Carlos e o Thiago abrem, conferem a referência
// que originou a ideia e decidem. A decisão também é dado: descarte com motivo é o único jeito de o
// sistema aprender o que não serve para este time.

interface Referencia {
  url: string; perfil?: string; seguidores?: number | null;
  outlier?: number | null; quando?: string; tipo?: string; nivel?: string;
}

interface Pauta {
  id: string; cliente_nome: string; nicho: string;
  tendencia: string; perfis_na_tendencia: number | null;
  fit_score: number | null; forca: number | null; status_tendencia: string | null;
  ideia: string; hook: string | null; formato: string | null;
  roteiro: string[] | null; cta: string | null; porque_funciona: string | null;
  referencias: Referencia[]; created_at: string;
}

const NIVEL_LABEL: Record<string, string> = {
  texto: "lido só pela legenda",
  imagem: "imagem analisada",
  video: "miniatura analisada",
};

export default function RadarPage() {
  const [pautas, setPautas] = useState<Pauta[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [descartando, setDescartando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await authedFetch("/api/radar/pautas?status=nova");
      if (!res.ok) { setPautas([]); return; }
      const d = await res.json();
      setPautas(d?.pautas ?? []);
    } catch { setPautas([]); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const decidir = useCallback(async (id: string, decisao: string, motivo?: MotivoDescarte) => {
    setOcupado(id);
    try {
      const res = await authedFetch("/api/radar/pautas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decisao, motivo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error || "Não consegui registrar");
        return;
      }
      toast.success(decisao === "usada" ? "Boa! Anotado como usada." : decisao === "guardada" ? "Guardada." : "Descartada — isso ajuda o Radar a melhorar.");
      setDescartando(null);
      setPautas((p) => (p ?? []).filter((x) => x.id !== id));
    } finally { setOcupado(null); }
  }, []);

  // Agrupa por cliente: o social media trabalha cliente a cliente, não ideia a ideia.
  const porCliente = useMemo(() => {
    const m = new Map<string, Pauta[]>();
    for (const p of pautas ?? []) m.set(p.cliente_nome, [...(m.get(p.cliente_nome) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [pautas]);

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Radar de Mercado"
        subtitle="O que está funcionando no mercado dos nossos clientes, virado em pauta"
      />

      <div className="p-4 lg:p-6 space-y-6">
        {pautas === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="animate-spin" size={16} /> carregando…
          </div>
        )}

        {pautas?.length === 0 && (
          <EmptyState
            icon={<Radar size={20} />}
            title="Nenhuma oportunidade nova"
            subtitle="O Radar roda toda segunda-feira. Quando encontrar um padrão que faça sentido para um cliente, a pauta aparece aqui."
          />
        )}

        {porCliente.map(([cliente, lista]) => (
          <section key={cliente}>
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-lg font-semibold text-foreground">{cliente}</h2>
              <span className="text-xs text-muted-foreground">
                {lista.length} oportunidade{lista.length > 1 ? "s" : ""} · {lista[0].nicho}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {lista.map((p) => (
                <article key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TrendingUp size={13} className="text-amber-500" />
                      <span className="truncate" title={p.tendencia}>{p.tendencia}</span>
                    </div>
                    <div className="flex shrink-0 gap-1.5 text-[11px]">
                      {p.fit_score != null && (
                        <span className="rounded-full bg-muted px-2 py-0.5" title="o quanto combina com este cliente">
                          fit {Math.round(p.fit_score)}
                        </span>
                      )}
                      {p.forca != null && (
                        <span className="rounded-full bg-muted px-2 py-0.5" title="força da tendência no mercado">
                          força {Math.round(p.forca)}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-foreground mb-1">{p.ideia}</h3>
                  {p.hook && <p className="text-sm text-foreground/90 italic mb-2">&ldquo;{p.hook}&rdquo;</p>}
                  {p.formato && <p className="text-xs text-muted-foreground mb-2">{p.formato}</p>}

                  {p.roteiro?.length ? (
                    <ol className="text-sm text-foreground/85 space-y-1 mb-2 list-decimal list-inside">
                      {p.roteiro.map((linha, i) => <li key={i}>{linha}</li>)}
                    </ol>
                  ) : null}

                  {p.cta && <p className="text-sm text-foreground mb-2"><span className="text-muted-foreground">CTA: </span>{p.cta}</p>}
                  {p.porque_funciona && (
                    <p className="text-xs text-muted-foreground mb-3">{p.porque_funciona}</p>
                  )}

                  {/* A referência é obrigatória: sem poder conferir de onde saiu, a ideia é um chute
                      bem escrito. Mostra de quem é, o tamanho do perfil e quanto passou do normal. */}
                  {p.referencias.length > 0 && (
                    <div className="border-t border-border pt-2 mb-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Veio destes conteúdos
                      </p>
                      {p.referencias.map((r) => (
                        <a
                          key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-foreground/80 hover:text-foreground py-0.5"
                        >
                          <ExternalLink size={12} className="shrink-0" />
                          <span className="truncate">
                            @{r.perfil ?? "?"}
                            {r.seguidores ? ` · ${r.seguidores.toLocaleString("pt-BR")} seg` : ""}
                            {r.outlier ? ` · ${r.outlier}x acima do normal dele` : ""}
                          </span>
                          {r.nivel && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              ({NIVEL_LABEL[r.nivel] ?? r.nivel})
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  {descartando === p.id ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Por que não serve?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {MOTIVOS_LISTA.map(([valor, rotulo]) => (
                          <button
                            key={valor}
                            onClick={() => decidir(p.id, "descartada", valor)}
                            disabled={ocupado === p.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/70 disabled:opacity-50"
                          >
                            {rotulo}
                          </button>
                        ))}
                        <button onClick={() => setDescartando(null)} className="text-xs px-2.5 py-1 text-muted-foreground">
                          cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => decidir(p.id, "usada")}
                        disabled={ocupado === p.id}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <Check size={14} /> Vou usar
                      </button>
                      <button
                        onClick={() => setDescartando(p.id)}
                        disabled={ocupado === p.id}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50"
                      >
                        <X size={14} /> Não serve
                      </button>
                      <button
                        onClick={() => decidir(p.id, "guardada")}
                        disabled={ocupado === p.id}
                        title="guardar para depois"
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <Bookmark size={14} />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
