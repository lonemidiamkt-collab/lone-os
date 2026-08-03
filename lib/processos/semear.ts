// lib/processos/semear.ts — leva os processos escritos (conteudo-inicial.ts) pro banco.
//
// IDEMPOTENTE POR DECISÃO. Roda quantas vezes quiser: processo que já existe não é tocado.
// O motivo é simples — a partir do instante em que alguém corrigir um passo pela tela, o texto
// do banco é o certo e o do código é o histórico. Um seed que sobrescreve apagaria a correção
// de quem usa o sistema, que é exatamente quem tem razão sobre o processo.
//
// Semear é ação de gestão (rota exige admin/manager) e nasce ATIVO, não rascunho: estes cinco
// vieram do playbook do Roberto, já são como a Lone trabalha. Rascunho é pra processo novo.

import { supabaseAdmin } from "@/lib/supabase/server";
import { PROCESSOS_INICIAIS, type ProcessoSeed } from "./conteudo-inicial";

export interface ResultadoSeed {
  criados: string[];
  jaExistiam: string[];
  falhas: { code: string; erro: string }[];
}

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function semearUm(p: ProcessoSeed, autor: string): Promise<"criado" | "existia"> {
  const { data: existente } = await supabaseAdmin
    .from("processes").select("id").eq("code", p.code).is("deleted_at", null).maybeSingle();
  if (existente) return "existia";

  const { data: proc, error: e1 } = await supabaseAdmin.from("processes").insert({
    code: p.code,
    slug: `${slugify(p.titulo)}-${p.code.toLowerCase()}`,
    title: p.titulo, area: p.area, doc_type: p.tipo,
    status: "active", summary: p.resumo, tags: p.tags,
    created_by: autor,
  }).select("id").maybeSingle();
  if (e1 || !proc) throw new Error(e1?.message || "não consegui criar o processo");

  // NASCE RASCUNHO E SÓ DEPOIS VIRA ATIVA. Na primeira tentativa eu criava já ativa e inseria os
  // passos em seguida — o gatilho de imutabilidade barrou, com razão: passo é conteúdo de versão,
  // e versão no ar não muda. A ordem certa é montar tudo enquanto é rascunho e então publicar.
  const { data: ver, error: e2 } = await supabaseAdmin.from("process_versions").insert({
    process_id: proc.id, version: "1.0", status: "draft",
    objective: p.objetivo, problem: p.problema, scope: p.escopo, out_of_scope: p.foraDeEscopo,
    trigger_event: p.gatilho, frequency: p.frequencia,
    inputs: p.entradas, outputs: p.saidas,
    completion_criteria: p.criterioPronto, quality_criteria: p.criteriosQualidade, sla: p.sla,
    kpis: p.kpis ?? null, exceptions: p.excecoes ?? null,
    change_summary: "Primeira versão — transcrita do playbook e do fluxo real do sistema.",
    approved_by: autor, created_by: autor,
  }).select("id").maybeSingle();
  if (e2 || !ver) throw new Error(e2?.message || "não consegui gravar a versão");

  if (p.passos.length) {
    const { error: e3 } = await supabaseAdmin.from("process_steps").insert(
      p.passos.map((s, i) => ({
        version_id: ver.id, seq: i + 1, title: s.titulo, instruction: s.instrucao,
        role: s.papel, system_ref: s.sistema ?? null, decision_type: s.decisao ?? null,
        evidence_type: s.evidencia ?? null,
        evidence_required: !s.opcional && !!s.evidencia, optional: !!s.opcional,
      })),
    );
    // MEIO PROCESSO É PIOR QUE PROCESSO NENHUM: sem os passos, o registro fica no banco, o seed
    // idempotente pula ele pra sempre e o time abre um processo vazio achando que é o oficial.
    // Falhou no meio, desfaz — na próxima rodada ele entra inteiro.
    if (e3) {
      await supabaseAdmin.from("processes").delete().eq("id", proc.id);
      throw new Error(`passos: ${e3.message}`);
    }
  }

  // Agora sim publica: versão completa vira a que está no ar, e o processo aponta pra ela.
  await supabaseAdmin.from("process_versions")
    .update({ status: "active", approved_at: new Date().toISOString() }).eq("id", ver.id);
  await supabaseAdmin.from("processes").update({ active_version_id: ver.id }).eq("id", proc.id);
  return "criado";
}

export async function semear(autor: string): Promise<ResultadoSeed> {
  const r: ResultadoSeed = { criados: [], jaExistiam: [], falhas: [] };
  for (const p of PROCESSOS_INICIAIS) {
    try {
      const res = await semearUm(p, autor);
      (res === "criado" ? r.criados : r.jaExistiam).push(p.code);
    } catch (e) {
      // Um processo quebrado não pode impedir os outros de entrar.
      r.falhas.push({ code: p.code, erro: e instanceof Error ? e.message : "erro" });
    }
  }
  return r;
}
