"use client";

import Link from "next/link";
import { Palette, ChevronRight, Clock } from "lucide-react";
import type { ContentCard } from "@/lib/types";

/** "há Xmin / Xh / Xd" a partir de um ISO. */
function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

/**
 * Bloco da Home: artes que o designer já entregou e o social ainda NÃO confirmou.
 * Clique em um item abre o card direto no Kanban (/social?card=<id>) para ver a
 * arte e enviar ao cliente. Resolve a dor de "não sei o que já está pronto".
 * Esconde-se quando não há nada pendente.
 */
export default function DesignDeliveriesAlert({ cards }: { cards: ContentCard[] }) {
  const ready = cards
    .filter((c) => c.designerDeliveredAt && !c.socialConfirmedAt && c.status !== "published")
    .sort((a, b) => (b.designerDeliveredAt ?? "").localeCompare(a.designerDeliveredAt ?? ""));

  if (ready.length === 0) return null;

  return (
    <div className="rounded-xl border border-lone-brand/20 bg-lone-brand/[0.03] p-4">
      <p className="text-lone-eyebrow font-inter text-lone-brand mb-3 flex items-center gap-1.5 tracking-[1.5px]">
        <Palette size={11} aria-hidden="true" /> ARTES PRONTAS DO DESIGNER · {ready.length} AGUARDANDO VOCÊ
      </p>
      <div className="flex flex-col gap-1.5">
        {ready.slice(0, 6).map((c) => (
          <Link
            key={c.id}
            href={`/social?card=${c.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-lone-border bg-lone-bg-card px-3 py-2 hover:border-lone-brand/40 hover:bg-lone-brand/[0.04] transition-all group"
          >
            <div className="min-w-0">
              <p className="text-lone-body font-inter font-medium text-lone-text-primary truncate">{c.title}</p>
              <p className="text-lone-caption font-inter text-lone-text-tertiary truncate">
                {c.clientName}
                {c.designerDeliveredBy ? ` · por ${c.designerDeliveredBy}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lone-caption font-inter text-lone-text-tertiary flex items-center gap-1 whitespace-nowrap">
                <Clock size={10} aria-hidden="true" /> {timeAgo(c.designerDeliveredAt!)}
              </span>
              <ChevronRight size={16} className="text-lone-text-disabled group-hover:text-lone-brand transition-colors" aria-hidden="true" />
            </div>
          </Link>
        ))}
        {ready.length > 6 && (
          <Link href="/social" className="text-lone-caption font-inter text-lone-brand hover:underline px-3 py-1">
            +{ready.length - 6} mais →
          </Link>
        )}
      </div>
    </div>
  );
}
