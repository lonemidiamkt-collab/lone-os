"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Check, X, Bookmark, TrendingUp, Loader2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { useClientsStore } from "@/stores/useClientsStore";
import { useRole } from "@/lib/context/RoleContext";
import { cardDaPauta } from "@/components/planejamento/pauta-card";
import { MOTIVOS_LISTA, type MotivoDescarte } from "@/lib/radar/decisao";
import { toast } from "sonner";

// As oportunidades que o Radar encontrou, dentro do Planejamento.
//
// Roberto (02/09): "radar e planejamento já são áreas do social media, por que estão separados? O
// radar já faz parte de um planejamento". Tinha razão — eram duas abas para um trabalho só, e o
// Radar é justamente o insumo: você olha o que o mercado está mostrando e SÓ ENTÃO monta o
// calendário. Por isso ele vem primeiro na página, e não numa aba ao lado.
//
// A decisão do social media também é dado: descarte com motivo é como o sistema aprende o que não
// serve para este time.

interface Referencia {
  url: string; perfil?: string; seguidores?: number | null;
  outlier?: number | null; quando?: string; tipo?: string; nivel?: string;
}

interface Pauta {
  id: string; client_id: string; cliente_nome: string; nicho: string;
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

export default function RadarOportunidades() {
  const [pautas, setPautas] = useState<Pauta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [descartando, setDescartando] = useState<string | null>(null);
  const clients = useClientsStore((s) => s.clients);
  const { currentUser } = useRole();

  const carregar = useCallback(async () => {
    setErro(null);
    const res = await chamar<{ pautas?: Pauta[] }>("/api/radar/pautas?status=nova");
    // Falha não pode virar "nada novo": a seção sumia e ninguém sabia que o Radar estava fora.
    if (!res.ok) { setErro(res.erro); setPautas(null); return; }
    setPautas(res.data?.pautas ?? []);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const decidir = useCallback(async (pauta: Pauta, decisao: string, motivo?: MotivoDescarte) => {
    const id = pauta.id;
    setOcupado(id);
    try {
      // "Vou usar" vira card em Ideias já com a pauta no briefing. O create deduplica o mesmo
      // cliente+título por 2 min, então repetir o clique depois de uma falha não gera dois cards.
      let cardId: string | null = null;
      if (decisao === "usada") {
        const social = clients.find((c) => c.id === pauta.client_id)?.assignedSocial ?? null;
        const card = await chamar<{ id?: string }>("/api/content-cards/create", cardDaPauta(pauta, social, currentUser));
        if (!card.ok || !card.data?.id) { toast.error(`Não consegui criar o card: ${card.erro ?? "sem id"}`); return; }
        cardId = card.data.id;
      }
      const res = await chamar("/api/radar/pautas", { id, decisao, motivo });
      if (!res.ok) { toast.error(res.erro ?? "Não consegui registrar"); return; }
      if (cardId) {
        toast.success("Card criado em Ideias com a pauta no briefing.", {
          action: { label: "Abrir", onClick: () => { window.location.href = `/social?card=${cardId}`; } },
        });
      } else {
        toast.success(decisao === "guardada" ? "Guardada." : "Descartada — isso ajuda o Radar a melhorar.");
      }
      setDescartando(null);
      setPautas((p) => (p ?? []).filter((x) => x.id !== id));
    } finally { setOcupado(null); }
  }, [clients, currentUser]);

  // Agrupa por cliente: o social media trabalha cliente a cliente, não ideia a ideia.
  const porCliente = useMemo(() => {
    const m = new Map<string, Pauta[]>();
    for (const p of pautas ?? []) m.set(p.cliente_nome, [...(m.get(p.cliente_nome) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [pautas]);

  // Sem nada novo e sem estar carregando, a seção inteira some: espaço vazio com título é ruído na
  // página que o social usa todo dia.
  if (pautas?.length === 0) return null;

  if (erro) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <span>Não consegui carregar as oportunidades do Radar: {erro}</span>
        <button onClick={carregar} className="shrink-0 text-xs underline">Tentar de novo</button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">O que o mercado está mostrando</h2>
        <p className="text-xs text-muted-foreground">
          Conteúdos que performaram muito acima do normal no nicho dos nossos clientes, virados em pauta.
        </p>
      </div>

      <div className="space-y-6">
        {pautas === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="animate-spin" size={16} /> carregando…
          </div>
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
                      <TrendingUp size={13} className="text-lone-warning" />
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
                            onClick={() => decidir(p, "descartada", valor)}
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
                        onClick={() => decidir(p, "usada")}
                        disabled={ocupado === p.id}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-lone-success text-background hover:opacity-90 disabled:opacity-50"
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
                        onClick={() => decidir(p, "guardada")}
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
    </section>
  );
}
