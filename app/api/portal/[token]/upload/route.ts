export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { lerLinkDoPortal, FRASE_INDISPONIVEL, type LinhaDeAcesso } from "@/lib/portal/token";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { criarLimite } from "@/lib/portal/limite";
import { loteValido, podeApagarMaterial } from "@/lib/portal/envio-material";
import { registroDeLotes } from "@/lib/portal/envio-material-server";

// POST /api/portal/[token]/upload — o CLIENTE manda material pelo painel.
//
// PRA QUE (Roberto, 31/08): "pode criar arquitetura de o cliente mandar o material pelo painel, mas
// o cliente APROVAR pelo painel ainda não". Hoje foto de produto, logo e tabela de preço chegam
// pelo WhatsApp e somem na rolagem do grupo — quem vai fazer a arte tem que caçar a mensagem de
// três dias atrás. Aqui o arquivo fica preso ao cliente, com a observação e a data.
//
// Público via token, como o resto do portal. Por isso os limites são explícitos: tipo de arquivo,
// tamanho, e quantidade por hora. Um endpoint público que aceita arquivo sem teto é um convite.
//
// 24/10/2026 (item 1.11): com `lote` + `avisar=depois` (a página nova), o arquivo sobe SEM mensagem —
// a página pede UM aviso com todos no fim (./aviso), e se a aba fechar no meio o servidor avisa
// sozinho (lib/portal/envio-material.ts). Sem lote, segue o aviso por arquivo de antes.
// DELETE ?id= apaga um arquivo que o time ainda não abriu.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — cabe vídeo curto de celular
const TIPOS_OK = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
  "video/mp4", "video/quicktime",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv",
]);

const LIMITE = criarLimite(30, 3600_000); // 30 arquivos por hora por cliente
const LIMITE_APAGAR = criarLimite(60, 3600_000); // apagar não gasta a cota de envio

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Banco que oscila não é link inválido (26/10/2026): 503 com "tente de novo", não 404.
  const lido = await lerLinkDoPortal<LinhaDeAcesso & Record<string, unknown> & { id: string }>(token, "id, name, whatsapp_group_jid");
  if (lido.estado === "indisponivel") return NextResponse.json({ error: FRASE_INDISPONIVEL }, { status: 503 });
  if (lido.estado === "invalido") return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  const client = lido.linha;
  if (LIMITE.estourou(client.id as string)) {
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
  const lote = String(form?.get("lote") ?? "");
  const avisarDepois = loteValido(lote) && form?.get("avisar") === "depois";

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
  // acha que já mandou. Envio em lote: o aviso é um só, no fim (rota ./aviso, ou o automático).
  if (avisarDepois) {
    registroDeLotes().chegou(lote, client.id as string, registro.id as string);
    return NextResponse.json({ ok: true, id: registro.id });
  }
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

// DELETE /api/portal/[token]/upload?id=… — o cliente apaga um arquivo que mandou errado, enquanto o
// time ainda não abriu (visto_em vazio). Depois de aberto, o arquivo pode já estar em uso: só a equipe tira.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });

  // Banco que oscila não é link inválido (26/10/2026): 503 com "tente de novo", não 404.
  const lido = await lerLinkDoPortal<LinhaDeAcesso & Record<string, unknown> & { id: string }>(token, "id, name, whatsapp_group_jid");
  if (lido.estado === "indisponivel") return NextResponse.json({ error: FRASE_INDISPONIVEL }, { status: 503 });
  if (lido.estado === "invalido") return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  const client = lido.linha;
  if (LIMITE_APAGAR.estourou(client.id as string)) {
    return NextResponse.json({ error: "Muitas ações seguidas. Tente daqui a pouco." }, { status: 429 });
  }

  const { data: up, error: eLe } = await supabaseAdmin.from("client_uploads")
    .select("id, storage_path, visto_em").eq("id", id).eq("client_id", client.id).maybeSingle();
  if (eLe) return NextResponse.json({ error: "Não consegui apagar agora. Tente de novo em instantes." }, { status: 503 });
  if (!up) return NextResponse.json({ error: "Este arquivo não está mais aqui." }, { status: 404 });
  if (!podeApagarMaterial(up)) {
    return NextResponse.json({ error: "O time já abriu este arquivo. Para tirar, fale com a equipe da Lone Mídia." }, { status: 409 });
  }

  // Condicionado a continuar não aberto: se alguém do time abriu no meio, não apaga.
  const { data: apagados, error: eDel } = await supabaseAdmin.from("client_uploads").delete()
    .eq("id", id).eq("client_id", client.id).is("visto_em", null).select("id");
  if (eDel) return NextResponse.json({ error: "Não consegui apagar agora. Tente de novo em instantes." }, { status: 503 });
  if (!apagados?.length) {
    return NextResponse.json({ error: "O time acabou de abrir este arquivo. Para tirar, fale com a equipe da Lone Mídia." }, { status: 409 });
  }
  const { error: eSto } = await supabaseAdmin.storage.from("client-uploads").remove([up.storage_path as string]);
  if (eSto) console.error("[portal/upload] registro apagado, arquivo ficou no storage:", up.storage_path, eSto.message);
  return NextResponse.json({ ok: true });
}
