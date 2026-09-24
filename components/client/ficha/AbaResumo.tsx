"use client";

// components/client/ficha/AbaResumo.tsx — a aba que abre a ficha. Responde, nesta ordem:
//   1. Como o cliente está (saúde com o porquê) e o que fazer agora (próxima ação).
//   2. O que está pendente AGORA (produção, pedidos de arte, pergunta sem resposta, tarefas…).
//   3. Quem cuida e o que ele contratou.
//   4. Atalhos.
// Nada aqui é calculado de novo: a saúde vem do /api/scores (via /api/clients/[id]/resumo) e a
// próxima ação de /api/clientes/proxima-acao — a mesma da tela Saúde da carteira.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckSquare, ClipboardList, KanbanSquare,
  MessageCircle, Palette, TrendingUp, type LucideIcon,
} from "lucide-react";
import ProximaAcaoEditor from "@/components/saude/ProximaAcaoEditor";
import { chamar } from "@/lib/api/chamar";
import { COR_NIVEL_SAUDE, ROTULO_NIVEL_SAUDE } from "@/lib/scores/health";
import { ETAPAS, estaBloqueado, etapaDoStatus, type Etapa } from "@/lib/conteudo/etapas";
import { categoriaNps, ROTULO_CATEGORIA } from "@/lib/cs/nps";
import { temTrafego } from "@/lib/clients/servico";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { cn, todaySP } from "@/lib/utils";
import type { ProximaAcao } from "@/lib/clientes/proxima-acao";
import type { ContentCard, DesignRequest, OnboardingItem, Task } from "@/lib/types";
import { FotoDoDono, donosDoCliente } from "./CabecalhoCliente";
import { Secao, Vazio } from "./Secao";
import { SECAO } from "./abas";
import { NOME_PERFIL_CONTEUDO, dataCurta, diasDesde, nomeServico } from "./rotulos";
import type { FichaCtx } from "./tipos";

/** Etapas que contam como "em produção" no Resumo (Agendado e No ar já saíram da mão do time). */
const EM_PRODUCAO: readonly Etapa[] = ["pauta", "com_designer", "revisao", "com_cliente"];

function ProximaAcaoDoCliente({ clientId }: { clientId: string }) {
  const [estado, setEstado] = useState<{ pa: ProximaAcao | null; podeEditar: boolean; erro: string | null; carregando: boolean }>(
    { pa: null, podeEditar: false, erro: null, carregando: true });
  useEffect(() => {
    let vivo = true;
    chamar<{ proximaAcao: ProximaAcao; podeEditar: boolean }>(`/api/clientes/proxima-acao?clientId=${clientId}`).then((r) => {
      if (!vivo) return;
      setEstado({ pa: r.data?.proximaAcao ?? null, podeEditar: !!r.data?.podeEditar, erro: r.ok ? null : r.erro, carregando: false });
    });
    return () => { vivo = false; };
  }, [clientId]);

  if (estado.carregando) return <div className="h-14 animate-pulse rounded-lg bg-muted" />;
  if (!estado.pa) return <Vazio>{estado.erro ?? "Sem próxima ação para este cliente."}</Vazio>;
  return (
    <ProximaAcaoEditor clientId={clientId} proximaAcao={estado.pa} podeEditar={estado.podeEditar}
      onAtualizar={(pa) => setEstado((e) => ({ ...e, pa }))} />
  );
}

function Pendencia({ icone: Icone, titulo, detalhe, tom = "neutro", onClick }: {
  icone: LucideIcon; titulo: string; detalhe?: string | null; tom?: "neutro" | "atencao" | "perigo"; onClick?: () => void;
}) {
  const corIcone = tom === "perigo" ? "text-destructive" : tom === "atencao" ? "text-lone-warning" : "text-muted-foreground";
  const corpo = (
    <>
      <Icone size={16} className={cn("mt-0.5 shrink-0", corIcone)} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-lone-body text-foreground">{titulo}</span>
        {detalhe && <span className="block text-lone-caption text-muted-foreground [overflow-wrap:anywhere]">{detalhe}</span>}
      </span>
      {onClick && <ArrowRight size={14} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent">
          {corpo}
        </button>
      ) : (
        <div className="flex items-start gap-3 py-2">{corpo}</div>
      )}
    </li>
  );
}

export default function AbaResumo({ ctx, cards, pedidos, tarefas, onboarding, faltaNoCadastro }: {
  ctx: FichaCtx;
  cards: ContentCard[];
  pedidos: DesignRequest[];
  tarefas: Task[];
  onboarding: OnboardingItem[];
  /** Só gestão (com os dados completos carregados): campos do cadastro que faltam. */
  faltaNoCadastro: string[] | null;
}) {
  const { client: c, resumo } = ctx;
  const { members } = useTeamMembers();
  const hoje = todaySP();

  // ── Produção ──────────────────────────────────────────────────────────────
  const ativos = cards.filter((k) => !k.archivedAt);
  const porEtapa = new Map<Etapa, ContentCard[]>();
  for (const k of ativos) {
    const e = etapaDoStatus(k.status);
    (porEtapa.get(e) ?? porEtapa.set(e, []).get(e)!).push(k);
  }
  const emProducao = EM_PRODUCAO.reduce((s, e) => s + (porEtapa.get(e)?.length ?? 0), 0);
  const atrasados = ativos.filter((k) => EM_PRODUCAO.includes(etapaDoStatus(k.status)) && k.dueDate && k.dueDate.slice(0, 10) < hoje).length;
  const bloqueados = ativos.filter((k) => estaBloqueado(k.status)).length;
  const pedidosAbertos = pedidos.filter((p) => p.status !== "done");
  const tarefasAbertas = tarefas.filter((t) => t.status !== "done");
  const obFeitos = onboarding.filter((i) => i.completed).length;

  const saude = resumo?.saude;
  const ultimaNps = resumo?.nps.itens.find((i) => i.nota !== null) ?? null;
  const donos = donosDoCliente(c);
  const desde = diasDesde(c.joinDate);
  const diasSemPost = diasDesde(c.lastPostDate);

  return (
    <div className="space-y-6">
      {/* 1 ── Saúde e próxima ação ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Saúde" className="lg:col-span-1"
          acoes={saude?.calculadaEm ? <span className="text-lone-caption text-muted-foreground">nota de {dataCurta(saude.calculadaEm)}</span> : undefined}>
          {!resumo && !ctx.resumoErro && <div className="h-20 animate-pulse rounded-lg bg-muted" />}
          {ctx.resumoErro && !resumo && <Vazio>{ctx.resumoErro}</Vazio>}
          {saude && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-lone-hero tabular-nums", COR_NIVEL_SAUDE[saude.nivel].texto)}>{saude.score ?? "—"}</span>
                <span className="text-lone-body text-foreground">{ROTULO_NIVEL_SAUDE[saude.nivel]}</span>
              </div>
              {saude.score !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className={cn("h-full rounded-full", COR_NIVEL_SAUDE[saude.nivel].barra)} style={{ width: `${saude.score}%` }} />
                </div>
              )}
              {saude.motivos.length > 0 ? (
                <ul className="space-y-1">
                  {saude.motivos.map((m) => (
                    <li key={m} className="flex gap-2 text-lone-body text-muted-foreground">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                      <span className="[overflow-wrap:anywhere]">{m}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-lone-body text-muted-foreground">Nada puxando a nota para baixo.</p>
              )}
              {ultimaNps && ultimaNps.nota !== null && (
                <button onClick={() => ctx.irPara("relacionamento", SECAO.nps)}
                  className="flex w-full items-center justify-between gap-2 border-t border-border pt-3 text-left text-lone-caption text-muted-foreground hover:text-foreground">
                  <span>NPS de {dataCurta(ultimaNps.respondidoEm)}: <span className="font-medium text-foreground">{ultimaNps.nota}</span> · {ROTULO_CATEGORIA[categoriaNps(ultimaNps.nota)]}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </Secao>

        <Secao id={SECAO.proximaAcao} titulo="Próxima ação" className="lg:col-span-2">
          <ProximaAcaoDoCliente clientId={c.id} />
        </Secao>
      </div>

      {/* 2 ── O que está pendente agora ──────────────────────────────────── */}
      <Secao id={SECAO.pendente} titulo="O que está pendente agora"
        acoes={
          <Link href={`/social?client=${c.id}`} className="inline-flex items-center gap-1 text-lone-caption text-primary hover:underline">
            Abrir no quadro <ArrowRight size={12} aria-hidden="true" />
          </Link>
        }>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {EM_PRODUCAO.map((e) => {
            const info = ETAPAS.find((x) => x.id === e)!;
            const n = porEtapa.get(e)?.length ?? 0;
            return (
              <button key={e} onClick={() => ctx.irPara("entregas", SECAO.producao)}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent">
                <span className="flex min-w-0 items-center gap-2 text-lone-body text-foreground">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", info.cor)} aria-hidden="true" />
                  {info.rotulo}
                </span>
                <span className={cn("text-lone-h2 tabular-nums", n ? "text-foreground" : "text-muted-foreground")}>{n}</span>
              </button>
            );
          })}
        </div>

        <ul className="mt-3 divide-y divide-border">
          {emProducao === 0 && <Pendencia icone={KanbanSquare} titulo="Nenhum card em produção" detalhe="Pauta, designer, revisão e aprovação do cliente estão vazios." />}
          {(atrasados > 0 || bloqueados > 0) && (
            <Pendencia icone={AlertTriangle} tom={atrasados ? "perigo" : "atencao"}
              titulo={[atrasados ? `${atrasados} card${atrasados > 1 ? "s" : ""} com prazo vencido` : null,
                bloqueados ? `${bloqueados} devolvido${bloqueados > 1 ? "s" : ""} pelo designer` : null].filter(Boolean).join(" · ")}
              onClick={() => ctx.irPara("entregas", SECAO.producao)} />
          )}
          {pedidosAbertos.length > 0 && (
            <Pendencia icone={Palette} titulo={`${pedidosAbertos.length} pedido${pedidosAbertos.length > 1 ? "s" : ""} de arte aberto${pedidosAbertos.length > 1 ? "s" : ""}`}
              detalhe={pedidosAbertos.slice(0, 3).map((p) => p.title).join(" · ")}
              onClick={() => ctx.irPara("entregas", SECAO.pedidosArte)} />
          )}
          {resumo?.perguntaAberta && (
            <Pendencia icone={MessageCircle} tom="atencao"
              titulo={`Pergunta do cliente sem resposta desde ${dataCurta(resumo.perguntaAberta.desde)}`}
              detalhe={`${resumo.perguntaAberta.autor ? `${resumo.perguntaAberta.autor}: ` : ""}“${resumo.perguntaAberta.texto}”`} />
          )}
          {(resumo?.pendenciasCliente ?? []).map((p) => (
            <Pendencia key={p.item} icone={CalendarClock} titulo={`Do cliente: ${p.item}`}
              detalhe={[p.desde ? `desde ${dataCurta(p.desde)}` : null, p.impacto].filter(Boolean).join(" · ") || null} />
          ))}
          {tarefasAbertas.length > 0 && (
            <Pendencia icone={CheckSquare} titulo={`${tarefasAbertas.length} tarefa${tarefasAbertas.length > 1 ? "s" : ""} em aberto`}
              detalhe={tarefasAbertas.slice(0, 3).map((t) => t.title).join(" · ")}
              onClick={() => ctx.irPara("entregas", SECAO.tarefas)} />
          )}
          {c.status === "onboarding" && onboarding.length > 0 && (
            <Pendencia icone={ClipboardList} titulo={`Onboarding: ${obFeitos} de ${onboarding.length} itens feitos`}
              onClick={() => ctx.irPara("admin", SECAO.onboarding)} />
          )}
          {faltaNoCadastro && faltaNoCadastro.length > 0 && (
            <Pendencia icone={ClipboardList} tom="atencao" titulo={`Cadastro incompleto: ${faltaNoCadastro.length} ${faltaNoCadastro.length === 1 ? "item" : "itens"}`}
              detalhe={faltaNoCadastro.join(" · ")} onClick={() => ctx.irPara("admin", SECAO.cadastro)} />
          )}
        </ul>
      </Secao>

      {/* 3 ── Quem cuida e o que contratou ───────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao id={SECAO.quemCuida} titulo="Quem cuida" className="lg:col-span-2">
          {donos.length === 0 ? <Vazio>Ninguém atribuído ainda — defina em Admin → Cadastro.</Vazio> : (
            <ul className="grid gap-3 sm:grid-cols-3">
              {donos.map((d) => (
                <li key={d.papel} className="flex items-center gap-3">
                  <FotoDoDono nome={d.nome} size={40} membros={members} />
                  <span className="min-w-0">
                    <span className="block truncate text-lone-body font-medium text-foreground" title={d.nome}>{d.nome}</span>
                    <span className="block text-lone-caption text-muted-foreground">{d.papel}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {c.contactName && (
            <p className="mt-4 border-t border-border pt-3 text-lone-body text-muted-foreground">
              Do lado do cliente: <span className="text-foreground">{c.contactName}</span>{c.contactRole ? ` (${c.contactRole})` : ""}
            </p>
          )}
        </Secao>

        <Secao titulo="Serviço">
          <dl className="space-y-2 text-lone-body">
            {[
              ["Contratou", nomeServico(c) ?? "Não definido"],
              ["Conteúdo", c.perfilConteudo ? NOME_PERFIL_CONTEUDO[c.perfilConteudo] ?? c.perfilConteudo : "Não definido"],
              ["Cliente desde", c.joinDate ? `${dataCurta(c.joinDate)}${desde !== null ? ` · ${desde} dias` : ""}` : "—"],
              ["Último post", c.lastPostDate ? `${diasSemPost} dia${diasSemPost === 1 ? "" : "s"} atrás` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn("text-right text-foreground", k === "Último post" && diasSemPost !== null && diasSemPost > 7 && "text-destructive")}>{v}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      </div>

      {/* 4 ── Atalhos ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {ctx.role !== "comercial" && (
          <button onClick={ctx.pedirArte} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
            <Palette size={15} aria-hidden="true" /> Pedir arte
          </button>
        )}
        <button onClick={() => ctx.irPara("relacionamento", SECAO.reunioes)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
          <CalendarClock size={15} aria-hidden="true" /> Reuniões
        </button>
        {temTrafego({ service_type: c.serviceType }) && (
          <Link href="/traffic" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
            <TrendingUp size={15} aria-hidden="true" /> Tráfego
          </Link>
        )}
        {c.phone && (
          <a href={`https://wa.me/55${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent">
            <MessageCircle size={15} className="text-whatsapp" aria-hidden="true" /> WhatsApp do contato
          </a>
        )}
      </div>
    </div>
  );
}
