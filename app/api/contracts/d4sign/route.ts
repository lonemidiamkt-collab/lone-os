export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { faltaMigracao, nomeDoCliente, nomeDoDocumento } from "@/lib/contracts/assinatura";
import { lerSignatariosGravados } from "@/lib/contracts/d4sign-signatarios";

// GET /api/contracts/d4sign?clientId=… — os documentos da D4Sign de um cliente: situação e, por signatário,
// quem já assinou e quem falta. Sem clientId: a carteira (esperando assinatura + assinados nos últimos 30
// dias), para a tela de Contratos. Só admin. A chave do signatário (key_signer) nunca sai daqui.

const COLUNAS = "document_uuid, nome, status, tipo, client_id, contract_id, signatarios, enviado_em, assinado_em, visto_em";

export interface DocumentoNaTela {
  documento: string;
  nome: string | null;
  /** Do cadastro, ou tirado do nome do arquivo quando o documento não ligou a um cliente. */
  cliente: string;
  situacao: "pendente" | "assinado" | "cancelado" | "outro";
  tipo: "contrato" | "documento" | null;
  clienteId: string | null;
  contratoId: string | null;
  enviadoEm: string | null;
  assinadoEm: string | null;
  signatarios: { nome: string | null; email: string | null; papel: string; assinou: boolean; assinadoEm: string | null }[];
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  const clientId = req.nextUrl.searchParams.get("clientId");

  let q = supabaseAdmin.from("d4sign_documentos").select(COLUNAS).order("visto_em", { ascending: false }).limit(200);
  if (clientId) q = q.eq("client_id", clientId);
  else q = q.or(`status.eq.pendente,assinado_em.gte.${new Date(Date.now() - 30 * 86_400_000).toISOString()}`);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({
      error: faltaMigracao(error) ? "A integração com a D4Sign ainda não foi ligada no banco." : `Não consegui ler os documentos da D4Sign: ${error.message}`,
    }, { status: 503 });
  }
  const linhas = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(linhas.map((l) => l.client_id as string | null).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const c = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", ids);
    for (const x of (c.data ?? []) as { id: string; name?: string | null; nome_fantasia?: string | null }[]) nomes.set(x.id, nomeDoCliente(x));
  }
  const documentos: DocumentoNaTela[] = linhas.map((l) => ({
    documento: l.document_uuid as string,
    nome: (l.nome as string | null) ?? null,
    cliente: (l.client_id ? nomes.get(l.client_id as string) : undefined) ?? nomeDoDocumento((l.nome as string | null) ?? "documento"),
    situacao: l.status as DocumentoNaTela["situacao"],
    tipo: (l.tipo as DocumentoNaTela["tipo"]) ?? null,
    clienteId: (l.client_id as string | null) ?? null,
    contratoId: (l.contract_id as string | null) ?? null,
    enviadoEm: (l.enviado_em as string | null) ?? null,
    assinadoEm: (l.assinado_em as string | null) ?? null,
    signatarios: lerSignatariosGravados(l.signatarios).map(({ nome, email, papel, assinou, assinadoEm }) => ({ nome, email, papel, assinou, assinadoEm })),
  }));
  return NextResponse.json({ documentos }, { headers: { "Cache-Control": "no-store" } });
}
