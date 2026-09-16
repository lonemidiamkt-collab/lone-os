// lib/prospeccao/handoff.ts — a reunião existe; agora ela é do Roberto (§23–§24, V2 §13–§14).
//
// Resumo estruturado para o número oficial da Lone (+55 22 98153-0700) e cópia no grupo
// administrativo. Depois disso o owner vira ROBERTO e o agente entra em observação: só lembra
// da reunião (24h e 1h antes), não vende por cima de ninguém.

import type { ProspectRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { enviarTexto } from "./envio";
import { transicionar, registrarEvento } from "./maquina";
import { rotuloClasse } from "./score";
import { nomeProprio } from "./normalizar";
import { dataCurtaSP, horaCurtaSP } from "./tempo";
import { appUrl } from "./google";

export function textoHandoff(p: ProspectRow): string {
  const dec = p.decisor_nome ? nomeProprio(p.decisor_nome) : "não identificado";
  const linhas = [
    "NOVA REUNIÃO — SDR LONE",
    "",
    `Empresa: ${p.nome}`,
    `Decisor: ${dec}${p.decisor_cargo ? ` (${p.decisor_cargo})` : ""}`,
    `Telefone: ${p.decisor_telefone ?? p.telefone ?? "—"}`,
    `Segmento: ${p.segmento ?? "—"}`,
    `Cidade: ${p.cidade ?? "—"}${p.uf ? `/${p.uf}` : ""}`,
    `Distância: ${p.distancia_km !== null ? `${p.distancia_km} km` : "—"}`,
    `Score: ${p.score ?? "—"}/100`,
    `Classe: ${p.classe ?? "—"} (${rotuloClasse(p.classe)})`,
    `Formato: ${p.reuniao_tipo === "visita" ? "Visita presencial" : "Google Meet"}`,
    `Data: ${p.reuniao_em ? dataCurtaSP(p.reuniao_em) : "—"}`,
    `Horário: ${p.reuniao_em ? horaCurtaSP(p.reuniao_em) : "—"}`,
    p.reuniao_tipo === "online" ? `Meet: ${p.meet_url ?? "PENDENTE — Google não conectado, enviar o link ao prospect"}` : `Endereço: ${p.endereco ?? "—"}`,
    `Origem: ${p.origem ?? "—"}`,
    "",
    `Resumo: ${p.contexto_comercial?.resumo ?? "—"}`,
    `Oportunidades identificadas: ${p.diagnostico?.oportunidades?.length ? p.diagnostico.oportunidades.join("; ") : "—"}`,
    `Objeções: ${p.objecoes?.length ? p.objecoes.join("; ") : "nenhuma"}`,
    p.gift_reserved ? `Presente: ${p.gift_type ?? "reservado"}` : null,
    `Histórico: ${appUrl()}/prospeccao?prospect=${p.id}`,
    `Próxima ação: ${p.reuniao_tipo === "visita" ? "Roberto faz a visita" : "Roberto conduz a reunião"} — o agente lembra o prospect 24h e 1h antes.`,
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

export async function fazerHandoff(p: ProspectRow, cfg: ProspectConfig, dry = false): Promise<{ ok: boolean; prospect: ProspectRow; erros: string[] }> {
  const texto = textoHandoff(p);
  const erros: string[] = [];
  if (!dry) {
    const numero = (cfg.handoff_numero || "").replace(/\D/g, "");
    if (numero) {
      const r = await enviarTexto(`${numero}@s.whatsapp.net`, texto);
      if (!r.ok) erros.push(`handoff ${numero}: ${r.error}`);
    } else erros.push("handoff_numero vazio");
    const adm = process.env.CS_ADM_GROUP_JID;
    if (adm) {
      try {
        const { csSendGroupText } = await import("@/lib/cs/notify");
        const r = await csSendGroupText(adm, texto, undefined, { origem: "prospeccao", destino: "interno" });
        if (!r.ok) erros.push(`grupo adm: ${r.error}`);
      } catch (err) { erros.push(`grupo adm: ${err instanceof Error ? err.message : "falhou"}`); }
    }
  }
  await registrarEvento(p.id, { tipo: "handoff", motivo: erros.length ? `handoff com falhas: ${erros.join("; ")}` : "handoff enviado", responsavel: "SDR_AI", detalhe: { dry, erros } });
  const depois = p.estagio === "reuniao_agendada"
    ? await transicionar(p, { para: "handoff", motivo: "Handoff para o Roberto", responsavel: "SDR_AI", ctx: { reuniaoEm: p.reuniao_em ? new Date(p.reuniao_em) : null } })
    : p;
  return { ok: erros.length === 0, prospect: depois, erros };
}
