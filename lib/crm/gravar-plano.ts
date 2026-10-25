// lib/crm/gravar-plano.ts — grava um plano de importação (lib/crm/importar.ts) no banco: cria os
// leads novos, atualiza a negociação dos que já existem e registra as atividades. Usado pela tela
// de importação (app/api/crm/importar) e pelo cron da rota (app/api/system/crm-rota).

import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import type { LinhaPlano } from "@/lib/crm/importar";
import { registrarEtapa } from "@/lib/crm/etapas-historico";

export interface ResultadoGravacao {
  criados: number;
  atualizados: number;
  erros: { titulo: string; erro: string }[];
  criadas: { linha: LinhaPlano; leadId: string }[];
}

/** Etapa atual do lead para o "de" do histórico. Ler falhou → null: o histórico perde o "de", a importação segue. */
async function etapaNoBanco(leadId: string): Promise<string | null> {
  try { return (await db.fetchCrmLeadById(leadId))?.estagio ?? null; } catch { return null; }
}

export async function gravarPlano(linhas: LinhaPlano[], autor: string | null = null): Promise<ResultadoGravacao> {
  const resultado: ResultadoGravacao = { criados: 0, atualizados: 0, erros: [], criadas: [] };
  for (const linha of linhas) {
    if (linha.acao === "ignorar") continue;
    // Quem assina a etapa no histórico: quem importou; na Rota Lagos, quem visitou.
    const quem = autor ?? (typeof linha.campos.responsavel === "string" ? linha.campos.responsavel : null);
    try {
      let leadId = linha.leadId;
      if (linha.acao === "criar") {
        const lead = await db.insertCrmLead(linha.campos);
        leadId = lead.id;
        resultado.criados++;
        resultado.criadas.push({ linha, leadId: lead.id });
        // A entrada no funil vai para o histórico de etapa, como na criação pela tela (25/10/2026, onda 5).
        await registrarEtapa({ leadId: lead.id, de: null, para: lead.estagio, autor: quem, origem: "importacao" });
      } else if (leadId) {
        // Grava SÓ o que a prévia mostrou como "de → para" (21/10/2026). Antes ia a negociação inteira
        // do arquivo por cima — lead Ganho voltava para Negociação. A regra está em compararNegociacao.
        const patch: Record<string, unknown> = Object.fromEntries(linha.mudancas.map((m) => [m.campo, m.valor]));
        if (!Object.keys(patch).length) continue;
        // Etapa avançou: a régua da etapa nova conta de hoje. Sem mudar de etapa, o "desde" fica.
        if ("estagio" in patch) patch.etapaDesde = typeof linha.campos.etapaDesde === "string" ? linha.campos.etapaDesde : new Date().toISOString();
        // O "de" do histórico é a etapa que está no banco agora (a prévia mostra o rótulo, e pode ter mudado desde então).
        const de = "estagio" in patch ? await etapaNoBanco(leadId) : null;
        await db.updateCrmLead(leadId, patch);
        resultado.atualizados++;
        if (typeof patch.estagio === "string") {
          await registrarEtapa({ leadId, de, para: patch.estagio, autor: quem, origem: "importacao" });
        }
      }
      if (leadId && linha.atividades.length) {
        await supabaseAdmin.from("crm_lead_activities").insert(linha.atividades.map((a) => ({
          lead_id: leadId, tipo: a.tipo, texto: a.texto, autor: a.autor, ...(a.quando ? { created_at: a.quando } : {}),
        })));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      resultado.erros.push({
        titulo: linha.titulo,
        erro: /column|schema cache/i.test(msg) ? "Falta aplicar a atualização do banco do comercial (migration 20261017100000)." : msg,
      });
      // Coluna faltando vale para todas as linhas: para na primeira em vez de repetir o mesmo erro 48 vezes.
      if (/column|schema cache/i.test(msg)) break;
    }
  }
  return resultado;
}
