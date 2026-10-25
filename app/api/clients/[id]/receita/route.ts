export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/clients/[id]/receita — consulta o CNPJ do cliente na Receita (BrasilAPI) e grava porte,
// atividade (CNAE) e situação na ficha. Só gestão. Ver lib/empresa/receita.ts.
//
// Para os clientes que entraram antes do cadastro pelo CNPJ (18/10/2026). O nicho só é preenchido
// se estiver vazio — o que a equipe já definiu à mão vale mais que o palpite pelo CNAE. O número e o complemento do
// endereço também, e só com o mesmo CEP da Receita; ficha sem endereço recebe o do CNPJ quando o texto antigo está vazio
// ou bate com ele (lib/empresa/endereco.ts).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { consultarCnpj } from "@/lib/empresa/receita-server";
import { colunasDaReceita } from "@/lib/empresa/receita";
import { enderecoPelaReceita, numeroPelaReceita, type FichaSemEndereco } from "@/lib/empresa/endereco";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const { data: cli, error } = await supabaseAdmin.from("clients")
    .select("id, cnpj, nicho, endereco, endereco_cep, endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (!cli.cnpj) return NextResponse.json({ error: "Este cliente não tem CNPJ no cadastro." }, { status: 400 });

  const r = await consultarCnpj(cli.cnpj as string);
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status });

  const ficha = cli as unknown as FichaSemEndereco;
  const inteiro = enderecoPelaReceita(ficha, r.empresa);
  const endereco: Record<string, string> = { ...numeroPelaReceita(ficha, r.empresa), ...(inteiro.acao === "preencher" ? inteiro.campos : {}) };
  const campos: Record<string, unknown> = { ...colunasDaReceita(r.empresa), ...endereco };
  if (!(cli.nicho as string | null)?.trim() && r.empresa.nichoRotulo) campos.nicho = r.empresa.nichoRotulo;
  const { error: eGrava } = await supabaseAdmin.from("clients").update(campos).eq("id", id);
  if (eGrava) return NextResponse.json({ error: eGrava.message }, { status: 500 });

  return NextResponse.json({ ok: true, empresa: r.empresa, nichoPreenchido: "nicho" in campos, numeroPreenchido: "endereco_numero" in endereco, enderecoPreenchido: inteiro.acao === "preencher" });
}
