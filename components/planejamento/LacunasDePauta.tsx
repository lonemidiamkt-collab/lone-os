"use client";

// components/planejamento/LacunasDePauta.tsx — LACUNAS DE PAUTA (Leva 7B, N10): os dias de post
// (seg/qua/sex) das próximas duas semanas ainda sem card, por cliente, na cadência contratada. Um
// clique cria o card na Pauta com a data da lacuna — pelo mesmo caminho do "Novo conteúdo"
// (store → /api/content-cards/create), com chave de idempotência para o clique repetido.

import { useMemo, useState } from "react";
import { CalendarPlus, CalendarX2, ChevronDown, ChevronRight, Loader } from "lucide-react";
import { toast } from "sonner";
import { useContentStore } from "@/stores/useContentStore";
import { useRole } from "@/lib/context/RoleContext";
import { cn, todaySP } from "@/lib/utils";
import { statusDaEtapa } from "@/lib/conteudo/etapas";
import {
  chaveDaLacuna, ddmm, lacunasDePauta, tituloDaLacuna, SEMANAS_DE_LACUNA, type Lacuna, type LacunasDoCliente,
} from "@/lib/conteudo/lacunas";
import type { Client, ContentCard } from "@/lib/types";

export default function LacunasDePauta({ clientes, cards }: { clientes: Client[]; cards: ContentCard[] }) {
  const addContentCard = useContentStore((s) => s.addContentCard);
  const { currentUser, role } = useRole();
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState<Set<string>>(new Set());
  const hoje = todaySP();

  const lista = useMemo(() => lacunasDePauta({
    clientes: clientes.map((c) => ({
      id: c.id, nome: c.nomeFantasia || c.name, social: c.assignedSocial, postsGoal: c.postsGoal ?? null,
      perfil: c.perfilConteudo ?? null, serviceType: c.serviceType ?? null, active: c.active ?? null,
      pausedAt: c.pausedAt ?? null, draftStatus: c.draftStatus ?? null,
    })),
    cards: cards.map((c) => ({ clientId: c.clientId, dueDate: c.dueDate ?? null, archivedAt: c.archivedAt ?? null })),
    hoje,
  }), [clientes, cards, hoje]);

  const total = lista.reduce((n, l) => n + l.lacunas.length, 0);
  if (role === "designer") return null;

  const preencher = async (l: LacunasDoCliente, lacuna: Lacuna) => {
    const chave = chaveDaLacuna(l.clientId, lacuna.data);
    if (criando.has(chave)) return;
    const cliente = clientes.find((c) => c.id === l.clientId);
    setCriando((s) => new Set(s).add(chave));
    try {
      await addContentCard({
        title: tituloDaLacuna(lacuna),
        clientId: l.clientId,
        clientName: cliente?.name ?? l.nome,
        socialMedia: l.social ?? (role === "social" ? currentUser : ""),
        status: statusDaEtapa("pauta"),
        priority: "medium",
        format: lacuna.formatoSugerido,
        dueDate: lacuna.data,
      }, { chave, criadoPor: currentUser });
      toast.success(`Card criado na Pauta: ${l.nome}, ${lacuna.rotuloDia} ${ddmm(lacuna.data)}. Defina o tema no card.`);
    } catch {
      // o store já avisou
    } finally {
      setCriando((s) => { const n = new Set(s); n.delete(chave); return n; });
    }
  };

  const preencherTodas = async (l: LacunasDoCliente) => {
    for (const lacuna of l.lacunas) await preencher(l, lacuna);
  };

  return (
    <section aria-label="Lacunas de pauta" className="mb-4 rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-4 py-3 text-left">
        {aberto ? <ChevronDown size={14} className="text-muted-foreground" aria-hidden="true" /> : <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />}
        <CalendarX2 size={14} className={total > 0 ? "text-lone-warning" : "text-lone-success"} aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Lacunas de pauta</span>
        <span className="text-xs text-muted-foreground">próximas {SEMANAS_DE_LACUNA} semanas</span>
        <span className={cn("ml-auto text-[11px] px-2 py-0.5 rounded-md border font-medium tabular-nums",
          total > 0 ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border" : "bg-lone-success-bg text-lone-success border-lone-success-border")}>
          {total > 0 ? `${total} dia${total > 1 ? "s" : ""} sem post · ${lista.length} cliente${lista.length > 1 ? "s" : ""}` : "Tudo planejado"}
        </span>
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Dias de post (seg/qua/sex) sem card, na cadência contratada de cada cliente. Post em outro dia da semana conta para a cadência.
          </p>
          {lista.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dia de post vazio nas próximas {SEMANAS_DE_LACUNA} semanas.</p>}
          {lista.map((l) => (
            <div key={l.clientId} className="rounded-lg border border-border p-3 flex flex-wrap items-center gap-2">
              <div className="min-w-[160px] flex-1">
                <p className="text-sm font-medium text-foreground truncate">{l.nome}</p>
                <p className="text-[11px] text-muted-foreground">
                  {l.social ?? "Sem social"} · {l.porSemana} post{l.porSemana > 1 ? "s" : ""}/semana
                  {l.semanasVazias.length > 0 && <span className="text-destructive font-medium"> · {l.semanasVazias.length === 1 ? "uma semana" : `${l.semanasVazias.length} semanas`} sem nada</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {l.lacunas.map((lac) => {
                  const chave = chaveDaLacuna(l.clientId, lac.data);
                  const ocupado = criando.has(chave);
                  return (
                    <button key={lac.data} type="button" disabled={ocupado} onClick={() => void preencher(l, lac)}
                      title={`Criar card na Pauta para ${lac.rotuloDia} ${ddmm(lac.data)} (${lac.formatoSugerido})`}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-dashed border-border text-[11px] text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50">
                      {ocupado ? <Loader size={11} className="animate-spin" aria-hidden="true" /> : <CalendarPlus size={11} className="text-primary" aria-hidden="true" />}
                      {lac.rotuloDia.slice(0, 3)} {ddmm(lac.data)}{lac.formatoSugerido === "Reels" ? " · Reels" : ""}
                    </button>
                  );
                })}
                {l.lacunas.length > 1 && (
                  <button type="button" onClick={() => void preencherTodas(l)}
                    className="h-7 px-2.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors">
                    Preencher todas
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
