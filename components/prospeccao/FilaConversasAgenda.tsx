"use client";

// Três abas pequenas que compartilham a mesma leitura do dashboard: Fila do dia, Conversas e Agenda.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Play } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { Button } from "@/components/ui/button";
import { Secao, Vazio, Erro, ChipEstagio, ChipClasse, fmtDataHora, fmtExtenso, haQuanto } from "./ui";
import type { Dash } from "./VisaoGeral";
import type { Linha } from "./Prospects";

function useDash(versao: number) {
  const [d, setD] = useState<Dash | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = async () => { const r = await chamar<Dash>("/api/prospeccao/dashboard"); if (!r.ok) { setErro(r.erro); return; } setErro(null); setD(r.data); };
  useEffect(() => { void carregar(); }, [versao]); // eslint-disable-line react-hooks/exhaustive-deps
  return { d, erro, carregar };
}

export function FilaDoDia({ abrir, versao, onChange }: { abrir: (id: string) => void; versao: number; onChange: () => void }) {
  const { d, erro, carregar } = useDash(versao);
  const [rodando, setRodando] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<Linha[] | null>(null);
  useEffect(() => { void (async () => { const r = await chamar<{ prospects: Linha[] }>("/api/prospeccao/prospects?estagio=icp_aprovado,enriquecido&limite=100"); if (r.ok) setCandidatos(r.data?.prospects ?? []); })(); }, [versao]);

  const rodar = async (rota: string, rotulo: string) => {
    setRodando(rotulo);
    const r = await chamar<Record<string, unknown>>(`/api/system/${rota}`, {});
    setRodando(null);
    if (!r.ok) { toast.error(r.erro ?? "Falhou"); return; }
    const pulado = r.data?.pulado as string | undefined;
    toast[pulado ? "warning" : "success"](pulado ? `${rotulo}: ${pulado}` : `${rotulo}: ok`);
    await carregar(); onChange();
  };

  return (
    <div className="space-y-5">
      <Erro texto={erro} />
      <Secao titulo="Fila de hoje" acao={
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={!!rodando} onClick={() => rodar("prospect-ranking", "Ranking")}><RefreshCw size={14} /> Montar fila agora</Button>
          <Button size="sm" disabled={!!rodando} onClick={() => rodar("prospect-outbound", "Abordagem")}><Play size={14} /> Disparar próxima</Button>
        </div>
      }>
        <p className="mb-3 text-lone-caption text-muted-foreground">Às 08:35 o agente pontua, passa pelo quality gate e escolhe os {d?.agente.campanha?.limite_dia ?? 10} melhores. Entre 09:00 e 11:00 ele manda uma abordagem por vez. Teto hoje: {d?.agente.teto.usado ?? 0}/{d?.agente.teto.limite ?? 10} · próximo envio: {d?.agente.proximo_envio ?? "—"}.{d && !d.agente.pode_abordar.ok ? ` Agora: ${d.agente.pode_abordar.motivo}.` : ""}</p>
        {!d ? <p className="text-lone-body text-muted-foreground">Carregando…</p> : d.fila_lista.length === 0 ? <Vazio texto="Fila vazia. Se há ICP aprovados abaixo, clique em 'Montar fila agora'." /> : (
          <ol className="divide-y divide-border">
            {d.fila_lista.map((p) => (
              <li key={p.id} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(p.id)}>
                <span className="w-6 text-right tabular-nums text-lone-caption text-muted-foreground">{p.ranking_pos || "—"}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-lone-body font-medium text-foreground">{p.nome}</div><div className="truncate text-lone-caption text-muted-foreground">{p.cidade ?? "—"} · {p.segmento ?? "—"} · {p.decisor_nome ? `decisor: ${p.decisor_nome}` : "abordagem genérica"}</div></div>
                <ChipClasse classe={p.classe} score={p.score} /><ChipEstagio estagio={p.estagio} />
              </li>
            ))}
          </ol>
        )}
      </Secao>
      <Secao titulo={`Aguardando ranking (${candidatos?.length ?? 0})`}>
        {!candidatos ? <p className="text-lone-body text-muted-foreground">Carregando…</p> : candidatos.length === 0 ? <Vazio texto="Nenhum candidato enriquecido. Rode a descoberta em Configuração." /> : (
          <ul className="divide-y divide-border">
            {candidatos.map((p) => (
              <li key={p.id} className="flex cursor-pointer items-center gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(p.id)}>
                <div className="min-w-0 flex-1"><div className="truncate text-lone-body text-foreground">{p.nome}</div><div className="truncate text-lone-caption text-muted-foreground">{p.cidade ?? "—"} · {p.segmento ?? "—"}{p.distancia_km != null ? ` · ${p.distancia_km} km` : ""}</div></div>
                <ChipClasse classe={p.classe} score={p.score} /><ChipEstagio estagio={p.estagio} />
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

export function Conversas({ abrir, versao }: { abrir: (id: string) => void; versao: number }) {
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { void (async () => {
    const r = await chamar<{ prospects: Linha[] }>("/api/prospeccao/prospects?ordem=recentes&limite=200&estagio=abordado,aguardando_resposta,followup,atendente,decisor_identificado,decisor_contatado,interesse,horario_proposto,aguardando_confirmacao,reuniao_agendada,handoff,momento_ruim,nutricao_30d,nutricao_90d,reuniao_realizada,no_show,proposta");
    if (!r.ok) { setErro(r.erro); return; }
    const ps = (r.data?.prospects ?? []).filter((p) => p.ultima_interacao_em || p.primeira_abordagem_em);
    ps.sort((a, b) => Number(b.precisa_humano) - Number(a.precisa_humano) || (b.ultima_interacao_em ?? "").localeCompare(a.ultima_interacao_em ?? ""));
    setLista(ps);
  })(); }, [versao]);
  return (
    <div className="space-y-4">
      <Erro texto={erro} />
      {!lista ? <p className="text-lone-body text-muted-foreground">Carregando…</p> : lista.length === 0 ? <Vazio texto="Nenhuma conversa ainda." /> : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {lista.map((p) => (
            <li key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50" onClick={() => abrir(p.id)}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.precisa_humano ? "bg-lone-warning" : p.ultima_msg_de === "prospect" ? "bg-lone-success" : "bg-muted-foreground/40"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate text-lone-body font-medium text-foreground">{p.nome}</span><ChipEstagio estagio={p.estagio} />{p.modo_agente !== "ativo" && <span className="text-lone-caption text-muted-foreground">{p.owner === "ROBERTO" ? "com o Roberto" : "agente pausado"}</span>}</div>
                <div className="truncate text-lone-caption text-muted-foreground">{p.precisa_humano ? p.motivo_humano : `${p.decisor_nome ?? "decisor não identificado"} · ${p.cidade ?? "—"}`}</div>
              </div>
              <div className="shrink-0 text-right text-lone-caption text-muted-foreground"><div>{p.ultima_interacao_em ? haQuanto(p.ultima_interacao_em) : "—"}</div><div>{p.ultima_msg_de === "prospect" ? "respondeu" : p.ultima_msg_de === "humano" ? "você" : "agente"}</div></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Agenda({ abrir, versao }: { abrir: (id: string) => void; versao: number }) {
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { void (async () => {
    const r = await chamar<{ prospects: Linha[] }>("/api/prospeccao/prospects?estagio=reuniao_agendada,handoff,reuniao_realizada,no_show,proposta,cliente&limite=300");
    if (!r.ok) { setErro(r.erro); return; }
    setLista((r.data?.prospects ?? []).filter((p) => p.reuniao_em).sort((a, b) => (a.reuniao_em ?? "").localeCompare(b.reuniao_em ?? "")));
  })(); }, [versao]);
  const agora = Date.now();
  const proximas = (lista ?? []).filter((p) => new Date(p.reuniao_em!).getTime() >= agora - 3600_000);
  const passadas = (lista ?? []).filter((p) => new Date(p.reuniao_em!).getTime() < agora - 3600_000).reverse();
  const Item = ({ p }: { p: Linha }) => (
    <li className="flex cursor-pointer items-center gap-3 py-2 hover:bg-accent/50" onClick={() => abrir(p.id)}>
      <div className="w-40 shrink-0"><div className="text-lone-body text-foreground">{fmtDataHora(p.reuniao_em)}</div><div className="text-lone-caption text-muted-foreground">{p.modalidade_preferida === "visita" && p.distancia_km != null ? `${p.distancia_km} km` : ""}</div></div>
      <div className="min-w-0 flex-1"><div className="truncate text-lone-body font-medium text-foreground">{p.nome}{p.decisor_nome ? ` — ${p.decisor_nome}` : ""}</div><div className="truncate text-lone-caption text-muted-foreground">{fmtExtenso(p.reuniao_em)} · {p.cidade ?? "—"}</div></div>
      <ChipEstagio estagio={p.estagio} />
    </li>
  );
  return (
    <div className="space-y-5">
      <Erro texto={erro} />
      <Secao titulo={`Próximas (${proximas.length})`}>{!lista ? <p className="text-lone-body text-muted-foreground">Carregando…</p> : proximas.length === 0 ? <Vazio texto="Nenhuma reunião ou visita marcada." /> : <ul className="divide-y divide-border">{proximas.map((p) => <Item key={p.id} p={p} />)}</ul>}</Secao>
      <Secao titulo={`Passadas (${passadas.length})`}>{passadas.length === 0 ? <Vazio texto="Nada ainda." /> : <ul className="divide-y divide-border">{passadas.map((p) => <Item key={p.id} p={p} />)}</ul>}</Secao>
    </div>
  );
}
