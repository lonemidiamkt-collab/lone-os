import { NextRequest, NextResponse } from "next/server";
import { limiteDoDocumento } from "@/lib/onboarding/etapas";
import { valorAposUpload } from "@/lib/onboarding/docs";
import { LIMITE_UPLOAD, ESPERA_SUGERIDA_S } from "@/lib/onboarding/upload";
import { criarLimite, ipDe } from "@/lib/portal/limite";
import { createClient } from "@supabase/supabase-js";
import { getServerUser } from "@/lib/supabase/auth-server";

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://supabase-kong-1:8000";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Route uploads to the correct bucket by document type.
// - logo          → brand-assets (public, served via publicUrl)
// - contrato_social, identidade → legal-docs (private, served via signed URL from /api/storage/signed-url)
const BUCKET_BY_DOC_TYPE: Record<string, "brand-assets" | "legal-docs"> = {
  logo: "brand-assets",
  wallet: "brand-assets", // referências/paleta/logo do Creative Wallet — público, sem sobrescrever coluna do cliente
  contrato_social: "legal-docs",
  identidade: "legal-docs",
};

// ─── Limite de envios (em memória, uma instância) ────────────────────────────
// 24/10/2026 (auditoria de erro recuperável, item 1.5): era 1 upload por IP a cada 5 s — o 2º e o 3º
// arquivo de uma seleção levavam 429. Agora o limite é por LINK de cadastro (token) ou por pessoa
// logada, N por minuto, e o teto por IP fica só contra robô. Regras em lib/onboarding/upload.ts.
const LIMITE_IP = criarLimite(LIMITE_UPLOAD.porIp, LIMITE_UPLOAD.janelaMs);
const LIMITE_TOKEN = criarLimite(LIMITE_UPLOAD.porToken, LIMITE_UPLOAD.janelaMs);
const LIMITE_USUARIO = criarLimite(LIMITE_UPLOAD.porUsuario, LIMITE_UPLOAD.janelaMs);

function muitosEnvios() {
  return NextResponse.json(
    { error: "Muitos arquivos seguidos. Aguarde alguns segundos — a página tenta de novo sozinha." },
    { status: 429, headers: { "Retry-After": String(ESPERA_SUGERIDA_S) } },
  );
}

export async function POST(req: NextRequest) {
  if (LIMITE_IP.estourou(ipDe(req.headers))) return muitosEnvios();

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Envio incompleto. Tente de novo." }, { status: 400 });
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string;
  const docType = formData.get("docType") as string;

  if (!file || !clientId || !docType) {
    return NextResponse.json({ error: "file, clientId and docType required" }, { status: 400 });
  }

  // ─── Autorização ────────────────────────────────────────────
  // Esta rota usa service_role (bypassa RLS) e grava docs sensíveis (identidade,
  // contrato) em qualquer pasta de cliente. Exigimos UMA de duas provas:
  //   1. Usuário LOGADO (uploads internos: cadastro, /clients, modal de novo cliente).
  //   2. Token de onboarding VÁLIDO amarrado a ESTE clientId (portal público do cliente).
  // Sem isso, qualquer anônimo que adivinhe um UUID de cliente poderia sobrescrever
  // os documentos dele. O token (ob-<128 bits>) não é enumerável.
  const user = await getServerUser(req);
  if (!user) {
    const token = (formData.get("token") as string | null)?.trim() || null;
    if (!token) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const { data: sub } = await supabase
      .from("client_onboarding_submissions")
      .select("client_id")
      .eq("token", token)
      .maybeSingle();
    if (!sub || sub.client_id !== clientId) {
      return NextResponse.json({ error: "Token inválido para este cliente." }, { status: 401 });
    }
    // Só conta depois de validar: token inventado não ocupa lugar no limite.
    if (LIMITE_TOKEN.estourou(token)) return muitosEnvios();
  } else if (LIMITE_USUARIO.estourou(user.id)) {
    return muitosEnvios();
  }

  const bucket = BUCKET_BY_DOC_TYPE[docType];
  if (!bucket) {
    return NextResponse.json({ error: `docType invalido: ${docType}` }, { status: 400 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return NextResponse.json({ error: "clientId inválido." }, { status: 400 });
  }

  // Extensão E tipo precisam bater com a lista, e o content-type gravado vem daqui, não do
  // navegador: antes um "x.pdf" enviado como text/html era servido como HTML pelo domínio do painel.
  const CONTENT_TYPE_BY_EXT: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", pdf: "application/pdf",
  };
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  const tipoDeclaradoOk = !file.type || file.type === contentType || (ext === "jpg" && file.type === "image/jpeg");
  if (!contentType || !tipoDeclaradoOk) {
    return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WEBP, HEIC ou PDF." }, { status: 400 });
  }

  // Limite por documento (lib/onboarding/etapas.ts): contrato social escaneado passa fácil de 10 MB.
  const limite = limiteDoDocumento(docType);
  if (file.size > limite) {
    return NextResponse.json({ error: `Arquivo muito grande. Máximo ${limite / (1024 * 1024)} MB.` }, { status: 400 });
  }

  const path = `${clientId}/${docType}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error("[Upload]", bucket, "error:", error);
    return NextResponse.json({ error: "Falha no upload: " + error.message }, { status: 500 });
  }

  // Map docType → clients table column
  const DOC_COLUMN: Record<string, string> = {
    contrato_social: "doc_contrato_social",
    identidade: "doc_identidade",
    logo: "doc_logo",
  };

  const dbColumn = DOC_COLUMN[docType];

  // Public bucket: return usable public URL.
  // Private bucket: return the storage path (prefixed) — frontend must request a signed URL to access.
  if (bucket === "brand-assets") {
    // URL COMPLETA (browser-facing), igual ao image_url dos cards: base pública + path.
    // Salvar só "/storage/..." (sem o segmento /supabase do proxy) fazia o <img> quebrar (401/404).
    const publicBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const publicUrl = `${publicBase}/storage/v1/object/public/${bucket}/${path}`;
    // Persist URL to clients table server-side (service role bypasses RLS, no client-side auth needed)
    if (dbColumn) {
      await supabase.from("clients").update({ [dbColumn]: publicUrl }).eq("id", clientId);
    }
    return NextResponse.json({ url: publicUrl, path, bucket });
  }

  // Private: save prefixed path so frontend can distinguish it from legacy public URLs
  const privateRef = `legal://${path}`;
  // Persist URL to clients table server-side (service role bypasses RLS).
  // Campo de vários arquivos ACRESCENTA (24/10/2026, item 1.13): gravar só a url nova deixava a ficha
  // do cliente ativo com o último arquivo. Sem conseguir ler o que já estava lá, não grava — o arquivo
  // está guardado e o rascunho do cadastro leva a lista inteira; sobrescrever apagaria as outras páginas.
  if (dbColumn) {
    const { data: atual, error: eLe } = await supabase.from("clients").select(dbColumn).eq("id", clientId).maybeSingle();
    if (eLe) {
      console.error("[Upload] ficha não lida; arquivo guardado sem atualizar a ficha:", eLe.message);
    } else {
      const valor = valorAposUpload(dbColumn, (atual as unknown as Record<string, unknown> | null)?.[dbColumn] as string | null, privateRef);
      const { error: dbErr } = await supabase.from("clients").update({ [dbColumn]: valor }).eq("id", clientId);
      if (dbErr) console.error("[Upload] DB update failed:", dbErr);
    }
  }
  return NextResponse.json({ url: privateRef, path, bucket });
}
