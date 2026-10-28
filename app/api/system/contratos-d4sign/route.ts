// app/api/system/contratos-d4sign/route.ts — a consulta periódica dos contratos na D4Sign.
//
// O caminho principal é o webhook (/api/integracoes/d4sign). Esta consulta pega o que ele não trouxe
// (Lone OS fora do ar, webhook recusado, D4Sign que desistiu de repetir) e conhece os documentos que esperam
// assinatura — é daí que sai o "Ainda não assinaram" da manhã (contratos-d4sign-pendentes). A conta da D4Sign
// responde a 10 chamadas por HORA: cada rodada lista os pendentes da CONTA (1 chamada, não uma por cofre),
// filtra pelos cofres escolhidos no painel e relê no máximo mais 3 — o novo, o que mudou de fase e, em rodízio,
// os pendentes conhecidos (é assim que o "✍️ assinado por X · falta Y" sai mesmo sem o webhook).
//
//   ?dry=1 ............... o que aconteceria: lê a D4Sign e o banco, devolve as mensagens, não grava nem manda
//   ?documento=<uuid> .... relê e processa SÓ este documento (o aviso que faltou sai no grupo de cadastro)
//   ?religar=1 ........... liga de novo ao cadastro certo o documento sem dono ou com dono inválido (teste, a própria
//                          Lone), com o que já está gravado — nenhuma chamada à D4Sign (com ?dry=1 só mostra)
//   ?webhook=ver ......... a URL de webhook cadastrada hoje em cada cofre escolhido (só leitura; 1 chamada por cofre)
//   ?webhook=cadastrar ... cadastra o webhook 2.0 nos cofres escolhidos que ainda não têm (com ?dry=1 só mostra)
//
// Integração desligada (sem token ou sem cofre, no painel ou no servidor) devolve ok com `desligado`.
// Cron: `15 11-23 * * *` (de hora em hora, das 8h15 às 20h15 BRT).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { verWebhookDoCofre } from "@/lib/contracts/d4sign";
import { carregarConfigD4Sign, ligarWebhookD4Sign } from "@/lib/contracts/d4sign-config";
import { consultarCofre, processarDocumento, uuidValido } from "@/lib/contracts/assinatura";
import { religarDocumentos } from "@/lib/contracts/religar-d4sign";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const webhook = req.nextUrl.searchParams.get("webhook");
  const documento = req.nextUrl.searchParams.get("documento");

  if (req.nextUrl.searchParams.get("religar") !== null) {
    const r = await religarDocumentos({ dry });
    console.log(`[contratos-d4sign] religar trocas=${r.trocas.length} datas=${r.datasRefeitas} dry=${dry} erros=${r.erros.length}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }

  if (documento) {
    if (!uuidValido(documento)) return NextResponse.json({ ok: false, erro: "documento= precisa ser o UUID do documento na D4Sign" }, { status: 400 });
    const r = await processarDocumento(documento, { origem: "consulta", dry });
    console.log(`[contratos-d4sign] documento=${documento} acao=${r.acao} dry=${dry}${r.motivo ? ` motivo=${r.motivo}` : ""}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }

  if (webhook) {
    const cfg = await carregarConfigD4Sign();
    if (!cfg?.cofres.length) return NextResponse.json({ ok: false, erro: "Faltam o token e os cofres da D4Sign (Configurações › Jurídico)" }, { status: 400 });
    if (webhook === "ver") {
      const cofres: { cofre: string; webhook?: unknown; erro?: string }[] = [];
      for (const cofre of cfg.cofres) {
        const r = await verWebhookDoCofre(cfg, cofre);
        cofres.push(r.ok ? { cofre, webhook: r.dados } : { cofre, erro: r.erro });
        if (!r.ok && r.limite) break;
      }
      return NextResponse.json({ ok: cofres.every((c) => !c.erro), cofres });
    }
    if (webhook === "cadastrar") {
      const r = await ligarWebhookD4Sign("servidor (cron-call)", { dry });
      if (!r.ok) console.error("[contratos-d4sign] cadastro do webhook:", r.resultado);
      return NextResponse.json({ dry, ...r }, { status: r.ok ? 200 : 502 });
    }
    return NextResponse.json({ ok: false, erro: "webhook= aceita ver ou cadastrar" }, { status: 400 });
  }

  const r = await consultarCofre({ dry });
  const avisados = r.resultados.filter((x) => ["avisado", "avisaria", "parcial", "parcial_avisaria"].includes(x.acao));
  console.log(`[contratos-d4sign] pendentes=${r.pendentes} lidos=${r.lidos} sobraram=${r.sobraram} avisos=${avisados.length} dry=${dry} erros=${r.erros.length}${r.desligado ? ` desligado=${r.desligado}` : ""}${r.adiado ? " adiado=cota" : ""}`);
  return NextResponse.json({
    ...r,
    mensagens: avisados.map((x) => x.mensagem),
    resultados: r.resultados.map((x) => ({
      uuid: x.uuid, acao: x.acao, status: x.status, nome: x.nome, vinculo: x.vinculo, assinadoEm: x.assinadoEm,
      resumo: x.resumo, motivo: x.motivo, ...(x.avisos ? { avisos: x.avisos } : {}),
    })),
  });
}
