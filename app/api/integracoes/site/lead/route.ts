export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { avaliarLead, ROTULO_DESCARTE } from "@/lib/crm/filtro-lead";
import { atividadeDoCadastro, conferirAssinatura, leadDoPacote, validarPacote } from "@/lib/crm/site-lead";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { mesmoWhatsapp, formatarWhatsapp } from "@/lib/team/whatsapp";

// POST /api/integracoes/site/lead — o cadastro do formulário do site (lonemidia.com, direto ou vindo
// de anúncio) entra no comercial como lead NOVO, com o WhatsApp pronto para um clique.
//
// Rota pública, protegida só pela ASSINATURA: HMAC-SHA256 de `${x-lone-timestamp}.${corpo}` com o
// segredo LONEOS_SITE_LEAD_SECRET (o mesmo valor que o site guarda em LONEOS_LEAD_SECRET), carimbo
// de no máximo 5 min. É o esquema que o site já usa com o n8n.
//
// Caminho: assinatura → idempotência (crm_recebidos, pelo id do cadastro) → filtro de lixo por regra
// (lib/crm/filtro-lead.ts; lixo vai para crm_leads_descartados, nunca para o funil) → já é cliente?
// → já é lead aberto? → cria o lead → aviso no sino de quem cuida do comercial.
// Erro de banco devolve 500 de propósito: o site tenta de novo (3 vezes) e a planilha guarda a cópia.

type Resultado = "criado" | "duplicado" | "cliente" | "descartado";

async function registrarRecebido(externoId: string): Promise<"novo" | "repetido"> {
  const { error } = await supabaseAdmin.from("crm_recebidos").insert({ externo_id: externoId, origem: "site" });
  if (!error) return "novo";
  if (error.code === "23505") return "repetido";
  throw new Error(`crm_recebidos: ${error.message}`);
}

async function fecharRecebido(externoId: string, resultado: Resultado, leadId: string | null) {
  await supabaseAdmin.from("crm_recebidos").update({ resultado, lead_id: leadId }).eq("externo_id", externoId);
}

async function avisar(titulo: string, corpo: string) {
  const { error } = await supabaseAdmin.from("notifications").insert({
    type: "content", title: titulo, body: corpo, target_user: DESTINO_AVISOS_COMERCIAL, read: false,
  });
  if (error) console.error("[site/lead] aviso no sino falhou:", error.message);
}

export async function POST(req: NextRequest) {
  const segredo = process.env.LONEOS_SITE_LEAD_SECRET;
  if (!segredo) {
    console.error("[site/lead] LONEOS_SITE_LEAD_SECRET ausente — recebimento desligado");
    return NextResponse.json({ ok: false, error: "recebimento não configurado" }, { status: 503 });
  }
  const corpo = await req.text();
  const assinatura = conferirAssinatura({
    segredo, corpo, agora: Date.now(),
    timestamp: req.headers.get("x-lone-timestamp"), assinatura: req.headers.get("x-lone-signature"),
  });
  if (!assinatura.ok) return NextResponse.json({ ok: false, error: assinatura.motivo }, { status: 401 });

  let json: unknown;
  try { json = JSON.parse(corpo); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const v = validarPacote(json);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.erro }, { status: 400 });
  const p = v.pacote;

  try {
    if ((await registrarRecebido(p.id)) === "repetido") return NextResponse.json({ ok: true, repetido: true });

    const veredito = avaliarLead({
      nome: p.lead.nomeCompleto, empresa: p.lead.empresa, email: p.lead.emailCorporativo,
      telefone: p.lead.whatsappE164 ?? p.lead.whatsappDisplay, desafio: p.lead.maiorDesafio,
    });
    if (!veredito.ok) {
      await supabaseAdmin.from("crm_leads_descartados").insert({
        externo_id: p.id, origem: "site", motivo: veredito.motivo, detalhe: veredito.detalhe,
        nome: p.lead.nomeCompleto?.slice(0, 120) ?? null, empresa: p.lead.empresa?.slice(0, 120) ?? null,
        telefone: (p.lead.whatsappE164 ?? "").slice(0, 30) || null, email: p.lead.emailCorporativo?.slice(0, 160) ?? null,
        pacote: p,
      });
      await fecharRecebido(p.id, "descartado", null);
      return NextResponse.json({ ok: true, descartado: ROTULO_DESCARTE[veredito.motivo] });
    }

    const tel = veredito.telefone;
    const nomeEmpresa = (p.lead.empresa || p.lead.nomeCompleto).trim();
    if (tel) {
      // Já é cliente (ativo ou não)? Não vira lead: vira aviso — pode ser pedido de upsell ou reativação.
      const { data: clientes } = await supabaseAdmin.from("clients")
        .select("id, name, phone, contact_phone, company_phone, whatsapp_team_phone, churned_at").limit(2000);
      const cliente = (clientes ?? []).find((c) =>
        [c.phone, c.contact_phone, c.company_phone, c.whatsapp_team_phone].some((x) => mesmoWhatsapp(x as string | null, tel)));
      if (cliente) {
        const ex = cliente.churned_at ? "Ex-cliente" : "Cliente";
        await avisar(`${ex} preencheu o formulário do site: ${cliente.name}`, `Desafio: ${(p.lead.maiorDesafio ?? "—").slice(0, 160)} · WhatsApp ${formatarWhatsapp(tel)}`);
        await fecharRecebido(p.id, "cliente", null);
        return NextResponse.json({ ok: true, cliente: true });
      }
      // Já é lead aberto com esse WhatsApp? Junta: registra e sobe no Hoje, sem criar outro.
      const { data: leads } = await supabaseAdmin.from("crm_leads").select("id, telefone, estagio, empresa, contato_nome").not("telefone", "is", null).limit(5000);
      const existente = (leads ?? []).find((l) => !["ganho", "perdido"].includes(l.estagio as string) && mesmoWhatsapp(l.telefone as string, tel));
      if (existente) {
        await db.insertLeadActivity({ leadId: existente.id as string, tipo: "nota", texto: `Preencheu o formulário do site de novo. ${p.lead.maiorDesafio ? `Desafio: ${p.lead.maiorDesafio.slice(0, 300)}` : ""}`.trim(), autor: "Site" });
        await supabaseAdmin.from("crm_leads").update({ updated_at: new Date().toISOString() }).eq("id", existente.id);
        await avisar(`Voltou pelo site: ${(existente.empresa as string) || (existente.contato_nome as string)}`, `Já estava no funil. Responda em até 5 min — WhatsApp ${formatarWhatsapp(tel)}`);
        await fecharRecebido(p.id, "duplicado", existente.id as string);
        return NextResponse.json({ ok: true, duplicado: true, leadId: existente.id });
      }
    }

    const agora = new Date().toISOString();
    const lead = await db.insertCrmLead(leadDoPacote(p, veredito, agora));
    await db.insertLeadActivity({ leadId: lead.id, tipo: "nota", texto: atividadeDoCadastro(p, agora), autor: "Site" }).catch(() => {});
    await avisar(
      `Lead novo do site: ${nomeEmpresa}${p.lead.segmento ? ` (${p.lead.segmento})` : ""}`,
      tel ? `${lead.origem}. Responda em até 5 min — WhatsApp ${formatarWhatsapp(tel)}` : `${lead.origem}. O telefone veio errado: confira pelo e-mail ${p.lead.emailCorporativo ?? ""}.`,
    );
    await fecharRecebido(p.id, "criado", lead.id);
    return NextResponse.json({ ok: true, criado: true, leadId: lead.id });
  } catch (e) {
    console.error("[site/lead] falhou:", e instanceof Error ? e.message : e);
    // Libera o id para o site tentar de novo (senão a próxima tentativa cairia como "repetido").
    await supabaseAdmin.from("crm_recebidos").delete().eq("externo_id", p.id).is("resultado", null);
    return NextResponse.json({ ok: false, error: "falha ao registrar o lead" }, { status: 500 });
  }
}
