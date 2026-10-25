// lib/portal/envio-material-server.ts — o aviso único no grupo do time e o registro de lotes do
// "Enviar material" do portal (regras em ./envio-material.ts; item 1.11, 24/10/2026).

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { criarRegistroDeLotes, mensagemDoLote, type RegistroDeLotes } from "./envio-material";

/** Se a página não pedir o aviso (aba fechada no meio), o servidor avisa este tempo após o último arquivo. */
export const ESPERA_AVISO_AUTOMATICO_MS = 3 * 60_000;

export interface ResultadoAvisoMaterial { ok: boolean; quantos: number; erro?: string }

/** Uma mensagem no grupo do time com todos os arquivos `ids` deste cliente (os apagados ficam de fora). */
export async function avisarTimeDoMaterial(clienteId: string, ids: string[]): Promise<ResultadoAvisoMaterial> {
  if (!ids.length) return { ok: true, quantos: 0 };
  const jid = process.env.CS_TEAM_GROUP_JID || "";
  if (!jid) {
    console.error("[portal/material] CS_TEAM_GROUP_JID ausente: material guardado sem aviso no grupo", clienteId);
    return { ok: true, quantos: 0 };
  }
  const [cli, ups] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", clienteId).maybeSingle(),
    supabaseAdmin.from("client_uploads").select("id, file_name, size_bytes, observacao, enviado_por, created_at")
      .eq("client_id", clienteId).in("id", ids.slice(0, 50)).order("created_at", { ascending: true }),
  ]);
  if (ups.error) return { ok: false, quantos: 0, erro: ups.error.message };
  const linhas = (ups.data ?? []) as { file_name: string; size_bytes: number | null; observacao: string | null; enviado_por: string | null }[];
  if (!linhas.length) return { ok: true, quantos: 0 }; // o cliente apagou tudo antes do aviso
  const nome = ((cli.data?.name as string) || (cli.data?.nome_fantasia as string) || "Cliente");
  const msg = mensagemDoLote({
    cliente: nome,
    enviadoPor: linhas.find((l) => l.enviado_por)?.enviado_por ?? null,
    observacao: linhas.find((l) => l.observacao)?.observacao ?? null,
    arquivos: linhas.map((l) => ({ nome: l.file_name, tamanhoBytes: l.size_bytes })),
  });
  const r = await csSendGroupText(jid, msg, undefined, { origem: "portal-upload", destino: "interno", clientId: clienteId });
  // Incerto (timeout) conta como enviado: repetir aqui é o que manda a mensagem em dobro.
  if (!r.ok && !r.incerto) return { ok: false, quantos: linhas.length, erro: r.error ?? "falha no WhatsApp" };
  return { ok: true, quantos: linhas.length };
}

/** Um registro por processo (as duas rotas — upload e aviso — precisam enxergar o mesmo). */
export function registroDeLotes(): RegistroDeLotes {
  const g = globalThis as { __loneLotesMaterial?: RegistroDeLotes };
  g.__loneLotesMaterial ??= criarRegistroDeLotes({
    esperaMs: ESPERA_AVISO_AUTOMATICO_MS,
    avisar: async (clienteId, ids) => {
      const r = await avisarTimeDoMaterial(clienteId, ids);
      if (!r.ok) console.error("[portal/material] aviso automático falhou:", clienteId, r.erro);
    },
  });
  return g.__loneLotesMaterial;
}
