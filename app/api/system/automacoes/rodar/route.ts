export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { automacaoPorId } from "@/lib/automacoes/registro";
import { gravarExecucao } from "@/lib/automacoes/painel";
import { okDaResposta } from "@/lib/automacoes/saude";
import { naoExecutou } from "@/lib/automacoes/execucao";
import { reservarExecucao, liberarExecucao } from "@/lib/automacoes/trava-execucao";

// Cloudflare corta a resposta em 100 s: depois disso a Central responde "ainda rodando" e o job
// termina sozinho no servidor (Node standalone), gravando o resultado no histórico ao acabar.
const ESPERA_MAX_MS = 80_000;

// POST /api/system/automacoes/rodar — {job, ensaio, confirmado?}
// Chama a própria rota do job com o CRON_SECRET, como o cron faria. Ensaio usa o modo de teste da
// rota (dry/dryRun/preview). Rodar DE VERDADE um job que fala com cliente exige confirmado:true.
//
// 25/10/2026 (auditoria de erro recuperável):
//   10.3 — sem trava, o 2º clique, outro gestor ou o cron disparavam de novo (e os jobs sem dedup próprio
//          mandavam o PDF de novo ao grupo). Agora a execução de verdade reserva o job (o cron respeita a mesma
//          reserva) e solta quando a rota termina — mesmo depois do 202. Já rodando = 409 "rodando desde…".
//   10.2 — rota que pulou (`executado: false`) volta como "não executou: motivo", não como "rodou".
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  let b: { job?: unknown; ensaio?: unknown; confirmado?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const a = typeof b.job === "string" ? automacaoPorId(b.job) : undefined;
  if (!a) return NextResponse.json({ error: "Job desconhecido." }, { status: 404 });
  if (!a.endpoint) {
    return NextResponse.json({ error: "Este job roda por um script do servidor e não pode ser disparado pela Central." }, { status: 400 });
  }
  const ensaio = b.ensaio === true;
  if (ensaio && !a.ensaio) return NextResponse.json({ error: "Este job não tem modo de ensaio." }, { status: 400 });
  if (!ensaio && a.enviaParaCliente && b.confirmado !== true) {
    return NextResponse.json({ error: "Este job manda mensagem para clientes. Confirme antes de rodar." }, { status: 409 });
  }
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ error: "CRON_SECRET não configurado no servidor." }, { status: 500 });

  // Ensaio não manda nada: não precisa (nem deve) disputar a vez com a execução de verdade.
  if (!ensaio) {
    const reserva = await reservarExecucao(a.id);
    if (!reserva.conseguiu) {
      return NextResponse.json({
        error: `${a.nome} já está rodando (${reserva.motivo ?? "outra execução em andamento"}). Espere terminar — o resultado entra no histórico.`,
      }, { status: 409 });
    }
  }

  const base = `http://localhost:${process.env.PORT || 3000}/api/system/${a.endpoint}`;
  const url = ensaio ? `${base}${a.endpoint.includes("?") ? "&" : "?"}${a.ensaio}` : base;
  const quem = gate.user.email || gate.user.id;
  const inicio = new Date();

  const execucao = (async () => {
    let status = 0, corpo = "";
    try {
      const r = await fetch(url, {
        method: a.metodo ?? "POST",
        headers: { Authorization: `Bearer ${segredo}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30 * 60_000),
      });
      status = r.status;
      corpo = await r.text().catch(() => "");
    } catch (e) {
      corpo = e instanceof Error ? e.message : String(e);
    }
    const duracao = Date.now() - inicio.getTime();
    const prefixo = ensaio ? `[ensaio por ${quem}]` : `[manual por ${quem}]`;
    const pulo = naoExecutou(corpo);
    const ok = okDaResposta(status, corpo);
    if (!ensaio) await liberarExecucao(a.id, ok, corpo.slice(0, 200)).catch(() => {});
    await gravarExecucao({
      job: a.id,
      started_at: inicio.toISOString(),
      duration_ms: duracao,
      http_status: status || null,
      ok: pulo ? null : ok,
      skipped: !!pulo,
      ensaio,
      resumo: `${prefixo} ${pulo ? `pulado: ${pulo.motivo} · ` : ""}${corpo.slice(0, 300)}`.slice(0, 300),
    }).catch((e) => console.error("[automacoes/rodar] não gravou a execução:", e instanceof Error ? e.message : e));
    console.log(`[automacoes/rodar] ${a.id} ensaio=${ensaio} status=${status} ${duracao}ms por ${quem}`);
    return { status, corpo, duracao, pulo };
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ESPERA_MAX_MS); });
  const r = await Promise.race([execucao, limite]);
  clearTimeout(timer);
  if (!r) {
    return NextResponse.json({
      ok: true, rodando: true, ensaio, rodandoDesde: inicio.toISOString(),
      mensagem: "Ainda rodando no servidor. O resultado aparece no histórico quando terminar.",
    }, { status: 202 });
  }
  return NextResponse.json({
    ok: okDaResposta(r.status, r.corpo),
    rodando: false,
    ensaio,
    ...(r.pulo ? { executado: false, motivo: r.pulo.motivo } : {}),
    status: r.status,
    duracao_ms: r.duracao,
    resposta: r.corpo.slice(0, 1500),
  });
}
