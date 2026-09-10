export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { paraUrlPublica } from "@/lib/supabase/url-publica";
import { termoHtml } from "@/lib/reports/termoEncerramento";
import { CONTRATADA } from "@/lib/contracts/contratada";
import type { Offboarding } from "@/lib/clients/offboarding";

// POST /api/clients/offboarding/termo — gera (ou regera) o termo e guarda no bucket privado.
// GET  ?id=… — devolve o link assinado do termo já gerado.
//
// Gerar é um passo REVERSÍVEL de propósito: o pedido pede uma etapa de revisão antes do envio,
// porque situação financeira e entregas mudam de cliente para cliente. Regerar sobrescreve o
// arquivo — enquanto ninguém enviou, o termo é rascunho.

async function carregar(id: string) {
  const { data: off } = await supabaseAdmin
    .from("client_offboardings").select("*").eq("id", id).maybeSingle();
  if (!off) return null;
  const { data: cli } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, razao_social, cnpj, contact_name, endereco_cidade, join_date")
    .eq("id", off.client_id as string).maybeSingle();
  const { data: ciclo } = await supabaseAdmin.from("client_lifecycles")
    .select("iniciou_em").eq("client_id", off.client_id as string)
    .order("ciclo", { ascending: true }).limit(1).maybeSingle();
  return { off, cli, ciclo };
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const b = await req.json().catch(() => null) as { id?: string } | null;
  if (!b?.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const carga = await carregar(b.id);
  if (!carga?.cli) return NextResponse.json({ error: "encerramento ou cliente não encontrado" }, { status: 404 });
  const { off, cli, ciclo } = carga;

  const { data: membro } = await supabaseAdmin
    .from("team_members").select("name").eq("email", user.email).maybeSingle();
  const quem = (membro?.name as string) || user.email;

  const dados: Offboarding = {
    id: off.id as string, clientId: off.client_id as string,
    iniciativa: off.iniciativa as Offboarding["iniciativa"],
    motivo: off.motivo as string, motivoDetalhe: (off.motivo_detalhe as string) ?? null,
    solicitadoEm: off.solicitado_em as string, encerraEm: off.encerra_em as string,
    financeiroOk: (off.financeiro_ok as boolean) ?? null,
    financeiroNota: (off.financeiro_nota as string) ?? null,
    entregasOk: (off.entregas_ok as boolean) ?? null,
    entregasNota: (off.entregas_nota as string) ?? null,
    estado: off.estado as Offboarding["estado"],
    termoPath: (off.termo_path as string) ?? null,
    enviadoEm: (off.enviado_em as string) ?? null,
    confirmadoEm: (off.confirmado_em as string) ?? null,
  };

  try {
    const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
    const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
    const logo = await loadLoneLogo().catch(() => "");

    const html = termoHtml({
      agencia: {
        razaoSocial: CONTRATADA.razaoSocial,
        nomeFantasia: CONTRATADA.nomeFantasia,
        cnpj: CONTRATADA.cnpj,
      },
      cliente: {
        nomeFantasia: (cli.nome_fantasia as string) || (cli.name as string) || "Cliente",
        razaoSocial: (cli.razao_social as string) ?? null,
        cnpj: (cli.cnpj as string) ?? null,
        responsavel: (cli.contact_name as string) ?? null,
      },
      // A data de entrada vem do CICLO, não do cadastro: um cliente que já saiu e voltou tem duas,
      // e o termo deste encerramento fala do ciclo que está terminando.
      inicioParceria: (ciclo?.iniciou_em as string) || (cli.join_date as string) || off.solicitado_em as string,
      offboarding: dados,
      servicos: (off.servicos as string[]) ?? [],
      entregasExtra: (off.entregas_extra as string[]) ?? [],
      cidade: (cli.endereco_cidade as string) ?? null,
    }, logo);

    const pdf = await htmlToPdf(html);
    if (!pdf.ok || !pdf.buffer) {
      return NextResponse.json({ error: "não consegui renderizar o PDF" }, { status: 500 });
    }

    const caminho = `${off.client_id}/encerramento-${(off.id as string).slice(0, 8)}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage.from("contracts")
      .upload(caminho, pdf.buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    await supabaseAdmin.from("client_offboardings").update({
      termo_path: caminho,
      termo_gerado_em: new Date().toISOString(),
      // Só avança o estado quando ainda é rascunho: regerar depois de enviado não desfaz o envio.
      ...(["rascunho", "em_revisao"].includes(off.estado as string) ? { estado: "termo_gerado" } : {}),
    }).eq("id", off.id as string);

    await supabaseAdmin.from("offboarding_events").insert({
      offboarding_id: off.id as string, client_id: off.client_id as string,
      acao: "termination_term_generated", ator: quem, detalhe: { caminho },
    }).then(() => {}, () => {});

    const { data: assinada } = await supabaseAdmin.storage.from("contracts").createSignedUrl(caminho, 900);
    return NextResponse.json({ ok: true, url: paraUrlPublica(assinada?.signedUrl), caminho });
  } catch (e) {
    console.error("[offboarding/termo]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const { data: off } = await supabaseAdmin
    .from("client_offboardings").select("termo_path").eq("id", id).maybeSingle();
  if (!off?.termo_path) return NextResponse.json({ error: "termo ainda não foi gerado" }, { status: 404 });

  const { data } = await supabaseAdmin.storage.from("contracts")
    .createSignedUrl(off.termo_path as string, 900);
  return NextResponse.json({ ok: true, url: paraUrlPublica(data?.signedUrl) });
}
