// O diagnóstico diário das contas de anúncio — as funções operacionais que têm dado hoje.
//
// PRA QUE (Roberto, 02/09): "seria interessante esses avisos das 8 funções serem todos os dias em
// PDF, de manhã ou de tarde".
//
// DAS 8 FUNÇÕES PROPOSTAS, 6 TÊM DADO e estão aqui. As outras duas — Executor e Auditor pós-ação —
// dependem de escrever na Meta, e escrita exige a camada de política e segurança que o próprio
// documento descreve (limites por cliente, dry-run, idempotência, kill switch). Fazer execução antes
// disso seria o cenário que ele mesmo aponta como perigoso: automação correta sobre dado incorreto.
//
// Cada função responde uma pergunta que o gestor faria abrindo o Ads Manager conta a conta.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface ItemDiagnostico {
  cliente: string;
  clientId: string;
  /** O que foi encontrado, em uma frase que já diz o tamanho do problema. */
  achado: string;
  /** O que fazer. Vazio quando o dado não sustenta uma recomendação. */
  acao: string;
  /** 0–100. Ordena a lista: o gestor começa pelo topo e para quando quiser. */
  prioridade: number;
  /** Quanto de verba está em jogo por dia — o que torna o item comparável entre contas. */
  emJogoDia?: number;
}

export interface Diagnostico {
  data: string;
  contasAtivas: number;
  gastoOntem: number;
  /** Quantas contas têm meta definida. Sem meta, o diagnóstico só compara o cliente com ele mesmo. */
  comPolitica: number;
  funcoes: { nome: string; pergunta: string; itens: ItemDiagnostico[]; semDado?: string }[];
}

const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Ontem em BRT. O dia de hoje ainda está acontecendo e sempre parece pior do que é. */
function ontemBRT(agora = new Date()): string {
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  sp.setDate(sp.getDate() - 1);
  return sp.toISOString().slice(0, 10);
}

export async function montarDiagnostico(agora = new Date()): Promise<Diagnostico> {
  const ontem = ontemBRT(agora);
  const seteDias = new Date(new Date(`${ontem}T12:00:00Z`).getTime() - 7 * 864e5).toISOString().slice(0, 10);

  const [{ data: clientes }, { data: entidades }, { data: anomalias }, { data: contaDia }, { data: politicas }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, meta_ad_account_id, active, draft_status")
      .not("meta_ad_account_id", "is", null).neq("meta_ad_account_id", "")
      .or("active.is.null,active.eq.true").is("draft_status", null),
    supabaseAdmin.from("meta_entity_snapshots")
      .select("client_id, nivel, entity_name, campaign_name, adset_name, metric_date, spend, impressions, clicks, ctr, frequency, conversions, cost_per_conversion")
      .gte("metric_date", seteDias).lte("metric_date", ontem),
    supabaseAdmin.from("anomaly_alerts")
      .select("client_id, metric, severity, percent_change, current_value, baseline_value, metric_date")
      .gte("metric_date", seteDias).in("severity", ["critical", "high"]),
    supabaseAdmin.from("metric_snapshots").select("client_id, spend, conversions, metric_date")
      .gte("metric_date", seteDias).lte("metric_date", ontem),
    // A política é o que transforma "fora do padrão dele" em "acima da meta dele". Sem ela o
    // diagnóstico só sabe comparar o cliente consigo mesmo, e nunca se o resultado é BOM.
    supabaseAdmin.from("client_traffic_policy")
      .select("client_id, cpl_meta, cpl_alerta, cpl_critico, orcamento_diario, conversas_minimas, gasto_minimo_decisao, origem"),
  ]);

  const nome = new Map((clientes ?? []).map((c) => [c.id as string, (c.nome_fantasia as string) || (c.name as string)]));
  const ativos = new Set((clientes ?? []).map((c) => c.id as string));
  const politica = new Map((politicas ?? []).map((p) => [p.client_id as string, p]));

  const gastoOntem = (contaDia ?? [])
    .filter((m) => m.metric_date === ontem)
    .reduce((s, m) => s + (Number(m.spend) || 0), 0);

  // ── 1. AUDITOR DE CONTAS ────────────────────────────────────────────────────
  // Conta de cliente ativo que simplesmente não entregou nada ontem. É o problema mais grave e o
  // mais fácil de passar despercebido, porque não gera alerta: não há número anormal, há ausência.
  const gastouOntem = new Set((contaDia ?? []).filter((m) => m.metric_date === ontem && Number(m.spend) > 0).map((m) => m.client_id as string));
  const semEntrega: ItemDiagnostico[] = [...ativos]
    .filter((id) => !gastouOntem.has(id))
    .map((id) => {
      // Quanto ela costumava gastar diz se é conta parada de propósito ou problema novo.
      const historico = (contaDia ?? []).filter((m) => m.client_id === id && Number(m.spend) > 0);
      const media = historico.length ? historico.reduce((s, m) => s + Number(m.spend), 0) / historico.length : 0;
      return {
        cliente: nome.get(id) ?? "?", clientId: id,
        achado: media > 0
          ? `Nenhum gasto ontem. Vinha gastando ${dinheiro(media)}/dia nos últimos 7 dias.`
          : "Nenhum gasto ontem, e nenhum nos últimos 7 dias.",
        acao: media > 0
          ? "Conferir se a campanha foi pausada, se o saldo acabou ou se a conta tem restrição."
          : "Confirmar se este cliente deveria estar rodando anúncio.",
        prioridade: media > 0 ? Math.min(98, 70 + Math.round(media / 10)) : 45,
        emJogoDia: media,
      };
    })
    .sort((a, b) => b.prioridade - a.prioridade);

  // ── 2. DETECTOR DE ANOMALIAS ────────────────────────────────────────────────
  const porCliente = new Map<string, typeof anomalias>();
  for (const a of anomalias ?? []) {
    if (!ativos.has(a.client_id as string)) continue;
    porCliente.set(a.client_id as string, [...(porCliente.get(a.client_id as string) ?? []), a] as typeof anomalias);
  }
  const ROTULO: Record<string, (p: number) => string> = {
    spend: () => "o gasto despencou",
    impressions: (p) => `a entrega caiu ${Math.abs(Math.round(p))}%`,
    cpl: (p) => `o custo por conversa subiu ${Math.round(p)}%`,
    ctr: (p) => `os cliques caíram ${Math.abs(Math.round(p))}%`,
  };
  const anomaliasItens: ItemDiagnostico[] = [...(porCliente.entries() ?? [])].map(([id, lista]) => {
    const sintomas = [...new Set((lista ?? []).map((a) => ROTULO[a.metric as string]?.(Number(a.percent_change) || 0)).filter(Boolean))];
    return {
      cliente: nome.get(id) ?? "?", clientId: id,
      achado: sintomas.join(" · "),
      acao: sintomas.length > 1
        ? "Vários sinais ao mesmo tempo costumam ser um só problema — conferir se a campanha mudou ou o criativo cansou."
        : "Abrir a conta e comparar com a semana anterior.",
      prioridade: 60 + Math.min(30, (lista?.length ?? 0) * 6),
    };
  }).sort((a, b) => b.prioridade - a.prioridade);

  // ── 3. CAÇADOR DE DESPERDÍCIO ───────────────────────────────────────────────
  // Anúncio que gastou e não trouxe uma conversa. É dinheiro saindo sem contrapartida — o item de
  // maior retorno por minuto de atenção do gestor.
  const porAnuncio = new Map<string, { cliente: string; clientId: string; nome: string; campanha: string; gasto: number; conv: number; impr: number }>();
  for (const e of entidades ?? []) {
    if (e.nivel !== "ad") continue;
    const k = `${e.client_id}|${e.entity_name}`;
    const at = porAnuncio.get(k) ?? {
      cliente: nome.get(e.client_id as string) ?? "?", clientId: e.client_id as string,
      nome: (e.entity_name as string) ?? "(sem nome)", campanha: (e.campaign_name as string) ?? "",
      gasto: 0, conv: 0, impr: 0,
    };
    at.gasto += Number(e.spend) || 0;
    at.conv += Number(e.conversions) || 0;
    at.impr += Number(e.impressions) || 0;
    porAnuncio.set(k, at);
  }
  const desperdicio: ItemDiagnostico[] = [...porAnuncio.values()]
    // Piso de R$40 em 7 dias: abaixo disso não houve gasto suficiente pra concluir nada, e apontar
    // um anúncio de R$8 como desperdício só gasta a atenção de quem lê.
    .filter((a) => a.conv === 0 && a.gasto >= 40)
    .map((a) => ({
      cliente: a.cliente, clientId: a.clientId,
      achado: `"${a.nome}" gastou ${dinheiro(a.gasto)} em 7 dias, ${a.impr.toLocaleString("pt-BR")} pessoas viram, e nenhuma conversa.`,
      acao: "Pausar este anúncio e realocar a verba para os que estão convertendo na mesma campanha.",
      prioridade: Math.min(95, 60 + Math.round(a.gasto / 5)),
      emJogoDia: a.gasto / 7,
    }))
    .sort((a, b) => (b.emJogoDia ?? 0) - (a.emJogoDia ?? 0));

  // ── 4. DETECTOR DE FADIGA ───────────────────────────────────────────────────
  // Frequência é quantas vezes a MESMA pessoa viu. Acima de 3 o público começou a saturar; o
  // criativo não está errado, está gasto.
  const porFreq = new Map<string, { cliente: string; clientId: string; nome: string; freq: number; gasto: number; ctrRecente: number; ctrAntes: number }>();
  for (const e of entidades ?? []) {
    if (e.nivel !== "ad" || !e.frequency) continue;
    const k = `${e.client_id}|${e.entity_name}`;
    const at = porFreq.get(k) ?? {
      cliente: nome.get(e.client_id as string) ?? "?", clientId: e.client_id as string,
      nome: (e.entity_name as string) ?? "?", freq: 0, gasto: 0, ctrRecente: 0, ctrAntes: 0,
    };
    at.freq = Math.max(at.freq, Number(e.frequency) || 0);
    at.gasto += Number(e.spend) || 0;
    porFreq.set(k, at);
  }
  const fadiga: ItemDiagnostico[] = [...porFreq.values()]
    .filter((a) => a.freq >= 3 && a.gasto >= 30)
    .map((a) => ({
      cliente: a.cliente, clientId: a.clientId,
      achado: `"${a.nome}" está sendo mostrado ${a.freq.toFixed(1)}x para a mesma pessoa.`,
      acao: a.freq >= 6
        ? "Trocar o criativo: nesse nível de repetição o público já viu demais e o custo tende a subir."
        : "Pedir variação nova para o designer antes que o custo suba.",
      prioridade: Math.min(88, 50 + Math.round(a.freq * 6)),
      emJogoDia: a.gasto / 7,
    }))
    .sort((a, b) => b.prioridade - a.prioridade);

  // ── 5. CONTROLADOR DE VERBA (dentro da campanha) ────────────────────────────
  // Conjunto caro convivendo com conjunto barato na MESMA campanha: é a realocação mais óbvia e a
  // que mais aparece no dia a dia — foi o exemplo que o Roberto deu.
  const porConjunto = new Map<string, { cliente: string; clientId: string; campanha: string; nome: string; gasto: number; conv: number }>();
  for (const e of entidades ?? []) {
    if (e.nivel !== "adset") continue;
    const k = `${e.client_id}|${e.campaign_name}|${e.entity_name}`;
    const at = porConjunto.get(k) ?? {
      cliente: nome.get(e.client_id as string) ?? "?", clientId: e.client_id as string,
      campanha: (e.campaign_name as string) ?? "", nome: (e.entity_name as string) ?? "?", gasto: 0, conv: 0,
    };
    at.gasto += Number(e.spend) || 0;
    at.conv += Number(e.conversions) || 0;
    porConjunto.set(k, at);
  }
  const porCampanha = new Map<string, typeof porConjunto extends Map<string, infer V> ? V[] : never>();
  for (const cj of porConjunto.values()) {
    const k = `${cj.clientId}|${cj.campanha}`;
    porCampanha.set(k, [...(porCampanha.get(k) ?? []), cj]);
  }
  const realocar: ItemDiagnostico[] = [];
  for (const conjuntos of porCampanha.values()) {
    const comConversa = conjuntos.filter((c) => c.conv > 0 && c.gasto >= 30);
    if (comConversa.length < 2) continue;
    const custo = comConversa.map((c) => ({ ...c, cpc: c.gasto / c.conv })).sort((a, b) => a.cpc - b.cpc);
    const melhor = custo[0], pior = custo[custo.length - 1];
    // Só vale falar quando a diferença é grande o bastante pra não ser ruído de amostra.
    if (pior.cpc < melhor.cpc * 2.5) continue;
    realocar.push({
      cliente: pior.cliente, clientId: pior.clientId,
      achado: `Na campanha "${pior.campanha}", o conjunto "${pior.nome}" custa ${dinheiro(pior.cpc)} por conversa e "${melhor.nome}" custa ${dinheiro(melhor.cpc)}.`,
      acao: `Mover verba do "${pior.nome}" para o "${melhor.nome}" — a mesma campanha entrega ${(pior.cpc / melhor.cpc).toFixed(1)}x mais barato do outro lado.`,
      prioridade: Math.min(92, 55 + Math.round((pior.cpc / melhor.cpc) * 5)),
      emJogoDia: pior.gasto / 7,
    });
  }
  realocar.sort((a, b) => b.prioridade - a.prioridade);

  // ── 6. ACIMA DA META DO CLIENTE ─────────────────────────────────────────────
  //
  // A única função que precisa da política para existir. As outras comparam o cliente com ele
  // mesmo; esta compara com o que se espera dele. Na carteira o custo por conversa vai de R$1,91 a
  // R$26,18 — R$18 é péssimo para uns e ótimo para outros, e sem a meta o sistema não sabe a
  // diferença.
  const acimaDaMeta: ItemDiagnostico[] = [];
  for (const cj of porConjunto.values()) {
    const pol = politica.get(cj.clientId);
    if (!pol?.cpl_critico || cj.conv === 0) continue;

    const cpl = cj.gasto / cj.conv;
    const critico = Number(pol.cpl_critico);
    const meta = Number(pol.cpl_meta);
    if (cpl < critico) continue;
    if (cj.gasto < Number(pol.gasto_minimo_decisao ?? 50)) continue;

    // A evidência mínima escala com o TAMANHO do desvio.
    //
    // A primeira versão exigia sempre o volume cheio da política, e o resultado foi zero achados
    // com problemas óbvios na base: Léo Carros gastou R$159 para UMA conversa numa conta cuja meta
    // é R$12,40 — 12x o teto — e ficou de fora porque não tinha 8 conversas. Esses casos escapavam
    // por um vão: não é zero conversa (não entra em desperdício) e não tem amostra (não entra
    // aqui).
    //
    // Efeito grande precisa de amostra menor: quando o custo passa de 4x o teto, o gasto absoluto
    // já justifica olhar sem esperar volume estatístico. Abaixo disso, o volume cheio continua
    // valendo — é o que impede apontar um conjunto que teve um dia ruim.
    const exagero = cpl / critico;
    const volumeExigido = exagero >= 4 ? 1 : Number(pol.conversas_minimas ?? 5);
    if (cj.conv < volumeExigido) continue;

    acimaDaMeta.push({
      cliente: cj.cliente, clientId: cj.clientId,
      achado: `"${cj.nome}" está a ${dinheiro(cpl)} por conversa — ${(cpl / meta).toFixed(1)}x a meta de ${dinheiro(meta)}. Gastou ${dinheiro(cj.gasto)} para ${cj.conv} conversa${cj.conv > 1 ? "s" : ""}.`,
      acao: cj.conv <= 2
        ? "O gasto já é alto demais para tão pouco retorno — vale pausar e realocar antes de esperar mais dados."
        : `Volume suficiente para decidir. Vale pausar ou reduzir a verba deste conjunto.`,
      prioridade: Math.min(96, 65 + Math.round((cpl / meta) * 8)),
      emJogoDia: cj.gasto / 7,
    });
  }
  acimaDaMeta.sort((a, b) => b.prioridade - a.prioridade);

  // ── 7. ASSISTENTE DE OTIMIZAÇÃO: o que está indo bem e merece mais ──────────
  const escalar: ItemDiagnostico[] = [...porConjunto.values()]
    .filter((c) => c.conv >= 5 && c.gasto >= 50)
    .map((c) => ({ ...c, cpc: c.gasto / c.conv }))
    .sort((a, b) => a.cpc - b.cpc)
    .slice(0, 5)
    .map((c) => ({
      cliente: c.cliente, clientId: c.clientId,
      achado: `"${c.nome}" trouxe ${c.conv} conversas a ${dinheiro(c.cpc)} cada — o melhor da conta.`,
      acao: "Se houver verba disponível, este é o lugar de colocar.",
      prioridade: 40,
      emJogoDia: c.gasto / 7,
    }));

  return {
    data: ontem,
    contasAtivas: ativos.size,
    gastoOntem,
    comPolitica: [...ativos].filter((id) => politica.has(id)).length,
    funcoes: [
      { nome: "Contas sem entrega", pergunta: "Alguma conta parou de rodar?", itens: semEntrega },
      { nome: "Desperdício", pergunta: "Que anúncio está gastando sem trazer nada?", itens: desperdicio },
      { nome: "Anomalias", pergunta: "O que fugiu do padrão da própria conta?", itens: anomaliasItens },
      { nome: "Verba mal distribuída", pergunta: "Dá pra mover verba dentro da mesma campanha?", itens: realocar },
      { nome: "Acima da meta do cliente", pergunta: "O que passou do teto que combinamos?", itens: acimaDaMeta },
      { nome: "Criativo cansado", pergunta: "Quem já viu demais o mesmo anúncio?", itens: fadiga },
      { nome: "Merece mais verba", pergunta: "O que está barato e pode escalar?", itens: escalar },
    ],
  };
}
