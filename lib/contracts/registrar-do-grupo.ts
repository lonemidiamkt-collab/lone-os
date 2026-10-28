// lib/contracts/registrar-do-grupo.ts — o contrato gerado no grupo de cadastro também fica no Lone OS (28/10/2026).
//
// "gera o contrato: dia 10" mandava o PDF no grupo e não gravava nada: a ficha não tinha o contrato, a assinatura
// da D4Sign não achava contrato para ligar, e não havia de onde mandar para assinar. Agora o PDF vai para o mesmo
// lugar dos contratos gerados na ficha (bucket contracts) e vira uma linha em `contracts` (rascunho), com a mesma
// regra de versão de /api/contracts/gerar (a maior do banco + 1). Nunca lança.

import { supabaseAdmin } from "@/lib/supabase/server";
import { proximaVersao, somarMesesIso } from "./registro";

const BUCKET = "contracts";

export interface ContratoDoGrupo {
  clientId: string;
  pdf: Buffer;
  valorMensal: number;
  diaPagamento: number;
  modalidade: "ciclos" | "determinado";
  duracaoMeses?: number;
  dataInicio?: string;
  autor: string;
}

/** Datas e duração do contrato registrado. Pura. Ciclos = 3 meses (o ciclo); prazo determinado = o combinado. */
export function vigenciaDoGrupo(p: Pick<ContratoDoGrupo, "modalidade" | "duracaoMeses" | "dataInicio">, hoje: string): { inicio: string; fim: string; meses: number } {
  const meses = p.modalidade === "determinado" ? Math.max(1, p.duracaoMeses ?? 1) : (p.duracaoMeses && p.duracaoMeses > 0 ? p.duracaoMeses : 3);
  const inicio = p.dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(p.dataInicio) ? p.dataInicio : hoje;
  return { inicio, fim: somarMesesIso(inicio, meses), meses };
}

export async function registrarContratoDoGrupo(p: ContratoDoGrupo): Promise<{ ok: true; id: string; version: number } | { ok: false; erro: string }> {
  try {
    const { data: cli, error: eCli } = await supabaseAdmin.from("clients").select("service_type").eq("id", p.clientId).maybeSingle();
    if (eCli || !cli) return { ok: false, erro: eCli?.message ?? "cliente não encontrado" };
    const { data: maior, error: eVer } = await supabaseAdmin.from("contracts")
      .select("version").eq("client_id", p.clientId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (eVer) return { ok: false, erro: `não consegui numerar a versão: ${eVer.message}` };
    const version = proximaVersao(maior?.version as number | undefined);
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const v = vigenciaDoGrupo(p, hoje);

    const caminho = `${p.clientId}/contrato-v${version}-${Date.now()}.pdf`;
    const up = await supabaseAdmin.storage.from(BUCKET).upload(caminho, p.pdf, { contentType: "application/pdf", upsert: false });
    if (up.error) return { ok: false, erro: `não guardei o PDF: ${up.error.message}` };
    const { data: criado, error: eIns } = await supabaseAdmin.from("contracts").insert({
      client_id: p.clientId, version, service_type: (cli.service_type as string) || "lone_growth",
      monthly_value: p.valorMensal, start_date: v.inicio, end_date: v.fim, duration_months: v.meses,
      status: "draft", pdf_url: `/storage/v1/object/public/${BUCKET}/${caminho}`, generated_by: p.autor, payment_day: p.diaPagamento,
    }).select("id, version").single();
    if (eIns || !criado) {
      await supabaseAdmin.storage.from(BUCKET).remove([caminho]).then(() => {}, () => {});
      return { ok: false, erro: `não gravei o contrato: ${eIns?.message ?? "sem resposta do banco"}` };
    }
    await supabaseAdmin.from("contract_audit_log").insert({
      contract_id: criado.id, action: "generated", actor: p.autor, details: `Contrato V${version} gerado pelo grupo de cadastro.`,
    });
    return { ok: true, id: criado.id as string, version: criado.version as number };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro" };
  }
}
