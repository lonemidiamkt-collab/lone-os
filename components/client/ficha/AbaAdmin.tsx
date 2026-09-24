"use client";

// components/client/ficha/AbaAdmin.tsx — ADMIN: o cadastro e o que é da gestão. Identificação, cofre
// de acessos, documentos, configuração da operação, conta Meta Ads, contrato, onboarding e o ciclo de
// vida (pausar, retomar, encerrar). Cada bloco mantém a MESMA visibilidade de antes: o cofre mostra
// só as plataformas do papel de quem vê, documentos e contrato só para gestão (e o servidor confere).
// Nenhum valor de contrato novo aparece aqui (pedido do CEO: nada de faturamento da agência).

import dynamic from "next/dynamic";
import DadosTab from "@/components/client-tabs/DadosTab";
import type { ClientPatch } from "@/stores/useClientsStore";
import type { OnboardingItem } from "@/lib/types";
import CicloDeVida from "./CicloDeVida";
import ContaMetaAds from "./ContaMetaAds";
import OnboardingChecklist from "./OnboardingChecklist";
import { Secao } from "./Secao";
import { SECAO } from "./abas";
import { dataCurta } from "./rotulos";
import type { FichaCtx } from "./tipos";

const ContractGenerator = dynamic(() => import("@/components/ContractGenerator"), { ssr: false });

const PAGAMENTO: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão", transferencia: "Transferência" };

export default function AbaAdmin({ ctx, onboarding, dadosCompletos, updateClientData, onNavigateTab, onboardingLink, gerandoLink, gerarLink }: {
  ctx: FichaCtx;
  onboarding: OnboardingItem[];
  dadosCompletos: boolean;
  updateClientData: (id: string, data: ClientPatch) => Promise<void>;
  onNavigateTab: (tab: string) => void;
  onboardingLink: string | null;
  gerandoLink: boolean;
  gerarLink: () => void;
}) {
  const { client: c, role, currentUser, isAdmin } = ctx;

  return (
    <div className="space-y-8">
      <Secao id={SECAO.cadastro} titulo="Operação" descricao="Como este cliente está configurado no sistema.">
        <dl className="divide-y divide-border">
          {[
            ["Segmento", c.nicho || c.industry || "—"],
            ["Forma de pagamento", PAGAMENTO[c.paymentMethod] ?? c.paymentMethod ?? "—"],
            ["Cliente desde", c.joinDate ? dataCurta(c.joinDate) : "—"],
            ["Último post", c.lastPostDate ? dataCurta(c.lastPostDate) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-lone-body text-muted-foreground">{k}</dt>
              <dd className="text-right text-lone-body text-foreground">{v}</dd>
            </div>
          ))}
          <div className="py-2.5">
            <ContaMetaAds client={c} updateClientData={updateClientData} />
          </div>
        </dl>
        {c.notes && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-lone-caption text-muted-foreground">Observações</p>
            <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-lone-body text-foreground">{c.notes}</p>
          </div>
        )}
      </Secao>

      <DadosTab parte="cadastro" client={c} role={role} currentUser={currentUser}
        updateClientData={updateClientData} onNavigateTab={onNavigateTab}
        generateOnboardingLink={gerarLink} generatingLink={gerandoLink}
        onboardingLink={onboardingLink} dadosCompletos={dadosCompletos} />

      {isAdmin && (
        <Secao id={SECAO.contrato} titulo="Contrato" semCard>
          <ContractGenerator client={c} currentUser={currentUser} />
        </Secao>
      )}

      <Secao id={SECAO.onboarding} titulo="Onboarding" descricao="O setup do cliente novo, por frente.">
        <OnboardingChecklist client={c} itens={onboarding} currentUser={currentUser} />
      </Secao>

      {isAdmin && (
        <Secao id={SECAO.cicloDeVida} titulo="Ciclo de vida">
          <CicloDeVida client={c} />
        </Secao>
      )}
    </div>
  );
}
