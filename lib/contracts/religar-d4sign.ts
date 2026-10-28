// lib/contracts/religar-d4sign.ts — liga de novo os documentos da D4Sign ao cadastro certo, sem gastar chamada.
//
// 28/10/2026: o cadastro de teste "test" (nome fantasia "Lone Midia") tinha ficado com 8 contratos de outros
// clientes, e documento que chegou antes do cadastro existir ficava sem dono para sempre. Aqui, com o que já está
// gravado (nome do arquivo + e-mails de quem assinou), cada documento é ligado de novo pela mesma regra do aviso
// (lib/contracts/assinatura.ts, par único) — e a data "contrato assinado em" dos clientes afetados é refeita a partir
// dos documentos deles. Roda de madrugada junto do arquivo por mês e sob demanda (?religar=1 na consulta).

import { supabaseAdmin } from "@/lib/supabase/server";
import { ligarComPreferencia, podeReceberDocumento, tipoDoDocumento, type ClienteCadastro, type Vinculo } from "./assinatura";
import { lerSignatariosGravados } from "./d4sign-signatarios";
import { carregarConfigD4Sign } from "./d4sign-config";

export interface DocParaReligar {
  document_uuid: string;
  nome: string | null;
  status: string | null;
  tipo: "contrato" | "documento" | null;
  client_id: string | null;
  contract_id: string | null;
  vinculo: Vinculo | null;
  assinado_em: string | null;
  signatarios: unknown;
}

export interface Troca { uuid: string; nome: string; de: string | null; para: string | null; vinculo: Vinculo | null }

/**
 * O que mudar. Pura. Só mexe em documento SEM dono ou com dono que não pode receber documento (teste, a própria
 * Lone) — ligação feita pelo aviso, com cadastro válido, não é refeita aqui.
 */
export function planejarReligacao(docs: DocParaReligar[], clientes: ClienteCadastro[], emailsLone: string[]): Troca[] {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const trocas: Troca[] = [];
  for (const d of docs) {
    const atual = d.client_id ? porId.get(d.client_id) : undefined;
    const donoInvalido = !!atual && !podeReceberDocumento(atual);
    if (d.client_id && !donoInvalido && atual) continue;
    const signatarios = lerSignatariosGravados(d.signatarios)
      .map((s) => ({ email: s.email ?? null, nome: s.nome ?? null, assinou: s.assinou, assinadoEm: s.assinadoEm ?? null, incluidoEm: null, chave: null }));
    const l = ligarComPreferencia({ nome: d.nome ?? "", signatarios }, clientes, emailsLone);
    if (l.clientId === d.client_id) continue;
    if (!l.clientId && !d.client_id) continue;
    trocas.push({ uuid: d.document_uuid, nome: d.nome ?? d.document_uuid, de: d.client_id, para: l.clientId, vinculo: l.clientId ? l.vinculo : null });
  }
  return trocas;
}

/** "Contrato assinado em" de cada cliente = o contrato assinado mais recente dele (ou nada). Pura. */
export function datasDeAssinatura(docs: DocParaReligar[], clientes: string[]): Map<string, string | null> {
  const r = new Map<string, string | null>(clientes.map((c) => [c, null]));
  for (const d of docs) {
    if (!d.client_id || !r.has(d.client_id) || d.status !== "assinado" || !d.assinado_em) continue;
    if ((d.tipo ?? tipoDoDocumento(d.nome ?? "")) !== "contrato") continue;
    const atual = r.get(d.client_id);
    if (!atual || d.assinado_em > atual) r.set(d.client_id, d.assinado_em);
  }
  return r;
}

export interface ResultadoReligar { ok: boolean; dry: boolean; trocas: Troca[]; datasRefeitas: number; erros: string[] }

/** Aplica a religação (ou só mostra, no ensaio). Nunca lança; nenhuma chamada à D4Sign. */
export async function religarDocumentos(opts: { dry?: boolean } = {}): Promise<ResultadoReligar> {
  const dry = !!opts.dry;
  const vazio = { dry, trocas: [] as Troca[], datasRefeitas: 0 };
  try {
    const [dl, cl, cfg] = await Promise.all([
      supabaseAdmin.from("d4sign_documentos").select("document_uuid, nome, status, tipo, client_id, contract_id, vinculo, assinado_em, signatarios").limit(5000),
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, email, email_corporativo, churned_at").limit(5000),
      carregarConfigD4Sign(),
    ]);
    if (dl.error) return { ...vazio, ok: false, erros: [`não consegui ler os documentos: ${dl.error.message}`] };
    if (cl.error) return { ...vazio, ok: false, erros: [`não consegui ler os clientes: ${cl.error.message}`] };
    const docs = (dl.data as DocParaReligar[] | null) ?? [];
    const clientes = (cl.data as ClienteCadastro[] | null) ?? [];
    const trocas = planejarReligacao(docs, clientes, cfg?.emailsLone ?? []);
    if (dry || !trocas.length) return { ok: true, dry, trocas, datasRefeitas: 0, erros: [] };

    const erros: string[] = [];
    const feitas: Troca[] = [];
    for (const t of trocas) {
      // Só se o dono ainda for o que foi lido: o aviso pode ter ligado no meio.
      let q = supabaseAdmin.from("d4sign_documentos")
        .update({ client_id: t.para, vinculo: t.vinculo, ...(t.de ? { contract_id: null } : {}) })
        .eq("document_uuid", t.uuid);
      q = t.de ? q.eq("client_id", t.de) : q.is("client_id", null);
      const u = await q.select("document_uuid");
      if (u.error) erros.push(`${t.nome}: ${u.error.message}`);
      else if (u.data?.length) feitas.push(t);
    }
    // A data "contrato assinado em" dos clientes que perderam ou ganharam documento.
    const afetados = [...new Set(feitas.flatMap((t) => [t.de, t.para]).filter((x): x is string => !!x))];
    let datasRefeitas = 0;
    if (afetados.length) {
      const depois = await supabaseAdmin.from("d4sign_documentos").select("document_uuid, nome, status, tipo, client_id, assinado_em").in("client_id", afetados);
      if (depois.error) erros.push(`não consegui reler os documentos para refazer as datas: ${depois.error.message}`);
      else {
        for (const [clientId, data] of datasDeAssinatura((depois.data as DocParaReligar[] | null) ?? [], afetados)) {
          const r = await supabaseAdmin.from("clients").update({ contrato_assinado_em: data }).eq("id", clientId);
          if (r.error) erros.push(`data do cliente ${clientId}: ${r.error.message}`);
          else datasRefeitas++;
        }
      }
    }
    return { ok: erros.length === 0, dry, trocas: feitas, datasRefeitas, erros };
  } catch (e) {
    return { ...vazio, ok: false, erros: [e instanceof Error ? e.message : "erro"] };
  }
}
