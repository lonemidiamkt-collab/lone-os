"use client";

// components/client/ficha/CabecalhoCliente.tsx — o topo da ficha: logo, nome, serviço, quem cuida,
// a saúde e as ações principais. É o que se lê em 3 segundos; o resto mora nas abas.

import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, KanbanSquare, Loader2, Palette, Pause, Pencil } from "lucide-react";
import { FotoPessoa } from "@/components/ui/FotoPessoa";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { COR_NIVEL_SAUDE, ROTULO_NIVEL_SAUDE, type NivelSaude } from "@/lib/scores/health";
import { ROTULO_RESULTADO_ANUNCIO, TITULO_RESULTADO_ANUNCIO } from "@/lib/scores/resultado-anuncio";
import { rotuloPausa } from "@/lib/clients/pausa";
import { getAttentionColor, getAttentionLabel, getStatusColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Client } from "@/lib/types";
import { nomeDaEmpresa, nomeServico } from "./rotulos";

export interface Dono { papel: string; nome: string }

/** Quem cuida do cliente, na ordem de quem o cliente mais fala: social, tráfego, designer. */
export function donosDoCliente(c: Pick<Client, "assignedSocial" | "assignedTraffic" | "assignedDesigner">): Dono[] {
  return [
    { papel: "Social media", nome: c.assignedSocial },
    { papel: "Tráfego", nome: c.assignedTraffic },
    { papel: "Designer", nome: c.assignedDesigner },
  ].filter((d): d is Dono => !!d.nome?.trim());
}

/**
 * Foto da pessoa pelo nome. O perfil do time dá o id do avatar (sem perfil, o nome serve). Quem
 * mostra várias fotos passa `membros` de UM useTeamMembers — senão cada foto faria a própria busca.
 */
export function FotoDoDono({ nome, size = 28, membros }: { nome: string; size?: number; membros: readonly { id: string; name: string }[] }) {
  const m = membros.find((x) => x.name.trim().toLowerCase() === nome.trim().toLowerCase());
  return <FotoPessoa perfil={{ id: m?.id ?? nome, name: nome }} size={size} />;
}

export function ChipSaude({ nivel, score }: { nivel: NivelSaude; score: number | null }) {
  const cor = COR_NIVEL_SAUDE[nivel];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-lone-caption text-foreground"
      title="Saúde do cliente (100 = saudável), recalculada todo dia"
    >
      <span className={cn("h-2 w-2 rounded-full", cor.barra)} aria-hidden="true" />
      <span className="font-medium">{ROTULO_NIVEL_SAUDE[nivel]}</span>
      {score !== null && <span className={cn("tabular-nums", cor.texto)}>{score}</span>}
    </span>
  );
}

export default function CabecalhoCliente(p: {
  client: Client;
  saude: { nivel: NivelSaude; score: number | null };
  isAdmin: boolean;
  /** Quem a rota de pedido de arte aceita (gestão, social, designer, tráfego). */
  podePedirArte: boolean;
  onEditar: () => void;
  onPedirArte: () => void;
  onLinkOnboarding: () => void;
  gerandoLink: boolean;
  linkCopiado: boolean;
}) {
  const { client: c } = p;
  const { members } = useTeamMembers();
  const nome = nomeDaEmpresa(c);
  const servico = nomeServico(c);
  const donos = donosDoCliente(c);
  const pausa = rotuloPausa({ paused_at: c.pausedAt, paused_until: c.pausedUntil, paused_reason: c.pausedReason });
  const fatos = [servico, c.nicho || c.industry, c.contactName && `Contato: ${c.contactName}${c.contactRole ? ` (${c.contactRole})` : ""}`]
    .filter(Boolean).join(" · ");

  return (
    <header className="border-b border-border bg-card px-4 pb-4 pt-3 sm:px-6">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-lone-caption text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={14} aria-hidden="true" /> Clientes
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {c.docLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.docLogo} alt={`Logo ${nome}`} className="h-12 w-12 shrink-0 rounded-xl border border-border bg-background object-contain p-1 sm:h-14 sm:w-14" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted sm:h-14 sm:w-14" aria-hidden="true">
              <span className="text-lone-h1 text-muted-foreground">{nome.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-lone-h1 tracking-tight text-foreground [overflow-wrap:anywhere]">{nome}</h1>
            {fatos && <p className="text-lone-body text-muted-foreground">{fatos}</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              <ChipSaude nivel={p.saude.nivel} score={p.saude.score} />
              <span className={`badge border text-lone-caption ${getStatusColor(c.status)}`}
                title="Vem do CPL x meta (régua de sexta). Não é risco de churn — isso é a Saúde.">
                {TITULO_RESULTADO_ANUNCIO}: {ROTULO_RESULTADO_ANUNCIO[c.status] ?? c.status}
              </span>
              {c.attentionLevel && (
                <span className={`badge border text-lone-caption ${getAttentionColor(c.attentionLevel)}`}>
                  Atenção: {getAttentionLabel(c.attentionLevel)}
                </span>
              )}
              {(c.tags ?? []).map((tag) => (
                <span key={tag} className={`badge border text-lone-caption ${tag === "Premium" ? "tag-premium" : tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"}`}>
                  {tag}
                </span>
              ))}
              {pausa && (
                <span className="inline-flex items-center gap-1 rounded-full border border-lone-warning-border bg-lone-warning-bg px-2.5 py-1 text-lone-caption text-lone-warning">
                  <Pause size={11} aria-hidden="true" /> {pausa}
                </span>
              )}
              {c.active === false && (
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-lone-caption text-muted-foreground">Arquivado</span>
              )}
            </div>
            {donos.length > 0 && (
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1" aria-label="Quem cuida">
                {donos.map((d) => (
                  <li key={d.papel} className="flex items-center gap-2">
                    <FotoDoDono nome={d.nome} size={24} membros={members} />
                    <span className="text-lone-caption leading-tight">
                      <span className="block text-foreground">{d.nome}</span>
                      <span className="block text-muted-foreground">{d.papel}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {p.podePedirArte && (
            <button onClick={p.onPedirArte}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <Palette size={15} aria-hidden="true" /> Pedir arte
            </button>
          )}
          <Link href={`/social?client=${c.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
            <KanbanSquare size={15} aria-hidden="true" /> Abrir no quadro
          </Link>
          {p.isAdmin && (
            <>
              <button onClick={p.onEditar}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
                <Pencil size={15} aria-hidden="true" /> Editar
              </button>
              <button onClick={p.onLinkOnboarding} disabled={p.gerandoLink}
                title="Gera o link de preenchimento do cadastro e copia"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50">
                {p.gerandoLink ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  : p.linkCopiado ? <Check size={15} className="text-lone-success" aria-hidden="true" />
                  : <ExternalLink size={15} aria-hidden="true" />}
                {p.linkCopiado ? "Link copiado" : "Link de onboarding"}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
