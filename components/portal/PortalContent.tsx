"use client";

// Seção de artes do portal do cliente. Mostra as artes ENTREGUES; nas mais novas, o cliente pode
// PEDIR AJUSTE por escrito — e, desde a Leva 7D (N35), também nas já aprovadas ou agendadas que ainda
// não foram ao ar ("Pedir alteração" na galeria). A aprovação é no WhatsApp com o time (decisão de 31/08) — o botão de
// aprovar só aparece com PORTAL_APROVACAO_CLIENTE=on.
//
// Período (24/09): "Conteúdo entregue" mostrava uma arte de 29/jul na visão de 7 dias. Agora segue o
// período escolhido na aba (pela data de ENTREGA); se nada foi entregue nele, a seção diz isso e
// mostra as últimas entregas com esse nome — nunca finge que a arte antiga é do período.

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, CheckCircle2, Palette, Pencil, Sparkles } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { dentroDaJanela, diaEmSP, rotuloDia } from "@/lib/portal/formatos";
import Skeleton from "@/components/ui/Skeleton";
import { Cartao, CabecalhoSecao, entrada } from "./ui";
import PedirAlteracao from "./PedirAlteracao";

interface Item {
  id: string; title: string; format: string; status: string; imageUrl: string; date: string | null;
  /** Quando o time entregou a arte (ausente em resposta antiga da rota). */
  entregueEm?: string | null;
  pendente: boolean; aprovada: boolean;
  /** N35: aceita "Pedir alteração" (entregue/aprovada/agendada, ainda não no ar). Ausente em resposta antiga. */
  podeAlterar?: boolean;
}

const ULTIMAS_ENTREGAS = 4;

const dataDoItem = (it: Item) => it.entregueEm || it.date;
const rotuloData = (d: string | null | undefined) => (d ? rotuloDia(diaEmSP(d)) : "");

/**
 * `aprovacaoLigada` chega desligado por padrão: o cliente vê a arte e pode PEDIR AJUSTE, mas o
 * aceite final volta a ser com o time (Roberto, 31/08: "o cliente aprovar pelo painel ainda não").
 * O botão existia desde julho, antes dessa decisão.
 */
export default function PortalContent({ token, aprovacaoLigada = false, dias = 7 }: {
  token: string;
  aprovacaoLigada?: boolean;
  /** Janela da aba (7, 14 ou 30 dias) — a mesma do Instagram. */
  dias?: number;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [ajusteOpen, setAjusteOpen] = useState<string | null>(null);
  const [ajusteText, setAjusteText] = useState("");
  const [flash, setFlash] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setErroCarga(null);
    chamar<{ items: Item[] }>(`/api/portal/${token}/content`).then((r) => {
      if (!alive) return;
      // Falha NÃO é "nenhuma arte": antes a seção sumia e o cliente achava que nada tinha sido entregue.
      if (!r.ok || !r.data) { setErroCarga("Não consegui carregar suas artes agora."); return; }
      setItems(r.data.items ?? []);
    });
    return () => { alive = false; };
  }, [token, tentativa]);

  const act = useCallback(async (id: string, action: "approve" | "ajuste", comment?: string) => {
    setBusy(id);
    try {
      // Rota pública por token: `fetch` puro mesmo, mas com o mesmo cuidado — é a tela do CLIENTE,
      // e um "cliquei em aprovar e não aconteceu nada" aqui é pior que em qualquer tela interna.
      const r = await chamar(`/api/portal/${token}/approve`, { cardId: id, action, comment });
      if (!r.ok) {
        setFlash({ id, msg: r.status === 0 ? "Sem conexão agora. Tenta de novo em instantes?" : (r.erro || "Não consegui enviar agora. Tenta de novo em instantes?") });
        setTimeout(() => setFlash(null), 5000);
        return;
      }
      setItems((prev) => (prev ?? []).map((it) => it.id === id
        ? { ...it, pendente: false, aprovada: action === "approve" ? true : it.aprovada } : it));
      setFlash({ id, msg: action === "approve" ? "Aprovada! Avisamos o time." : "Ajuste enviado! Já vamos cuidar." });
      setAjusteOpen(null); setAjusteText("");
      setTimeout(() => setFlash(null), 4000);
    } finally { setBusy(null); }
  }, [token]);

  if (erroCarga) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3.5 text-sm text-lone-warning" role="alert">
        <span className="min-w-[200px] flex-1">{erroCarga}</span>
        <button onClick={() => setTentativa((t) => t + 1)}
          className="min-h-[44px] rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (items === null) {
    return (
      <Cartao className="p-4 sm:p-5" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      </Cartao>
    );
  }
  if (items.length === 0) return null;

  const pendentes = items.filter((i) => i.pendente);
  const entregues = items.filter((i) => !i.pendente);
  const doPeriodo = entregues.filter((i) => dentroDaJanela(dataDoItem(i), dias));
  const semNadaNoPeriodo = doPeriodo.length === 0;
  const galeria = semNadaNoPeriodo
    ? [...entregues].sort((a, b) => (dataDoItem(b) ?? "").localeCompare(dataDoItem(a) ?? "")).slice(0, ULTIMAS_ENTREGAS)
    : doPeriodo;

  return (
    <div className="space-y-5">
      {/* Arte entregue esperando o olhar do cliente */}
      {pendentes.length > 0 && (
        <motion.section variants={entrada} initial="oculto" animate="visivel" className="space-y-3">
          <CabecalhoSecao
            icone={Sparkles}
            titulo={<>Artes novas para você <span className="rounded-full bg-primary/10 px-2 py-0.5 text-lone-caption font-medium tabular-nums text-lone-brand-soft">{pendentes.length}</span></>}
            descricao="Veja com calma e, se quiser mudar algo, peça um ajuste por aqui."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pendentes.map((it) => (
              <Cartao key={it.id} className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.title} className="aspect-square w-full bg-muted object-cover" loading="lazy" />
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  <p className="mb-3 text-lone-caption text-muted-foreground">{it.format}{it.date ? ` · ${rotuloData(it.date)}` : ""}</p>

                  {flash?.id === it.id ? (
                    <p className="py-2 text-sm font-medium text-lone-success" role="status">{flash.msg}</p>
                  ) : ajusteOpen === it.id ? (
                    <div className="space-y-2">
                      <textarea autoFocus value={ajusteText} onChange={(e) => setAjusteText(e.target.value)} rows={3}
                        aria-label="O que você quer que a gente ajuste?"
                        placeholder="O que você quer que a gente ajuste?"
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
                      <div className="flex gap-2">
                        <button disabled={busy === it.id || !ajusteText.trim()} onClick={() => act(it.id, "ajuste", ajusteText)}
                          className="min-h-[44px] flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy === it.id ? "Enviando…" : "Enviar ajuste"}</button>
                        <button onClick={() => { setAjusteOpen(null); setAjusteText(""); }}
                          className="min-h-[44px] rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {aprovacaoLigada && <button disabled={busy === it.id} onClick={() => act(it.id, "approve")}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-lone-success py-2.5 text-sm font-medium text-background disabled:opacity-50"><Check size={16} aria-hidden="true" /> Aprovar</button>}
                      <button disabled={busy === it.id} onClick={() => setAjusteOpen(it.id)}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-2.5 text-sm font-medium text-secondary-foreground hover:bg-accent disabled:opacity-50"><Pencil size={15} aria-hidden="true" /> Pedir ajuste</button>
                    </div>
                  )}
                </div>
              </Cartao>
            ))}
          </div>
        </motion.section>
      )}

      {/* Conteúdo entregue no período — ou, sem nada nele, as últimas entregas (com esse nome) */}
      {galeria.length > 0 && (
        <motion.section variants={entrada} initial="oculto" animate="visivel" custom={1} className="space-y-3">
          <CabecalhoSecao
            icone={Palette}
            titulo={semNadaNoPeriodo ? "Últimas entregas" : "Conteúdo entregue"}
            descricao={semNadaNoPeriodo
              ? `Nenhuma arte entregue nos últimos ${dias} dias. Estas são as mais recentes.`
              : `${doPeriodo.length} ${doPeriodo.length === 1 ? "arte entregue" : "artes entregues"} nos últimos ${dias} dias`}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {galeria.map((it) => (
              <Cartao key={it.id} className="relative overflow-hidden">
                {it.aprovada && (
                  <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-lone-success px-1.5 py-0.5 text-[10px] font-medium text-background">
                    <CheckCircle2 size={11} aria-hidden /> Aprovada
                  </span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={it.title} className="aspect-square w-full bg-muted object-cover" loading="lazy" />
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium">{it.title}</p>
                  <p className="mt-0.5 truncate text-lone-caption text-muted-foreground">
                    {[it.format, it.entregueEm ? `entregue ${rotuloData(it.entregueEm)}` : rotuloData(it.date)].filter(Boolean).join(" · ")}
                  </p>
                  {it.podeAlterar && (
                    <div className="mt-2">
                      <PedirAlteracao token={token} cardId={it.id} titulo={it.title} compacto />
                    </div>
                  )}
                </div>
              </Cartao>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
