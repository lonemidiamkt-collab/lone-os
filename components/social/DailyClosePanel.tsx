"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, ChevronDown, ChevronRight, CalendarCheck } from "lucide-react";
import type { ContentCard } from "@/lib/types";

// 📅 Fechamento do dia — pro social ver, num relance, se JÁ tem arte de TODOS os clientes que têm
// post programado pra HOJE. Base: os cards com dueDate = hoje. Arte "pronta" = designer entregou,
// ou já tem imagem/capa, ou o card já está agendado/publicado. Puramente client-side (usa os cards
// que a página já carregou); não bate no banco.

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
}

export default function DailyClosePanel({ cards }: { cards: ContentCard[] }) {
  const [aberto, setAberto] = useState(false);

  const { lista, prontosCount, comPost } = useMemo(() => {
    const hoje = hojeLocal();
    const doDia = cards.filter((c) => c.dueDate === hoje);
    const map = new Map<string, ClienteDia>();
    for (const c of doDia) {
      const cur = map.get(c.clientId) ?? { clientId: c.clientId, clientName: c.clientName || "Cliente", total: 0, prontas: 0 };
      cur.total += 1;
      if (artePronta(c)) cur.prontas += 1;
      map.set(c.clientId, cur);
    }
    const lista = [...map.values()].sort((a, b) => {
      const af = a.prontas >= a.total ? 1 : 0;
      const bf = b.prontas >= b.total ? 1 : 0;
      if (af !== bf) return af - bf; // pendentes primeiro
      return a.clientName.localeCompare(b.clientName);
    });
    const prontosCount = lista.filter((c) => c.prontas >= c.total).length;
    return { lista, prontosCount, comPost: lista.length };
  }, [cards]);

  // Sem post programado pra hoje → não mostra nada (não polui o board em dia sem agenda).
  if (comPost === 0) return null;

  const tudoPronto = prontosCount === comPost;
  const pct = Math.round((prontosCount / comPost) * 100);
  const pendentes = lista.filter((c) => c.prontas < c.total);

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
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Faltando arte hoje ({pendentes.length})</p>
              {pendentes.map((c) => (
                <div key={c.clientId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-lone-warning/[0.06] border border-lone-warning/20">
                  <span className="text-xs font-medium text-foreground truncate">{c.clientName}</span>
                  <span className="text-[11px] text-lone-warning flex items-center gap-1 shrink-0">
                    <Clock size={11} /> {c.total - c.prontas} de {c.total} sem arte
                  </span>
                </div>
              ))}
            </>
          )}
          {lista.some((c) => c.prontas >= c.total) && (
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
