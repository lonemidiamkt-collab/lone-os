export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { estadoGoogle } from "@/lib/prospeccao/google";
import { linkDaPasta } from "@/lib/drive/pasta-cliente";
import { garantirPastaDoCliente } from "@/lib/drive/sincronizar-pasta";

// /api/clients/[id]/drive — a pasta do cliente no Google Drive da Lone (lib/drive/).
//   GET  → estado: links (Documentos e a pasta inteira só para admin), quem edita Fotos e Vídeos, última
//          sincronia, falha e avisos, e se o Google da Lone está pronto para o Drive.
//   POST → cria a pasta (ou põe em dia: documentos da ficha e acessos de social/designer). Só gestão.
// A pasta nasce sozinha quando o cliente termina o cadastro; o POST é o "Tentar de novo" e o caminho de
// quem entrou por outro lugar.

const PAPEIS_VER = ["admin", "manager", "traffic", "social", "designer"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, [...PAPEIS_VER]);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const { data: c, error } = await supabaseAdmin.from("clients")
    .select("id, drive_link, drive_pasta_id, drive_documentos_id, drive_fotos_id, drive_acessos, drive_sincronizado_em, drive_erro, drive_avisos, drive_trava_em")
    .eq("id", id).maybeSingle();
  if (error) {
    const semMigration = /drive_/.test(error.message) && /column/i.test(error.message);
    return NextResponse.json({ error: semMigration ? "A pasta do Drive ainda não foi ligada no banco (migration pendente)." : `Não consegui ler o cliente: ${error.message}` }, { status: 500 });
  }
  if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const verDocumentos = gate.papel === "admin";
  const podeCriar = !!gate.papel && GESTAO.includes(gate.papel);
  const emails = Array.isArray(c.drive_acessos) ? (c.drive_acessos as string[]) : [];
  let editam: string[] = emails;
  if (emails.length) {
    const { data: eq } = await supabaseAdmin.from("team_members").select("name, email").in("email", emails);
    const nomes = new Map((eq ?? []).map((m) => [String(m.email).toLowerCase(), m.name as string]));
    editam = emails.map((e) => nomes.get(e.toLowerCase()) ?? e);
  }
  const g = await estadoGoogle();
  const trava = c.drive_trava_em ? new Date(c.drive_trava_em as string).getTime() : 0;

  return NextResponse.json({
    existe: !!c.drive_pasta_id,
    fotos: linkDaPasta(c.drive_fotos_id as string | null),
    documentos: verDocumentos ? linkDaPasta(c.drive_documentos_id as string | null) : null,
    pasta: verDocumentos ? linkDaPasta(c.drive_pasta_id as string | null) : null,
    /** O "Drive" da ficha aponta para outro lugar (link que já existia antes da pasta). */
    driveLinkDiferente: !!c.drive_link && !!c.drive_fotos_id && !String(c.drive_link).includes(String(c.drive_fotos_id)),
    editam,
    sincronizadoEm: c.drive_sincronizado_em ?? null,
    erro: c.drive_erro ?? null,
    avisos: Array.isArray(c.drive_avisos) ? c.drive_avisos : [],
    trabalhando: trava > Date.now() - 10 * 60_000,
    verDocumentos,
    podeCriar,
    google: podeCriar ? { conectado: g.conectado, drive: g.drive, email: g.email ?? null } : { conectado: g.conectado, drive: g.drive, email: null },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const r = await garantirPastaDoCliente(id, { origem: "ficha" });
  if (!r.ok) return NextResponse.json({ error: r.erro ?? "A pasta não foi criada.", ocupada: !!r.ocupada }, { status: r.ocupada ? 409 : 502 });
  const verDocumentos = gate.papel === "admin";
  return NextResponse.json({
    ok: true,
    criada: r.criada,
    avisos: r.avisos,
    editam: r.editamFotos ?? [],
    documentos: r.documentos ?? null,
    links: r.links ? { fotos: r.links.fotos, documentos: verDocumentos ? r.links.documentos : null, pasta: verDocumentos ? r.links.pasta : null } : null,
  });
}
