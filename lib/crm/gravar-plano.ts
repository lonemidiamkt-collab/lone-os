// lib/crm/gravar-plano.ts — grava um plano de importação (lib/crm/importar.ts) no banco: cria os
// leads novos, atualiza a negociação dos que já existem e registra as atividades. Usado pela tela
// de importação (app/api/crm/importar) e pelo cron da rota (app/api/system/crm-rota).

import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import type { LinhaPlano } from "@/lib/crm/importar";

const CAMPOS_DE_NEGOCIACAO = ["valorOrcamento", "estagio", "probabilidade", "retomarEm", "etapaDesde"];

export interface ResultadoGravacao {
  criados: number;
  atualizados: number;
  erros: { titulo: string; erro: string }[];
  criadas: { linha: LinhaPlano; leadId: string }[];
}

export async function gravarPlano(linhas: LinhaPlano[]): Promise<ResultadoGravacao> {
  const resultado: ResultadoGravacao = { criados: 0, atualizados: 0, erros: [], criadas: [] };
  for (const linha of linhas) {
    if (linha.acao === "ignorar") continue;
    try {
      let leadId = linha.leadId;
      if (linha.acao === "criar") {
        const lead = await db.insertCrmLead(linha.campos);
        leadId = lead.id;
        resultado.criados++;
        resultado.criadas.push({ linha, leadId: lead.id });
      } else if (leadId) {
        const patch = Object.fromEntries(Object.entries(linha.campos).filter(([k]) => CAMPOS_DE_NEGOCIACAO.includes(k)));
        await db.updateCrmLead(leadId, patch);
        resultado.atualizados++;
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
