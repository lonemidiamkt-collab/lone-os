export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { faltaMigracao } from "@/lib/contracts/assinatura";
import { lerSignatariosGravados } from "@/lib/contracts/d4sign-signatarios";

// GET /api/contracts/d4sign?clientId=… — os documentos da D4Sign de um cliente (ou, sem clientId, os que
// esperam assinatura em toda a carteira): situação, quem já assinou e quem falta, e o PDF assinado.
// Só admin (contrato leva CPF/CNPJ e valor). A chave do signatário (key_signer) nunca sai daqui.

const COLUNAS = "document_uuid, nome, status, tipo, client_id, contract_id, signatarios, enviado_em, assinado_em, pdf_path, pdf_erro, envio_etapa, visto_em";

export interface DocumentoNaTela {
  documento: string;
  nome: string | null;
  situacao: "pendente" | "assinado" | "cancelado" | "outro";
  tipo: "contrato" | "documento" | null;
  clienteId: string | null;
  contratoId: string | null;
  enviadoEm: string | null;
  assinadoEm: string | null;
  pdf: string | null;
  pdfErro: string | null;
  etapaDoEnvio: "subido" | "signatarios" | "enviado" | null;
  signatarios: { nome: string | null; email: string | null; papel: string; assinou: boolean; assinadoEm: string | null }[];
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  const clientId = req.nextUrl.searchParams.get("clientId");

  let q = supabaseAdmin.from("d4sign_documentos").select(COLUNAS).order("visto_em", { ascending: false }).limit(200);
  q = clientId ? q.eq("client_id", clientId) : q.eq("status", "pendente");
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({
      error: faltaMigracao(error) ? "A integração com a D4Sign ainda não foi ligada no banco." : `Não consegui ler os documentos da D4Sign: ${error.message}`,
    }, { status: 503 });
  }
  const documentos: DocumentoNaTela[] = (data ?? []).map((l: Record<string, unknown>) => ({
    documento: l.document_uuid as string,
    nome: (l.nome as string | null) ?? null,
    situacao: l.status as DocumentoNaTela["situacao"],
    tipo: (l.tipo as DocumentoNaTela["tipo"]) ?? null,
    clienteId: (l.client_id as string | null) ?? null,
    contratoId: (l.contract_id as string | null) ?? null,
    enviadoEm: (l.enviado_em as string | null) ?? null,
    assinadoEm: (l.assinado_em as string | null) ?? null,
    pdf: (l.pdf_path as string | null) ?? null,
    pdfErro: (l.pdf_erro as string | null) ?? null,
    etapaDoEnvio: (l.envio_etapa as DocumentoNaTela["etapaDoEnvio"]) ?? null,
    signatarios: lerSignatariosGravados(l.signatarios).map(({ nome, email, papel, assinou, assinadoEm }) => ({ nome, email, papel, assinou, assinadoEm })),
  }));
  return NextResponse.json({ documentos }, { headers: { "Cache-Control": "no-store" } });
}
