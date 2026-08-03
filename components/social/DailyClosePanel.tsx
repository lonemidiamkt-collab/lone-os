"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, ChevronDown, ChevronRight, CalendarCheck } from "lucide-react";
import type { ContentCard } from "@/lib/types";

// 📅 Fechamento do dia — pro social ver, num relance, se JÁ tem arte de TODOS os clientes que têm
// post programado pra HOJE. Base: os cards com dueDate = hoje. Arte "pronta" = designer entregou,
// ou já tem imagem/capa, ou o card já está agendado/publicado. Puramente client-side (usa os cards
// que a página já carregou); não bate no banco.

/** Postagem é seg/qua/sex (playbook §4). Terça e quinta ninguém deve ter card — e sem isso o
 *  painel gritaria "22 sem card nenhum" toda terça, que é o tipo de alarme falso que faz o time
 *  parar de olhar justamente o painel criado pra evitar cliente esquecido. */
const DIAS_DE_POSTAGEM = new Set([1, 3, 5]);
/** Quarta é dia LEVE: nem todo cliente posta (playbook — quarta é vídeo pra quem grava). Cobrar
 *  card de todo mundo na quarta acusaria gente que está certa. */
const DIA_FIRME = new Set([1, 5]);

const hojeLocal = (): string => {
  // YYYY-MM-DD no fuso LOCAL do navegador (BRT) — due_date é uma date "seca".
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const artePronta = (c: ContentCard): boolean =>
  Boolean(c.designerDeliveredAt) || Boolean(c.imageUrl) || c.status === "scheduled" || c.status === "published";

interface ClienteDia {
  clientId: string;
  clientName: string;
  total: number;
  prontas: number;
  /** Próxima data JÁ agendada por ele (YYYY-MM-DD), quando não há card pra hoje. Quem adiantou
   *  arte pra quarta não está esquecido — é o contrário, está na frente. */
  proxima?: string;
}

export default function DailyClosePanel({ cards, clientes }: { cards: ContentCard[]; clientes: { id: string; name: string }[] }) {
  const [aberto, setAberto] = useState(false);

  const diaSemana = new Date().getDay();
  const ehDiaDePostagem = DIAS_DE_POSTAGEM.has(diaSemana);
  const cobraTodos = DIA_FIRME.has(diaSemana);

  const { lista, prontosCount, comPost, semCard, adiantados } = useMemo(() => {
    const hoje = hojeLocal();
    const doDia = cards.filter((c) => c.dueDate === hoje);
    // O QUE ELE JÁ AGENDOU PRA FRENTE. O painel julgava só pelo dia de hoje: quem adiantou arte
    // pra quarta aparecia igualzinho a quem não fez nada. São situações opostas — uma é
    // organização, a outra é esquecimento — e tratá-las igual ensina o time a ignorar a lista.
    const futuroPorCliente = new Map<string, string>();
    for (const c of cards) {
      if (!c.dueDate || c.dueDate <= hoje) continue;
      const atual = futuroPorCliente.get(c.clientId);
      if (!atual || c.dueDate < atual) futuroPorCliente.set(c.clientId, c.dueDate);
    }
    const map = new Map<string, ClienteDia>();

    // A CARTEIRA INTEIRA É A BASE, NÃO SÓ QUEM TEM CARD. Antes o denominador contava apenas os
    // clientes COM card do dia: quem foi esquecido não entrava na conta e o painel mostrava
    // "15/16" parecendo quase perfeito, escondendo 14 clientes sem nada. Foi assim que dois
    // clientes ficaram semanas sem post sem ninguém ver (Bazar Ribeiro, 35 dias).
    // Esquecer de criar o card É a falha — então ela tem que aparecer, não sumir.
    // Só nos dias FIRMES (seg/sex) a carteira inteira entra na conta. Na quarta o painel volta a
    // olhar apenas quem tem card, porque quarta nem todo cliente posta.
    if (cobraTodos) {
      for (const cl of clientes) {
        map.set(cl.id, {
          clientId: cl.id, clientName: cl.name || "Cliente", total: 0, prontas: 0,
          proxima: futuroPorCliente.get(cl.id),
        });
      }
    }

    for (const c of doDia) {
      const cur = map.get(c.clientId) ?? { clientId: c.clientId, clientName: c.clientName || "Cliente", total: 0, prontas: 0 };
      cur.total += 1;
      if (artePronta(c)) cur.prontas += 1;
      map.set(c.clientId, cur);
    }
    const lista = [...map.values()].sort((a, b) => {
      // Sem card nenhum é o pior caso — vai no topo, antes até de quem tem arte pendente.
      // 0 = não tem nada (pior) · 1 = tem card hoje faltando arte · 2 = adiantou pra frente
      // 3 = pronto. "Adiantado" fica ANTES de "pronto" só pra ficar visível, não como cobrança.
      const rank = (c: ClienteDia) =>
        c.total === 0 ? (c.proxima ? 2 : 0) : c.prontas >= c.total ? 3 : 1;
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.clientName.localeCompare(b.clientName);
    });
    const prontosCount = lista.filter((c) => c.total > 0 && c.prontas >= c.total).length;
    // "Sem card" agora é só quem não tem NADA — nem hoje, nem agendado pra frente.
    const semCard = lista.filter((c) => c.total === 0 && !c.proxima).length;
    const adiantados = lista.filter((c) => c.total === 0 && !!c.proxima).length;
    return { lista, prontosCount, comPost: lista.length, semCard, adiantados };
  }, [cards, clientes, cobraTodos]);

  // Terça e quinta não são dia de postagem: o painel some em vez de acusar o dia inteiro.
  if (!ehDiaDePostagem || comPost === 0) return null;

  const pct = Math.round((prontosCount / comPost) * 100);
  // Quem não tem card NENHUM também é pendência — e a mais grave: as outras esperam arte, essa
  // esperou alguém lembrar do cliente.
  // Quem adiantou pra frente sai da lista de pendência — cobrar quem se organizou é o caminho
  // mais rápido pro time deixar de confiar no painel.
  const pendentes = lista.filter((c) => (c.total === 0 && !c.proxima) || (c.total > 0 && c.prontas < c.total));
  const tudoPronto = pendentes.length === 0;

  return (
    <div className={`card border ${tudoPronto ? "border-lone-success-border/40" : "border-lone-warning/30"}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tudoPronto ? "bg-lone-success-bg text-lone-success" : "bg-lone-warning/10 text-lone-warning"}`}>
          {tudoPronto ? <CheckCircle2 size={18} /> : <CalendarCheck size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Fechamento do dia</span>
            <span className={`text-[11px] font-bold ${tudoPronto ? "text-lone-success" : "text-lone-warning"}`}>
              {prontosCount}/{comPost} clientes com arte
              {semCard > 0 && (
                <span className="ml-2 text-destructive">· {semCard} sem card nenhum</span>
              )}
              {adiantados > 0 && (
                <span className="ml-2 text-lone-success">· {adiantados} adiantado{adiantados > 1 ? "s" : ""}</span>
              )}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${tudoPronto ? "bg-lone-success" : "bg-lone-warning"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="text-muted-foreground">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>

      {tudoPronto && !aberto && (
        <p className="mt-2.5 text-xs text-lone-success flex items-center gap-1.5">
          <CheckCircle2 size={13} /> Tudo pronto! Todos os clientes com post hoje já têm arte. 🎉
        </p>
      )}

      {aberto && (
        <div className="mt-3 space-y-1.5">
          {pendentes.length === 0 ? (
            <p className="text-xs text-lone-success flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Todos os {comPost} clientes com post hoje já têm arte. 🎉
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Pendentes hoje ({pendentes.length})</p>
              {pendentes.map((c) => (
                <div key={c.clientId} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                  c.total === 0
                    ? "bg-destructive/[0.08] border-destructive/30"
                    : "bg-lone-warning/[0.06] border-lone-warning/20"
                }`}>
                  <span className="text-xs font-medium text-foreground truncate">{c.clientName}</span>
                  <span className="text-[11px] text-lone-warning flex items-center gap-1 shrink-0">
                    <Clock size={11} />
                    {c.total === 0 ? "sem card pra hoje" : `${c.total - c.prontas} de ${c.total} sem arte`}
                  </span>
                </div>
              ))}
            </>
          )}
          {adiantados > 0 && (
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">
                Adiantados ({adiantados})
              </p>
              {lista.filter((c) => c.total === 0 && c.proxima).map((c) => (
                <div key={c.clientId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-lone-success/[0.06] border border-lone-success/20 mb-1.5">
                  <span className="text-xs font-medium text-foreground truncate">{c.clientName}</span>
                  <span className="text-[11px] text-lone-success shrink-0">
                    já agendado p/ {c.proxima!.split("-").reverse().slice(0, 2).join("/")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {lista.some((c) => c.total > 0 && c.prontas >= c.total) && (
            <>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium pt-1.5">Prontos</p>
              <div className="flex flex-wrap gap-1.5">
                {lista.filter((c) => c.prontas >= c.total).map((c) => (
                  <span key={c.clientId} className="text-[11px] px-2 py-1 rounded-lg bg-lone-success-bg text-lone-success border border-lone-success-border/40 flex items-center gap-1">
                    <CheckCircle2 size={11} /> {c.clientName}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
