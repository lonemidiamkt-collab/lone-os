"use client";

// components/client/ficha/AbaRelacionamento.tsx — RELACIONAMENTO: a conversa com o cliente.
// Reuniões (agendar, pauta, registro), o NPS que ele deu depois delas, os check-ins do Agente, o
// humor dele sobre os resultados e a linha do tempo única (Leva 7C, N20). Juntou Reuniões, Histórico
// Operacional e o feedback do cliente (que ficava dentro de Crescimento).

import FeedbackCliente from "@/components/client-tabs/FeedbackCliente";
import ReunioesCliente from "@/components/ReunioesCliente";
import WhatsAppTemplates from "@/components/WhatsAppTemplates";
import HistoricoNps from "./HistoricoNps";
import LinhaDoTempo from "./LinhaDoTempo";
import { Secao, Vazio } from "./Secao";
import { SECAO } from "./abas";
import { dataCurta } from "./rotulos";
import type { FichaCtx } from "./tipos";

export default function AbaRelacionamento({ ctx }: { ctx: FichaCtx }) {
  const { client: c, role, currentUser, resumo } = ctx;
  const nome = c.nomeFantasia || c.name;

  return (
    <div className="space-y-8">
      <Secao id={SECAO.reunioes} titulo="Reuniões" semCard
        descricao="Agendar, escrever ou gerar a pauta, anexar material e registrar o que foi falado.">
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <ReunioesCliente clientId={c.id} clientName={nome}
              donos={{ social: c.assignedSocial || null, trafego: c.assignedTraffic || null, designer: c.assignedDesigner || null }} />
          </div>
          <div className="min-w-0 xl:col-span-2">
            <WhatsAppTemplates client={c} />
          </div>
        </div>
      </Secao>

      <Secao id={SECAO.nps} titulo="NPS depois da reunião"
        descricao="De 0 a 10, o quanto o cliente recomendaria a Lone Mídia — perguntado pelo Agente no grupo, depois de cada reunião.">
        {!resumo ? (ctx.resumoErro ? <Vazio>{ctx.resumoErro}</Vazio> : <div className="h-12 animate-pulse rounded-lg bg-muted" />)
          : <HistoricoNps itens={resumo.nps.itens} erro={resumo.nps.erro} />}
      </Secao>

      {resumo?.checkins && (
        <Secao id={SECAO.checkins} titulo="Check-ins" descricao="Perguntas de negócio do Agente ao cliente (ou ao time) e o que responderam.">
          {resumo.checkins.length === 0 ? <Vazio>Nenhum check-in ainda.</Vazio> : (
            <ul className="divide-y divide-border">
              {resumo.checkins.map((k) => (
                <li key={`${k.enviado_em}-${k.pergunta}`} className="py-2.5">
                  <p className="text-lone-body text-foreground">{k.pergunta}</p>
                  <p className="mt-0.5 text-lone-caption text-muted-foreground">
                    {k.origem === "cliente" ? "Perguntado ao cliente" : "Perguntado ao time"} em {dataCurta(k.enviado_em)}
                    {" · "}{k.status === "respondido" ? "respondido" : "esperando resposta"}
                  </p>
                  {k.resposta && <p className="mt-1 text-lone-body text-muted-foreground [overflow-wrap:anywhere]">“{k.resposta}”</p>}
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {role !== "designer" && (
        <Secao id={SECAO.humor} titulo="O que o cliente disse dos resultados" semCard>
          <FeedbackCliente clientId={c.id} />
        </Secao>
      )}

      <Secao id={SECAO.historico} titulo="Linha do tempo"
        descricao="Conversas, reuniões, produção, pedidos e mudanças de status — numa lista só.">
        <LinhaDoTempo clientId={c.id} clientName={c.name} currentUser={currentUser} />
      </Secao>
    </div>
  );
}
