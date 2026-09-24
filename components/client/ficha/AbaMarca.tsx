"use client";

// components/client/ficha/AbaMarca.tsx — MARCA & BRIEFING: tudo que alguém precisa para criar
// para este cliente. Logo e materiais, estilo visual, produtos, tom de voz, briefings e as regras
// que o Agente segue. Juntou o que estava espalhado em Dados, Inteligência Criativa, Visão Geral,
// Briefing, Creative Wallet e Comercial (Ficha Viva).

import { ArrowRight, ExternalLink, Instagram } from "lucide-react";
import { toast } from "sonner";
import DadosTab from "@/components/client-tabs/DadosTab";
import BriefingEstrategico from "@/components/client-tabs/BriefingEstrategico";
import CalendarioEstrategico from "@/components/client-tabs/CalendarioEstrategico";
import BriefingTab from "@/app/clients/[id]/BriefingTab";
import ClientCsRules from "@/components/cs/ClientCsRules";
import EstiloVisual from "@/components/clients/EstiloVisual";
import CatalogoProdutos from "@/components/clients/CatalogoProdutos";
import FichaViva360Tab from "@/components/fichaviva/FichaViva360Tab";
import { useClientsStore } from "@/stores/useClientsStore";
import type { ClientPatch } from "@/stores/useClientsStore";
import CreativeWallet from "./CreativeWallet";
import { Secao, Vazio } from "./Secao";
import { SECAO } from "./abas";
import type { FichaCtx } from "./tipos";

const TOM: Record<string, string> = { formal: "Formal", funny: "Engraçado", authoritative: "Autoritário", casual: "Casual" };

export default function AbaMarca({ ctx, dadosCompletos, updateClientData, onNavigateTab }: {
  ctx: FichaCtx;
  dadosCompletos: boolean;
  updateClientData: (id: string, data: ClientPatch) => Promise<void>;
  onNavigateTab: (tab: string) => void;
}) {
  const { client: c, role, currentUser, isAdmin, naMinhaCarteira } = ctx;
  const patchClientLocal = useClientsStore((s) => s.patchClientLocal);
  const podeEditarMarca = ["admin", "manager", "social", "designer", "traffic"].includes(role);
  const temDossie = !!(c.toneOfVoice || c.instagramUser || c.driveLink || c.fixedBriefing || c.campaignBriefing);

  return (
    <div className="space-y-8">
      <Secao id={SECAO.identidade} titulo="Identidade visual e materiais" semCard
        descricao="Logo (todas as versões), links de Figma/Drive e o que o designer precisa baixar.">
        <DadosTab parte="identidade" client={c} role={role} currentUser={currentUser}
          updateClientData={updateClientData} onNavigateTab={onNavigateTab}
          generateOnboardingLink={() => toast.info("O link de onboarding fica no topo da ficha.")}
          generatingLink={false} onboardingLink={null} dadosCompletos={dadosCompletos} />
      </Secao>

      {/* Os dois componentes trazem o próprio título. */}
      <div id={SECAO.materiais} className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <EstiloVisual clientId={c.id} podeEditar={podeEditarMarca} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <CatalogoProdutos clientId={c.id} podeEditar={podeEditarMarca} />
        </div>
      </div>

      <Secao titulo="Tom de voz e briefings rápidos"
        descricao={isAdmin ? "O que está no cadastro. Para mudar, use Editar no topo da ficha." : "O que está no cadastro (quem edita é a gestão)."}>
        {!temDossie ? <Vazio>Nada preenchido ainda.</Vazio> : (
          <dl className="grid gap-4 sm:grid-cols-2">
            {c.toneOfVoice && (
              <div><dt className="text-lone-caption text-muted-foreground">Tom de voz</dt><dd className="text-lone-body text-foreground">{TOM[c.toneOfVoice] ?? c.toneOfVoice}</dd></div>
            )}
            {(c.instagramUser || c.driveLink) && (
              <div>
                <dt className="text-lone-caption text-muted-foreground">Onde ficam as coisas</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {c.instagramUser && (
                    <a href={`https://instagram.com/${c.instagramUser.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-lone-caption text-foreground hover:bg-accent">
                      <Instagram size={12} aria-hidden="true" /> {c.instagramUser}
                    </a>
                  )}
                  {c.driveLink && (
                    <a href={c.driveLink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-lone-caption text-primary hover:bg-accent">
                      <ExternalLink size={12} aria-hidden="true" /> Drive / Canva
                    </a>
                  )}
                </dd>
              </div>
            )}
            {c.fixedBriefing && (
              <div className="sm:col-span-2"><dt className="text-lone-caption text-muted-foreground">Briefing fixo</dt>
                <dd className="whitespace-pre-wrap text-lone-body text-foreground">{c.fixedBriefing}</dd></div>
            )}
            {c.campaignBriefing && (
              <div className="sm:col-span-2"><dt className="text-lone-caption text-muted-foreground">Briefing de campanha</dt>
                <dd className="whitespace-pre-wrap text-lone-body text-foreground">{c.campaignBriefing}</dd></div>
            )}
          </dl>
        )}
      </Secao>

      <Secao id={SECAO.briefing} titulo="Briefing" semCard
        descricao="Posicionamento, público, dores, ganchos e CTAs — e as regras que o Agente segue com este cliente.">
        <div className="space-y-4">
          {/* Quem executa edita o briefing estratégico dos PRÓPRIOS clientes (era o /meus-clientes). */}
          {(isAdmin || naMinhaCarteira) && <BriefingEstrategico clientId={c.id} />}
          {(isAdmin || role === "social") && <CalendarioEstrategico clientId={c.id} />}
          <BriefingTab clientId={c.id} />
          <ClientCsRules clientId={c.id} />
        </div>
      </Secao>

      <p className="text-lone-caption text-muted-foreground">
        O que está funcionando nos anúncios (vencedores, testes, aprendizados) fica em{" "}
        <button onClick={() => ctx.irPara("resultados", SECAO.inteligencia)} className="inline-flex items-center gap-0.5 text-primary hover:underline">
          Resultados <ArrowRight size={11} aria-hidden="true" />
        </button>
      </p>

      {isAdmin && (
        <>
          <Secao id={SECAO.wallet} titulo="Creative Wallet" descricao="Referências visuais, paleta, tipografia e logo — o banco da marca.">
            <CreativeWallet clientId={c.id} currentUser={currentUser} />
          </Secao>
          <Secao id={SECAO.fichaViva} titulo="Ficha Viva" semCard
            descricao="O link do cliente com crescimento e diagnóstico comercial (Raio-X).">
            <FichaViva360Tab client={c} onUpdate={(patch) => patchClientLocal(c.id, patch)} />
          </Secao>
        </>
      )}
    </div>
  );
}
