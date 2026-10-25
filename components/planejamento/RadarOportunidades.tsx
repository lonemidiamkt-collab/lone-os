"use client";

import { infoEtapa } from "@/lib/conteudo/etapas";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Check, X, Bookmark, TrendingUp, Loader2, CalendarDays, Undo2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { todaySP } from "@/lib/utils";
import { useClientsStore } from "@/stores/useClientsStore";
import { useRole } from "@/lib/context/RoleContext";
import { cardDaPauta, dataSugerida } from "@/components/planejamento/pauta-card";
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
//
// 25/10/2026 (auditoria 14.6): "Guardar para depois" e "Não serve" tinham sumiço sem volta — nenhuma tela
// listava as guardadas. Agora há a aba Guardadas (com "Voltar para novas") e Desfazer logo depois de
// guardar ou descartar.

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

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "2026-10-01" → "qua, 01/10". */
function dataCurta(ymd: string): string {
  const [a, m, d] = ymd.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export default function RadarOportunidades() {
  const [pautas, setPautas] = useState<Pauta[] | null>(null);
  const [guardadas, setGuardadas] = useState<Pauta[] | null>(null);
  const [erroGuardadas, setErroGuardadas] = useState<string | null>(null);
  const [aba, setAba] = useState<"novas" | "guardadas">("novas");
  // Datas que cada cliente já tem no board (do servidor) + as que esta sessão acabou de ocupar:
  // duas pautas do mesmo cliente usadas em seguida não caem no mesmo dia.
  const [ocupadas, setOcupadas] = useState<Record<string, string[]>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [descartando, setDescartando] = useState<string | null>(null);
  const clients = useClientsStore((s) => s.clients);
  const { currentUser } = useRole();

  const carregar = useCallback(async () => {
    setErro(null);
    const res = await chamar<{ pautas?: Pauta[]; ocupadas?: Record<string, string[]> }>("/api/radar/pautas?status=nova");
    // Falha não pode virar "nada novo": a seção sumia e ninguém sabia que o Radar estava fora.
    if (!res.ok) { setErro(res.erro); setPautas(null); return; }
    setPautas(res.data?.pautas ?? []);
    setOcupadas(res.data?.ocupadas ?? {});
    const g = await chamar<{ pautas?: Pauta[]; ocupadas?: Record<string, string[]> }>("/api/radar/pautas?status=guardada");
    if (!g.ok) { setErroGuardadas(g.erro); setGuardadas(null); return; }
    setErroGuardadas(null);
    setGuardadas(g.data?.pautas ?? []);
    setOcupadas((o) => ({ ...(g.data?.ocupadas ?? {}), ...o }));
  }, []);

  // Desfazer (guardar/descartar) e "Voltar para novas" (aba Guardadas): a pauta volta para as novas.
  const voltarParaNovas = useCallback(async (pauta: Pauta) => {
    const r = await chamar("/api/radar/pautas", { id: pauta.id, decisao: "nova" });
    if (!r.ok) { toast.error(`Não consegui voltar a pauta: ${r.erro}`); return; }
    setGuardadas((g) => (g ?? []).filter((x) => x.id !== pauta.id));
    setPautas((p) => (p ?? []).some((x) => x.id === pauta.id) ? p : [pauta, ...(p ?? [])]);
    toast.success("A pauta voltou para as novas.");
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const sugestao = useCallback(
    (p: Pauta) => dataSugerida(todaySP(), ocupadas[p.client_id] ?? []),
    [ocupadas],
  );

  const decidir = useCallback(async (pauta: Pauta, decisao: string, motivo?: MotivoDescarte) => {
    const id = pauta.id;
    setOcupado(id);
    try {
      // "Usar esta pauta" vira card na Pauta (etapa) já preenchido: cliente, título, pauta no briefing,
      // formato e a data sugerida — ninguém redigita nada. A chave de idempotência da pauta faz o
      // create devolver o MESMO card se o clique se repetir (ou no retry depois de uma falha).
      let cardId: string | null = null;
      let data: string | null = null;
      if (decisao === "usada") {
        const social = clients.find((c) => c.id === pauta.client_id)?.assignedSocial ?? null;
        data = sugestao(pauta);
        const card = await chamar<{ id?: string }>("/api/content-cards/create", cardDaPauta(pauta, social, currentUser, data));
        if (!card.ok || !card.data?.id) { toast.error(`Não consegui criar o card: ${card.erro ?? "sem id"}`); return; }
        cardId = card.data.id;
      }
      const res = await chamar("/api/radar/pautas", { id, decisao, motivo, cardId: cardId ?? undefined });
      if (!res.ok) { toast.error(res.erro ?? "Não consegui registrar"); return; }
      if (cardId && data) {
        const dia = data;
        setOcupadas((o) => ({ ...o, [pauta.client_id]: [...(o[pauta.client_id] ?? []), dia] }));
        toast.success(`Card criado na ${infoEtapa("pauta").rotulo} para ${dataCurta(dia)}, com a pauta no briefing.`, {
          action: { label: "Abrir", onClick: () => { window.location.href = `/social?card=${cardId}`; } },
        });
      } else {
        toast.success(decisao === "guardada" ? "Guardada — está na aba Guardadas." : "Descartada — isso ajuda o Radar a melhorar.", {
          duration: 8000, action: { label: "Desfazer", onClick: () => { void voltarParaNovas(pauta); } },
        });
      }
      setDescartando(null);
      setPautas((p) => (p ?? []).filter((x) => x.id !== id));
      setGuardadas((g) => {
        const sem = (g ?? []).filter((x) => x.id !== id);
        return decisao === "guardada" ? [pauta, ...sem] : sem;
      });
    } finally { setOcupado(null); }
  }, [clients, currentUser, sugestao, voltarParaNovas]);

  const lista = aba === "guardadas" ? guardadas : pautas;
  // Agrupa por cliente: o social media trabalha cliente a cliente, não ideia a ideia.
  const porCliente = useMemo(() => {
    const m = new Map<string, Pauta[]>();
    for (const p of lista ?? []) m.set(p.cliente_nome, [...(m.get(p.cliente_nome) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [lista]);

  // Sem nada novo NEM guardado, a seção inteira some: espaço vazio com título é ruído na página que o
  // social usa todo dia. Com guardadas, fica a aba para achá-las.
  if (pautas?.length === 0 && !guardadas?.length && !erroGuardadas) return null;

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">O que o mercado está mostrando</h2>
          <p className="text-xs text-muted-foreground">
            Conteúdos que performaram muito acima do normal no nicho dos nossos clientes, virados em pauta.
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5 text-xs" role="tablist" aria-label="Pautas do Radar">
          {(["novas", "guardadas"] as const).map((a) => (
            <button key={a} type="button" role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${aba === a ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {a === "novas" ? `Novas${pautas ? ` (${pautas.length})` : ""}` : `Guardadas${guardadas ? ` (${guardadas.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>
      {aba === "guardadas" && erroGuardadas && (
        <p className="text-sm text-destructive">Não consegui carregar as guardadas: {erroGuardadas}</p>
      )}
      {aba === "novas" && pautas?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nada novo do Radar agora.</p>
      )}
      {aba === "guardadas" && guardadas?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma pauta guardada.</p>
      )}

      <div className="space-y-6">
        {lista === null && !(aba === "guardadas" && erroGuardadas) && (
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
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => decidir(p, "usada")}
                        disabled={ocupado === p.id}
                        title="Cria o card na Pauta já com cliente, título, briefing, formato e data"
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-lone-success text-background hover:opacity-90 disabled:opacity-50"
                      >
                        {ocupado === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Usar esta pauta
                      </button>
                      <button
                        onClick={() => setDescartando(p.id)}
                        disabled={ocupado === p.id}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50"
                      >
                        <X size={14} /> Não serve
                      </button>
                      {aba === "guardadas" ? (
                        <button
                          onClick={() => void voltarParaNovas(p)}
                          disabled={ocupado === p.id}
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <Undo2 size={14} aria-hidden /> Voltar para novas
                        </button>
                      ) : (
                        <button
                          onClick={() => decidir(p, "guardada")}
                          disabled={ocupado === p.id}
                          title="guardar para depois (fica na aba Guardadas)"
                          aria-label="Guardar para depois"
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <Bookmark size={14} />
                        </button>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" title="Próximo dia de postagem (seg/qua/sex) sem card deste cliente">
                        <CalendarDays size={12} aria-hidden /> {dataCurta(sugestao(p))}
                      </span>
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
