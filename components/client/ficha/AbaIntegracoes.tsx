"use client";

// components/client/ficha/AbaIntegracoes.tsx — INTEGRAÇÕES DO CLIENTE (18/11/2026). Pedido do Roberto: Âncora CRM e
// Lone Academy numa aba separada da ficha, "para ver esses registros, ativar o cliente" — e o CRM de qualquer
// sistema (Âncora, Kommo, outro pela API aberta) alimentando o relatório e o portal.
//
//   CRM do cliente  → acesso ao Âncora (gerar link, ver cadastro) e o CRM que entra no relatório (lib/crm-externo)
//   Lone Academy    → liberar o treinamento (saiu do Admin; o link antigo ?tab=admin#lone-academy cai aqui)
//
// Mesma visibilidade de antes: Academy só gestão; CRM gestão e tráfego (o servidor confere os dois).

import CrmDoCliente from "./CrmDoCliente";
import LoneAcademy from "./LoneAcademy";
import { Secao } from "./Secao";
import { SECAO } from "./abas";
import type { FichaCtx } from "./tipos";

export default function AbaIntegracoes({ ctx }: { ctx: FichaCtx }) {
  const { client: c, role, isAdmin } = ctx;
  const veCrm = isAdmin || role === "traffic";
  if (!veCrm) {
    return <p className="text-lone-body text-muted-foreground">As integrações deste cliente ficam com a gestão e o tráfego.</p>;
  }
  return (
    <div className="space-y-8">
      <Secao id={SECAO.crm} titulo="CRM do cliente"
        descricao="Âncora CRM, Kommo ou outro sistema: o atendimento e as vendas do cliente no relatório semanal, no mensal e no portal.">
        <CrmDoCliente clientId={c.id} />
      </Secao>
      {isAdmin && (
        <Secao id={SECAO.academy} titulo="Lone Academy" descricao="Treinamento do time do cliente. A gestão libera por cliente; o dono recebe o acesso por e-mail.">
          <LoneAcademy client={c} />
        </Secao>
      )}
    </div>
  );
}
