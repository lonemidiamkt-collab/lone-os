// lib/contracts/arquivo-ler.ts — o que a tela "Arquivo por mês" mostra (lib/contracts/arquivo-d4sign.ts junta).
//
// Só leitura do banco: nenhuma chamada à D4Sign aqui.

import { supabaseAdmin } from "@/lib/supabase/server";
import { juntarArquivo, type ContratoArquivo, type DocArquivo, type ItemArquivo } from "./arquivo-d4sign";

export async function lerArquivo(): Promise<{ ok: true; itens: ItemArquivo[] } | { ok: false; erro: string }> {
  const [docs, contratos, clientes] = await Promise.all([
    supabaseAdmin.from("d4sign_documentos")
      .select("document_uuid, nome, tipo, client_id, contract_id, assinado_em, pdf_path, pdf_erro")
      .eq("status", "assinado").limit(5000),
    supabaseAdmin.from("contracts")
      .select("id, client_id, version, signed_at, signed_pdf_path, d4sign_document_uuid")
      .not("signed_pdf_path", "is", null).limit(5000),
    supabaseAdmin.from("clients").select("id, name, nome_fantasia").limit(5000),
  ]);
  if (docs.error) return { ok: false, erro: `não consegui ler os documentos da D4Sign: ${docs.error.message}` };
  if (contratos.error) return { ok: false, erro: `não consegui ler os contratos: ${contratos.error.message}` };
  if (clientes.error) return { ok: false, erro: `não consegui ler os clientes: ${clientes.error.message}` };
  const nomes = new Map(((clientes.data as { id: string; name: string | null; nome_fantasia: string | null }[] | null) ?? [])
    .map((c) => [c.id, (c.nome_fantasia || c.name || "Cliente").trim()]));
  return {
    ok: true,
    itens: juntarArquivo((docs.data as unknown as DocArquivo[] | null) ?? [], (contratos.data as unknown as ContratoArquivo[] | null) ?? [], nomes),
  };
}
