export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { montarSnapshotCS } from "@/lib/cs/snapshot";
import { buildBomDiaDigest } from "@/lib/cs/bom-dia";
import { fatoEsfriando } from "@/lib/cs/porta-voz";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/system/cs-bom-dia — "bom dia" diário da Lone no grupo interno: raio-x rápido do dia
// (pendências esperando ok/não, produção, atrasados, quem esfriou) pro time começar sabendo o que
// fazer. Determinístico (sem IA). Só dia útil. Cron sugerido: `0 11 * * 1-5` UTC (= 8h BRT).
// ?preview=1 monta sem postar.
const BOM_DIA_LIVE = true;

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  if (!previewOnly && !(await isBusinessDay(now))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil", dia: ymd(now) });
  }

  const snap = await montarSnapshotCS();
    // O time real, pra "Carlos" e "Carlos Augusto" não virarem dois blocos (o snapshot encurta
  // o dono do card e mantém o completo na pendência).
  const { data: membros } = await supabaseAdmin.from("team_members").select("name");
  const time = (membros ?? []).map((m) => m.name as string).filter(Boolean);
  const msg = buildBomDiaDigest(snap, now, time);
  // Bom dia vai pro grupo da EQUIPE (onde a Lone é "do time"); cai no grupo de artes se não houver.
  const internalJid = process.env.CS_TEAM_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID || null;

  // ── MANCHETE CURTA + UM PDF POR PESSOA ──────────────────────────────────
  //
  // Roberto (03/09): "continua mandando textões, já falei sobre a estrutura de pdfs". O bom-dia
  // tinha 2.314 caracteres em 45 linhas, misturando o PANORAMA da operação com a lista de cada
  // pessoa. O panorama serve ao gestor e cabe em quatro linhas; a lista é trabalho, e trabalho de
  // outro é o que faz o time parar de ler.
  const { coletarItens, agruparPorDono } = await import("@/lib/cs/cobranca-nominal");
  const { manchetePanorama, bomDiaPessoaPdfHtml, legendaBomDia } = await import("@/lib/reports/bomDiaPdf");
  const blocos = agruparPorDono(coletarItens(snap), time);

  const dataBR = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const manchete = manchetePanorama({
    data: dataBR,
    esperandoOk: snap.pendentes.length,
    emProducao: snap.emProducao ?? 0,
    artesProntas: snap.prontasPraPostar?.length ?? 0,
    semPostPlanejado: snap.semPostsSemana.length,
    esfriando: snap.esfriando.length,
    encalhados: snap.encalhados ?? 0,
  });

  let postada = false;
  const pdfsEnviados: string[] = [];
  const falhas: string[] = [];

  if (BOM_DIA_LIVE && internalJid && !previewOnly) {
    // Declara os esfriando que a manchete JÁ cita — assim o cron das 9h30 não repete os mesmos.
    const r = await csSendGroupText(internalJid, manchete, undefined, {
      origem: "cs-bom-dia", destino: "interno",
      fatos: snap.esfriando.map((e) => fatoEsfriando(e.cliente)),
    });
    postada = r.ok;
    if (!r.ok) console.error("[cs-bom-dia] manchete falhou:", r.error);

    if (r.ok && blocos.length) {
      const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
      const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
      const { csSendGroupDocument } = await import("@/lib/cs/notify");
      const { mencionar } = await import("@/lib/cs/mencao");
      const logo = await loadLoneLogo().catch(() => "");
      const hojeIso = ymd(now);
      const dataArquivo = hojeIso.split("-").reverse().join("-");

      for (const b of blocos) {
        const bloco = {
          pessoa: b.dono === "sem dono" ? "Sem dono" : b.dono,
          itens: b.itens.map((i) => ({ cliente: i.cliente, acao: i.acao, dias: i.dias })),
          resto: b.resto,
        };
        const m = b.dono === "sem dono"
          ? { trecho: "", jids: [] as string[] }
          : await mencionar(b.dono).catch(() => ({ trecho: "", jids: [] as string[] }));
        const arquivo = `${bloco.pessoa.replace(/[^\p{L}\p{N} -]/gu, "").trim() || "Equipe"} — dia ${dataArquivo}.pdf`;
        try {
          const pdf = await htmlToPdf(bomDiaPessoaPdfHtml(bloco, logo, hojeIso));
          if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");
          const env = await csSendGroupDocument(internalJid, pdf.buffer.toString("base64"), arquivo,
            legendaBomDia(bloco, m.trecho), "application/pdf", m.jids);
          if (!env.ok) throw new Error(env.error ?? "envio falhou");
          pdfsEnviados.push(bloco.pessoa);
        } catch (e) {
          // Cobrança que some porque o render caiu é pior que cobrança feia: manda a legenda.
          falhas.push(`${bloco.pessoa}: ${String(e).slice(0, 60)}`);
          await csSendGroupText(internalJid, legendaBomDia(bloco, m.trecho), undefined,
            { origem: "cs-bom-dia", destino: "interno" }, m.jids).catch(() => {});
        }
        // Respiro entre documentos: a fila da Evolution engasga com envios colados.
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
  }

  console.log(`[cs-bom-dia] dia=${ymd(now)} pendentes=${snap.pendentes.length} atrasados=${snap.atrasados.length} esfriando=${snap.esfriando.length} postada=${postada} pdfs=${pdfsEnviados.length}`);
  return NextResponse.json({
    ok: falhas.length === 0, live: BOM_DIA_LIVE, postada,
    pdfs_enviados: pdfsEnviados, falhas,
    manchete, preview: msg,
  });
}
