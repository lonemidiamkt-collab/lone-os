// app/api/system/cs-conferir-postagem/route.ts — o resumo de postagem no grupo de Artes.
//
// Roda seg/qua/sex no fim da tarde: confere no Instagram DE VERDADE quem postou e resume no grupo.
// "todos postaram" numa linha, ou os que faltaram com nome e dono.
//
// POR QUE NO FIM DA TARDE e não de manhã: postagem acontece ao longo do dia. Conferir às 9h
// acusaria quase todo mundo e o time aprenderia a ignorar — que é o oposto do que isto serve.
//
// ?dryRun=1 → devolve o texto sem mandar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { conferirPostagem, textoResumo } from "@/lib/cs/postou-hoje";
import { csSendGroupText } from "@/lib/cs/notify";
import type { BlocoSaude } from "@/lib/reports/saudePdf";
import { spNow, ymd } from "@/lib/cs/vigilancia";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const social = url.searchParams.get("social") ?? undefined;
  // ?dia=YYYY-MM-DD — conferir um dia passado. Útil pra testar e pra refazer depois de uma falha.
  const dia = url.searchParams.get("dia") ?? undefined;

  const r = await conferirPostagem(social, dia);
  if ("erro" in r) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });

  const texto = textoResumo(r);
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, texto,
      postaram: r.postaram.length, faltaram: r.faltaram.length,
      semInstagram: r.semInstagram.length, comErro: r.comErro.length,
    });
  }

  const jid = process.env.CS_INTERNAL_GROUP_JID || "";
  if (!jid) return NextResponse.json({ ok: false, erro: "grupo de Artes não configurado" }, { status: 500 });

  // UMA RODADA POR DIA. Sem isto, um disparo manual junto do cron manda o mesmo resumo duas vezes
  // — foi o que aconteceu com o relatório de segunda.
  const { reservarRodada, fecharRodada } = await import("@/lib/system/trava-rodada");
  const diaTrava = dia || ymd(spNow());
  const reserva = await reservarRodada("cs-conferir-postagem", diaTrava);
  if (!reserva.conseguiu) {
    return NextResponse.json({ ok: true, status: "skip", motivo: reserva.motivo });
  }

  // Declara os FATOS: se o bom-dia já citou os mesmos clientes parados hoje, o porta-voz cala.
  const fatos = r.faltaram.map((f) => `sem-post:${f.cliente.toLowerCase().replace(/\s+/g, "-")}:${diaTrava}`);

  // ── UM PDF POR PESSOA, NÃO UM TEXTÃO ────────────────────────────────────
  //
  // Roberto (03/09): "continua mandando textões, já falei sobre a estrutura de pdfs". Esta era a
  // mensagem mais longa que sobrou — 23 clientes numa lista só, com os dois sociais misturados.
  // Mesma decisão do PDF de tarefas e do de saúde: cada um recebe o seu, e no grupo fica a
  // manchete com a menção.
  const { saudePessoaPdfHtml, legendaSaude } = await import("@/lib/reports/saudePdf");
  const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
  const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
  const { csSendGroupDocument } = await import("@/lib/cs/notify");
  const { mencionar } = await import("@/lib/cs/mencao");

  const porPessoa = new Map<string, typeof r.faltaram>();
  for (const f of r.faltaram) {
    const k = f.social?.trim() || "sem social definido";
    (porPessoa.get(k) ?? porPessoa.set(k, []).get(k)!).push(f);
  }

  const enviados: string[] = [];
  const falhas: string[] = [];
  let env = { ok: porPessoa.size === 0, error: undefined as string | undefined };

  if (porPessoa.size > 0) {
    const logo = await loadLoneLogo().catch(() => "");
    const dataArquivo = diaTrava.split("-").reverse().join("-");
    for (const [pessoa, itens] of porPessoa) {
      const primeiro = pessoa.split(/\s+/)[0];
      const bloco: BlocoSaude = {
        pessoa: primeiro,
        clientes: itens.map((i) => ({
          cliente: i.cliente,
          // `diasParado` já vem medido no Instagram; null quando nunca postou.
          diasSemPostar: i.ultimoPost ? i.diasParado : null,
          motivos: [],
        })),
      };
      const m = pessoa === "sem social definido"
        ? { trecho: "", jids: [] as string[] }
        : await mencionar(pessoa).catch(() => ({ trecho: "", jids: [] as string[] }));
      const arquivo = `Sem post ${primeiro.replace(/[^\p{L}\p{N} -]/gu, "").trim() || "equipe"} — ${dataArquivo}.pdf`;
      try {
        const pdf = await htmlToPdf(saudePessoaPdfHtml(bloco, logo, diaTrava));
        if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");
        const r2 = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), arquivo,
          legendaSaude(bloco, m.trecho), "application/pdf", m.jids);
        if (!r2.ok) throw new Error(r2.error ?? "envio falhou");
        enviados.push(primeiro);
        env = { ok: true, error: undefined };
      } catch (e) {
        // Conferência que some porque o render caiu é pior que conferência feia.
        falhas.push(`${primeiro}: ${String(e).slice(0, 60)}`);
        const r3 = await csSendGroupText(jid, legendaSaude(bloco, m.trecho), undefined,
          { origem: "cs-conferir-postagem", destino: "interno", fatos }, m.jids);
        env = { ok: r3.ok, error: r3.error };
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
  }

  // O que NÃO é cobrança de pessoa (cadastro trocado, conta ilegível) vai numa linha só, sem PDF:
  // é pendência da operação, não lista de trabalho de ninguém.
  const avisos: string[] = [];
  if (r.semInstagram.length) avisos.push(`👁️ ${r.semInstagram.length} sem Instagram vinculado: ${r.semInstagram.map((x) => x.cliente).join(", ")}`);
  const cadastroMorto = r.comErro.filter((x) => /não existe mais|atualize/i.test(x.erro ?? ""));
  if (cadastroMorto.length) {
    avisos.push(`📎 ${cadastroMorto.length} com o Instagram trocado no cadastro (o @ mudou): ${cadastroMorto.map((x) => x.cliente).join(", ")} — me manda o @ certo que eu atualizo.`);
  }
  if (avisos.length) {
    await csSendGroupText(jid, `📌 *Postagem de ${diaTrava.slice(8, 10)}/${diaTrava.slice(5, 7)}* — ${r.postaram.length} de ${r.postaram.length + r.faltaram.length} postaram.\n\n${avisos.join("\n")}`,
      undefined, { origem: "cs-conferir-postagem", destino: "interno" });
  }

  await fecharRodada("cs-conferir-postagem", diaTrava, env.ok,
    `${r.postaram.length} postaram, ${r.faltaram.length} não`);

  return NextResponse.json({
    ok: env.ok && falhas.length === 0, postaram: r.postaram.length, faltaram: r.faltaram.length,
    pdfs_enviados: enviados, falhas,
    semInstagram: r.semInstagram.length, comErro: r.comErro.length,
    cadastro_trocado: cadastroMorto.map((x) => x.cliente),
    ...(env.ok ? {} : { erro: env.error }),
  });
}
