// POST /api/system/google-sync — rotina diária (7h BRT, antes dos relatórios das 8h): lê o Google Ads e o Perfil da
// Empresa de cada cliente vinculado e grava dia a dia (lib/google/sincronizar.ts). Relatório semanal, mensal e a aba
// Google do portal leem o que esta rotina gravou.
//
//   ?dry=1          → só lista quem seria lido (não chama o Google)
//   ?clientId=<id>  → um cliente só
//   ?refazer=1      → relê a janela longa (120 dias de Ads, 400 de Perfil) — para depois de corrigir um acesso
//
// Antes da leitura, o VÍNCULO AUTOMÁTICO (detectarVinculos): conta de anúncio ou perfil que a Lone passou a gerenciar
// entra sozinho no cliente certo quando o nome (ou o telefone do perfil) bate e a escolha é única; o resto vira
// sugestão na ficha.
//
// Falha de um cliente não para os outros. Resposta com ok:false quando algum falhou (a Central de Automações vê) e a
// lista do que falhou, em frase. Sem conexão do Google: ok:false com o motivo, sem tentar cliente por cliente.
//
// crontab (VPS): 0 10 * * * /opt/loneos/scripts/cron-call.sh google-sync POST >> /var/log/loneos-google-sync.log 2>&1

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { clientesComGoogle, sincronizarCliente, detectarVinculos, type ResultadoDeteccao } from "@/lib/google/sincronizar";
import { tokenMarketing, fraseSemToken } from "@/lib/google/marketing-auth";
import { temColunasGoogle } from "@/lib/google/colunas";

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const onlyClientId = url.searchParams.get("clientId");
  const refazerTudo = url.searchParams.get("refazer") === "1";

  if (!(await temColunasGoogle())) {
    return NextResponse.json({ ok: false, error: "Falta aplicar a migração 20261118120000_google_relatorios.sql no banco." });
  }
  // 1) Vínculo automático: conta/perfil que a Lone passou a gerenciar desde ontem entra sozinho no cliente certo
  //    (lib/google/detectar.ts). Antes da leitura, para o recém-vinculado já ser lido hoje.
  let deteccao: ResultadoDeteccao | null = null;
  if (!dry && !onlyClientId) deteccao = await detectarVinculos();

  const { clientes, erro } = await clientesComGoogle(onlyClientId);
  if (erro) return NextResponse.json({ ok: false, error: `Não li os clientes: ${erro}` }, { status: 500 });
  if (!clientes.length) return NextResponse.json({ ok: !deteccao?.erros.length, status: "skipped", message: "Nenhum cliente com Google vinculado.", deteccao });
  if (dry) {
    return NextResponse.json({
      ok: true, status: "dry_run", total: clientes.length,
      clientes: clientes.map((c) => ({ nome: c.name, ads: !!c.google_ads_customer_id, perfil: !!c.google_perfil_local })),
    });
  }

  const t = await tokenMarketing();
  if (!t.token) return NextResponse.json({ ok: false, error: fraseSemToken(t.motivo, t.detalhe), total: clientes.length });

  const falhas: string[] = [];
  const parciais: string[] = [];
  let ok = 0;
  // Dois por vez: cada cliente faz 4 leituras de Ads e 3–8 de Perfil; o Google limita rajada.
  for (let i = 0; i < clientes.length; i += 2) {
    const lote = await Promise.all(clientes.slice(i, i + 2).map((c) => sincronizarCliente(c, { refazerTudo }).then((r) => ({ c, r }))));
    for (const { c, r } of lote) {
      const erros = [r.ads && !r.ads.ok ? `Google Ads: ${r.ads.erro}` : null, r.perfil && !r.perfil.ok ? `Perfil: ${r.perfil.erro}` : null].filter(Boolean);
      if (erros.length) falhas.push(`${c.name ?? c.id}: ${erros.join(" · ")}`);
      else ok++;
      if (r.ads?.avisos?.length) parciais.push(`${c.name ?? c.id}: ${r.ads.avisos.join("; ")}`);
    }
  }
  return NextResponse.json({
    ok: falhas.length === 0 && !deteccao?.erros.length, status: falhas.length ? (ok ? "partial" : "failed") : "ok",
    total: clientes.length, lidos: ok, falhas: falhas.slice(0, 30), parciais: parciais.slice(0, 30), deteccao,
  });
}
