// app/api/system/cs-manha/route.ts — UMA mensagem de manhã no grupo interno, no lugar de quatro
// (cs-bom-dia, cs-postagem, cs-pendencias, cs-setup). As rotas antigas continuam de pé e chamáveis.
//
// Cada seção sai do MESMO builder da rota antiga, com o mesmo portão de dia:
//   bom-dia e pendências → dia útil · postagem → seg–sex · setup → sempre (o cron já é seg–sex)
// Seção vazia some; tudo vazio = não manda nada. Texto ou PDF segue o volume (enviar-aviso).
//
// Vai pro grupo de ARTES (CS_INTERNAL_GROUP_JID): é lá que o "ok <código>" das pendências funciona —
// no grupo EQUIPE o inbound não aceita comando de demanda.
//
//   ?dry=1 → devolve o texto exato (e a legenda, se for PDF) sem enviar e sem mexer no banco
//            (não expira pendência, não cria/fecha tarefa, não marca marco de contrato).
//
// Cron: `0 11 * * 1-5` (8h BRT).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { spNow, ymd, isBusinessDay, isWeekday } from "@/lib/cs/vigilancia";
import { coletarBomDia, coletarPostagem, coletarPendencias } from "@/lib/cs/manha-fontes";
import { executarCobrancaSetup } from "@/lib/cs/setup-cobranca";
import { montarManha, secaoBomDia, secaoPendencias, resumoManha, type SecaoManha } from "@/lib/cs/manha";
import { SEM_DONO, type BlocoDono } from "@/lib/cs/cobranca-nominal";
import type { PanoramaBomDia } from "@/lib/reports/bomDiaPdf";
import { avisoNominal, type Rotulo } from "@/lib/cs/aviso-nominal";

const TITULO = "Bom dia, time";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const now = spNow();
  const util = await isBusinessDay(now);
  const semana = isWeekday(now);

  const outras: SecaoManha[] = [];
  const puladas: Record<string, string> = {};
  const erros: string[] = [];
  const detalhe: Record<string, unknown> = {};

  // Uma fonte que cai não derruba a manhã inteira — antes cada rota caía sozinha.
  const tentar = async (nome: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { erros.push(`${nome}: ${String(e).slice(0, 160)}`); }
  };

  // ── BOM-DIA ──
  let panorama: PanoramaBomDia | null = null;
  let blocos: BlocoDono[] = [];
  let fatosBomDia: string[] = [];
  if (!util) puladas["bom-dia"] = "fora de dia útil";
  else await tentar("bom-dia", async () => {
    const b = await coletarBomDia(now);
    panorama = b.panorama; blocos = b.blocos; fatosBomDia = b.fatos;
    detalhe["bom-dia"] = { pendentes: b.snap.pendentes.length, atrasados: b.snap.atrasados.length, esfriando: b.snap.esfriando.length, donos: blocos.length };
  });

  // ── POSTAGEM ──
  if (!semana) puladas.postagem = "fim de semana";
  else await tentar("postagem", async () => {
    const p = await coletarPostagem(now);
    if ("erro" in p) { erros.push(`postagem: ${p.erro}`); return; }
    if (p.msg) outras.push({ chave: "postagem", texto: p.msg, fatos: p.fatos });
    detalhe.postagem = {
      firme: p.firme, video_day: p.videoDay,
      esperados: p.lista.filter((c) => c.esperado).length,
      sem_post: p.lista.filter((c) => c.esperado && !c.temPost).length,
    };
  });

  // ── PENDÊNCIAS ── (fora do dry expira as de +14 dias, como o cs-pendencias)
  if (!util) puladas.pendencias = "fora de dia útil";
  else await tentar("pendencias", async () => {
    const f = await coletarPendencias({ aplicar: !dry, simular: dry });
    if ("erro" in f) { erros.push(`pendencias: ${f.erro}`); return; }
    outras.push(secaoPendencias(f.arquivadas, f.msg));
    detalhe.pendencias = { pendentes: f.itens.length, expiradas: f.expiradas, erro_expirar: f.erroExpirar };
  });

  // ── SETUP ── (fora do dry cria/fecha tarefa e marca marco, como o cs-setup)
  await tentar("setup", async () => {
    const s = await executarCobrancaSetup({ aplicar: !dry, promover: false, marcarMarcos: !dry });
    if (s.texto) outras.push({ chave: "setup", texto: s.texto, fatos: s.fatos });
    detalhe.setup = { em_setup: s.emSetup, tarefas_criadas: s.criadas.length, fechadas_por_prova: s.autoFechadas.length, marcos: s.marcos };
  });

  const secoes = (rotulo?: Rotulo): SecaoManha[] => [
    ...(panorama ? [secaoBomDia({ panorama, blocos, fatos: fatosBomDia, rotulo })] : []),
    ...outras,
  ];
  const base = montarManha(secoes());
  if (!base) {
    console.log(`[cs-manha] dia=${ymd(now)} nada a dizer dry=${dry} erros=${erros.length}`);
    return NextResponse.json({ ok: erros.length === 0, dry, enviado: false, skip: "nada a dizer hoje", puladas, erros, detalhe });
  }

  const jid = process.env.CS_INTERNAL_GROUP_JID || process.env.CS_TEAM_GROUP_JID || null;
  const r = await avisoNominal({
    jid, dry,
    donos: blocos.filter((b) => b.dono !== SEM_DONO).map((b) => b.dono),
    titulo: TITULO,
    montar: (rotulo) => montarManha(secoes(rotulo))?.texto ?? base.texto,
    resumo: (rotulo) => resumoManha({ panorama, secoes: base.secoes, blocos, rotulo }),
    meta: { origem: "cs-manha", destino: "interno", fatos: base.fatos },
  });

  console.log(`[cs-manha] dia=${ymd(now)} secoes=${base.secoes.join(",")} formato=${r.formato} enviado=${r.enviado} dry=${dry} erros=${erros.length}`);
  return NextResponse.json({
    ok: erros.length === 0 && (dry || !jid || r.enviado), dry,
    enviado: r.enviado, formato: r.formato,
    secoes: base.secoes, puladas, erros, detalhe,
    mencionados: r.mencionados.length,
    ...(r.erro ? { aviso: r.erro } : {}),
    ...(jid ? {} : { sem_grupo: "CS_INTERNAL_GROUP_JID não configurado" }),
    legenda: r.legenda,
    texto: r.texto,
  });
}
