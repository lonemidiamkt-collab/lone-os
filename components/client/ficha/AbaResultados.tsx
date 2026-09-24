"use client";

// components/client/ficha/AbaResultados.tsx — RESULTADOS: anúncios (período × anterior), crescimento
// do negócio do cliente, prova social, os criativos que estão funcionando, a análise da IA e o portal.
// Juntou Crescimento, Inteligência Criativa (a parte dos anúncios), Análise IA, Portal e a Prova Social
// que ficava na Visão Geral. Designer continua sem os números de negócio (como era a aba Crescimento).

import { toast } from "sonner";
import CrescimentoTab from "@/components/fichaviva/CrescimentoTab";
import InteligenciaCriativa from "@/components/client-tabs/InteligenciaCriativa";
import AIAuditsTab from "@/components/client-tabs/AIAuditsTab";
import PortalManagementCard from "@/components/PortalManagementCard";
import { useClientsStore } from "@/stores/useClientsStore";
import { ROTULO_RESULTADO_ANUNCIO, TITULO_RESULTADO_ANUNCIO } from "@/lib/scores/resultado-anuncio";
import { temTrafego } from "@/lib/clients/servico";
import type { ClientStatus } from "@/lib/types";
import EntregasDoMes from "./EntregasDoMes";
import PainelAnuncios from "./PainelAnuncios";
import ProvaSocial from "./ProvaSocial";
import { Secao, Vazio } from "./Secao";
import { SECAO } from "./abas";
import type { FichaCtx } from "./tipos";

const OPCOES_STATUS: ClientStatus[] = ["onboarding", "good", "average", "at_risk"];

export default function AbaResultados({ ctx }: { ctx: FichaCtx }) {
  const { client: c, role, currentUser, isAdmin } = ctx;
  const updateClientStatus = useClientsStore((s) => s.updateClientStatus);
  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);
  const veNegocio = role !== "designer";
  const comTrafego = temTrafego({ service_type: c.serviceType });
  // Quem fecha o mês com o cliente (a rota tem o mesmo recorte).
  const fechaMes = ["admin", "manager", "social", "traffic"].includes(role);
  const arquivo = (c.nomeFantasia || c.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="space-y-8">
      {fechaMes && (
        <Secao id={SECAO.entregasMes} titulo="O que entregamos no mês"
          descricao="Posts no ar, artes, anúncios contra a meta, reuniões e criativos vencedores — em PDF e com o rascunho da mensagem.">
          <EntregasDoMes clientId={c.id} nomeArquivo={arquivo} />
        </Secao>
      )}

      {veNegocio && (
        <Secao id={SECAO.anuncios} titulo="Anúncios" semCard
          descricao={comTrafego ? "Conversas, investimento e custo — o mesmo número que o cliente vê no portal." : undefined}
          acoes={isAdmin ? (
            <label className="flex items-center gap-2 text-lone-caption text-muted-foreground">
              {TITULO_RESULTADO_ANUNCIO}
              <select value={c.status} aria-label={TITULO_RESULTADO_ANUNCIO}
                title="Vem do CPL x meta (régua de sexta). Não é risco de churn — isso é a Saúde."
                onChange={(e) => {
                  updateClientStatus(ctx.clientId, e.target.value as ClientStatus, currentUser)
                    .catch((err: unknown) => toast.error(`Não consegui mudar: ${err instanceof Error ? err.message : "erro"}`));
                }}
                className="h-8 rounded-lg border border-input bg-card px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring">
                {OPCOES_STATUS.map((v) => <option key={v} value={v}>{ROTULO_RESULTADO_ANUNCIO[v]}</option>)}
              </select>
            </label>
          ) : undefined}>
          {comTrafego ? <PainelAnuncios clientId={c.id} /> : (
            <div className="rounded-xl border border-border bg-card p-4">
              <Vazio>Este cliente não contratou gestão de anúncios (serviço: {c.serviceType ?? "não definido"}).</Vazio>
            </div>
          )}
        </Secao>
      )}

      {veNegocio && (
        <Secao id={SECAO.crescimento} titulo="Crescimento do negócio" semCard
          descricao="Faturamento, vendas e ticket que o cliente informa — com a meta.">
          <CrescimentoTab client={c} currentUser={currentUser} />
        </Secao>
      )}

      <Secao id={SECAO.provaSocial} titulo="Prova social">
        <ProvaSocial clientId={c.id} currentUser={currentUser} />
      </Secao>

      <Secao id={SECAO.inteligencia} titulo="Criativos" semCard>
        <InteligenciaCriativa clientId={c.id} role={role} parte="anuncios" />
      </Secao>

      <Secao id={SECAO.analiseIa} titulo="Análise da IA" semCard>
        <AIAuditsTab clientId={c.id} isAdmin={isAdmin} />
      </Secao>

      {isAdmin && (
        <Secao id={SECAO.portal} titulo="Portal do cliente" semCard descricao="O link de resultados que o cliente abre.">
          <div className="max-w-xl">
            <PortalManagementCard client={c} onUpdate={(patch) => patchClientLocal(c.id, patch)} />
          </div>
        </Secao>
      )}
    </div>
  );
}
