export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { lerArquivo } from "@/lib/contracts/arquivo-ler";
import { mesDe, nomesNoZip } from "@/lib/contracts/arquivo-d4sign";

/**
 * GET /api/contracts/arquivo/zip?mes=2026-10
 * Os PDFs assinados do mês num .zip ("2026-10-15 - Cliente - documento.pdf"). O que ainda não tem PDF fica
 * de fora e aparece em "faltam.txt" dentro do .zip — o arquivo não finge estar completo. Só admin.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Informe o mês (aaaa-mm)." }, { status: 400 });

  const lido = await lerArquivo();
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 500 });
  const doMes = lido.itens.filter((i) => mesDe(i.assinadoEm) === mes);
  const comPdf = doMes.filter((i) => i.pdf);
  if (!comPdf.length) return NextResponse.json({ error: "Nenhum PDF deste mês chegou ainda." }, { status: 404 });

  const zip = new JSZip();
  const nomes = nomesNoZip(comPdf);
  const faltam = doMes.filter((i) => !i.pdf).map((i) => `${i.cliente} — ${i.documento}`);
  for (let k = 0; k < comPdf.length; k++) {
    const ref = comPdf[k].pdf!;
    const caminho = ref.startsWith("legal://") ? ref.slice("legal://".length) : ref;
    const { data, error } = await supabaseAdmin.storage.from("legal-docs").download(caminho);
    if (error || !data) { faltam.push(`${comPdf[k].cliente} — ${comPdf[k].documento} (não consegui ler o PDF guardado)`); continue; }
    zip.file(nomes[k], Buffer.from(await data.arrayBuffer()));
  }
  if (faltam.length) zip.file("faltam.txt", `Ainda sem PDF neste mês:\n${faltam.map((f) => `- ${f}`).join("\n")}\n`);
  const corpo = new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }));

  supabaseAdmin.from("vault_access_log").insert({
    user_id: user.id, user_email: user.email, client_id: null, resource_type: "contratos-do-mes",
    resource_path: `legal-docs/contracts-signed (${mes})`, action: "download",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null, user_agent: req.headers.get("user-agent") ?? null,
  }).then(({ error }) => { if (error) console.error("[arquivo/zip] vault_access_log:", error.message); });

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="contratos-${mes}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
