export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";

// POST /api/portal/[token]/upload — o CLIENTE manda material pelo painel.
//
// PRA QUE (Roberto, 31/08): "pode criar arquitetura de o cliente mandar o material pelo painel, mas
// o cliente APROVAR pelo painel ainda não". Hoje foto de produto, logo e tabela de preço chegam
// pelo WhatsApp e somem na rolagem do grupo — quem vai fazer a arte tem que caçar a mensagem de
// três dias atrás. Aqui o arquivo fica preso ao cliente, com a observação e a data.
//
// Público via token, como o resto do portal. Por isso os limites são explícitos: tipo de arquivo,
// tamanho, e quantidade por hora. Um endpoint público que aceita arquivo sem teto é um convite.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — cabe vídeo curto de celular
const TIPOS_OK = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
  "video/mp4", "video/quicktime",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv",
]);

const RATE = new Map<string, { count: number; reset: number }>();
function limitado(token: string): boolean {
  const agora = Date.now();
  const e = RATE.get(token);
  if (!e || e.reset < agora) { RATE.set(token, { count: 1, reset: agora + 3600_000 }); return false; }
  if (e.count >= 30) return true;  // 30 arquivos por hora por cliente
  e.count++; return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: client } = await supabaseAdmin.from("clients")
    .select("id, name, public_report_enabled, public_report_token_revoked_at, whatsapp_group_jid")
    .eq("public_report_token", token).single();
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  }
  if (limitado(token)) {
    return NextResponse.json({ error: "Muitos envios seguidos. Tente daqui a pouco." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo recebido." }, { status: 400 });
  }
  if (arquivo.size === 0) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 25 MB. Se for vídeo, mande um trecho." }, { status: 413 });
  }
  if (!TIPOS_OK.has(arquivo.type)) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie imagem, vídeo, PDF ou planilha." }, { status: 415 });
  }

  const observacao = String(form?.get("observacao") ?? "").trim().slice(0, 600);
  const enviadoPor = String(form?.get("enviado_por") ?? "").trim().slice(0, 80);

  // Nome no storage é gerado, nunca o que veio do cliente: nome de arquivo é entrada de usuário e
  // vai pra um path. O nome original fica na tabela, para o time reconhecer.
  const ext = (arquivo.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  const caminho = `${client.id}/${new Date().toISOString().slice(0, 10)}/${randomBytes(8).toString("hex")}.${ext}`;

  const buf = Buffer.from(await arquivo.arrayBuffer());
  const { error: erroUp } = await supabaseAdmin.storage.from("client-uploads")
    .upload(caminho, buf, { contentType: arquivo.type, upsert: false });
  if (erroUp) return NextResponse.json({ error: `Falha ao guardar: ${erroUp.message}` }, { status: 500 });

  const { data: registro, error: erroIns } = await supabaseAdmin.from("client_uploads").insert({
    client_id: client.id, storage_path: caminho,
    file_name: arquivo.name.slice(0, 200), mime_type: arquivo.type, size_bytes: arquivo.size,
    observacao: observacao || null, enviado_por: enviadoPor || null,
  }).select("id").single();

  if (erroIns) {
    // Sem registro, o arquivo existiria no bucket sem ninguém saber — some do mesmo jeito que some
    // no grupo do WhatsApp, que é o problema que isto veio resolver.
    await supabaseAdmin.storage.from("client-uploads").remove([caminho]);
    return NextResponse.json({ error: `Falha ao registrar: ${erroIns.message}` }, { status: 500 });
  }

  // Avisa o time. Material que chega e ninguém vê é igual a material que não chegou — e o cliente
  // acha que já mandou.
  const jid = process.env.CS_TEAM_GROUP_JID || "";
  if (jid) {
    const linhas = [
      `📎 *${client.name}* mandou material pelo painel`,
      enviadoPor ? `Enviado por: ${enviadoPor}` : "",
      `Arquivo: ${arquivo.name} (${Math.round(arquivo.size / 1024)} KB)`,
      observacao ? `\n_"${observacao}"_` : "",
    ].filter(Boolean).join("\n");
    await csSendGroupText(jid, linhas, undefined, { origem: "portal-upload", destino: "interno" })
      .catch(() => { /* aviso é acessório: o arquivo já está guardado e registrado */ });
  }

  return NextResponse.json({ ok: true, id: registro.id });
}
