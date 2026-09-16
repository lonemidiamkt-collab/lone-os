// lib/prospeccao/conversa.ts — a Rafaela conversando. Uma mensagem entra, uma decisão sai.
//
// Ordem fixa: gravar → freios (terminal, dono, pausa, piloto, janela) → intenção → tabela de
// decisão (intenção × estágio × passo) → objetivo → redação (template dá os limites, IA escreve)
// → envio → transição → próxima ação. O que a tabela não sabe resolver vira `precisa_humano`,
// com aviso ao Roberto — nunca um chute.
//
// Ritmo em etapas (Roberto, 16/09): chegou ao decisor → mensagem SEM pedir reunião → interesse →
// "vocês ficam em {cidade}, certo?" → convite (visita ou Meet, pedindo permissão para olhar a
// agenda) → 2 horários → nenhum serve? "manhã ou tarde?" → confirmação; visita confirma o
// endereço antes de fechar; lembrete de véspera espera o "sim".

import type { IntentLida, ProspectRow, Estagio } from "./tipos";
import { carregarConfig, type ProspectConfig } from "./config";
import { campanhaAtual } from "./piloto";
import { podeResponderAgora, proximaHoraDeResposta } from "./limites";
import { lerIntencao, ehAfirmativo, lerPeriodo, pareceEndereco } from "./intencao";
import { transicionar, registrarEvento, resolverQuando, definirProximaAcao, TERMINAIS, POS_REUNIAO, podeIr, proximaAcaoPadrao, etapaPipeline } from "./maquina";
import { atualizarProspect, gravarMensagem, mensagensDoProspect } from "./db";
import { enviarAoProspect, enviarTexto, verificarWhatsapp } from "./envio";
import * as msg from "./mensagens";
import { horariosDisponiveis, horarioLivre, marcarReuniao } from "./agenda";
import { fazerHandoff } from "./handoff";
import { isoSP, porExtensoSP, componentesSP, dataSP } from "./tempo";
import { nomeProprio, primeiroNome, telefoneDigitos } from "./normalizar";
import { appUrl } from "./google";

export interface OpcoesConversa {
  /** Não envia nada nem grava mensagem de entrada (simulador). Devolve o que ENVIARIA. */
  dry?: boolean;
  messageId?: string | null;
  correlationId?: string | null;
  agora?: Date;
  cfg?: ProspectConfig;
  /** No simulador o histórico vem de fora. */
  historico?: { autor: string; texto: string }[];
  /** A mensagem de entrada já está gravada (resposta pendente sendo retomada pelo tick). */
  jaGravada?: boolean;
  /** Simulador/prévia: não gasta IA, usa o texto fixo. */
  forcarModo?: "fixo" | "diretriz";
}

export interface ResultadoConversa {
  respondeu: boolean;
  resposta?: string | null;
  intent?: IntentLida;
  estagio_antes: Estagio;
  estagio_depois: Estagio;
  motivo?: string;
  precisa_humano?: boolean;
  prospect: ProspectRow;
}

/** Sub-passos guardados em contexto_comercial (o estágio é grosso demais para o ritmo da conversa). */
export interface Passos {
  passo?: "confirmar_cidade" | "convite" | "oferecido" | "periodo" | "confirmar_endereco" | "lembrete";
  tipo_reuniao?: "visita" | "online";
  horarios_oferecidos?: string[];
  horarios_recusados?: string[];
  proposto_iso?: string | null;
  proposto_em?: string;
  oferecido_em?: string;
  lembrete_em?: string;
  resumo?: string;
  objecao?: string;
  motivo_retorno?: string;
  proxima_abordagem?: string;
  retornar_em?: string;
}

const DELAY_DIGITANDO = () => 3000 + Math.round(Math.random() * 5000);

/** Avisa o Roberto UMA vez por motivo e marca o prospect. */
export async function marcarPrecisaHumano(p: ProspectRow, motivo: string, dry = false): Promise<ProspectRow> {
  if (p.precisa_humano && p.motivo_humano === motivo) return p;
  if (dry) return { ...p, precisa_humano: true, motivo_humano: motivo };
  const atual = await atualizarProspect(p.id, { precisa_humano: true, motivo_humano: motivo });
  await registrarEvento(p.id, { tipo: "precisa_humano", motivo, responsavel: "SDR_AI" });
  const adm = process.env.CS_ADM_GROUP_JID;
  if (adm) {
    try {
      const { csSendGroupText } = await import("@/lib/cs/notify");
      await csSendGroupText(adm, `SDR — ${p.nome} precisa de você: ${motivo}\n${appUrl()}/prospeccao?prospect=${p.id}`, undefined, { origem: "prospeccao", destino: "interno" });
    } catch { /* aviso é secundário */ }
  }
  return atual;
}

/** Casa "quarta", "o primeiro", "às 15h", "amanhã" com uma das opções oferecidas. */
export function casarOpcao(texto: string, opcoes: string[]): string | null {
  if (!opcoes.length) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\b(primeir[oa]|a primeira|o primeiro|1[ªº°]?)\b/.test(t)) return opcoes[0];
  if (/\b(segund[oa]|2[ªº°]?)\b/.test(t) && opcoes[1]) return opcoes[1];
  if (/\b(terceir[oa]|3[ªº°]?)\b/.test(t) && opcoes[2]) return opcoes[2];
  const semanas = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const hora = /(\d{1,2})\s*(h|:00|hrs|horas)/.exec(t);
  const candidatos = opcoes.filter((iso) => {
    const c = componentesSP(new Date(iso));
    const diaOk = t.includes(semanas[c.diaSemana]) || (/\bamanha\b/.test(t) && c.ymd === componentesSP(new Date(Date.now() + 86_400_000)).ymd);
    const horaOk = hora ? Number(hora[1]) === c.hora : true;
    return diaOk && horaOk;
  });
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length > 1 && hora) return candidatos[0];
  if (!candidatos.length && hora && !/\b(segunda|terca|quarta|quinta|sexta)\b/.test(t)) {
    const porHora = opcoes.filter((iso) => componentesSP(new Date(iso)).hora === Number(hora[1]));
    if (porHora.length === 1) return porHora[0];
  }
  if (opcoes.length === 1 && ehAfirmativo(texto)) return opcoes[0];
  return null;
}

/**
 * Processa uma mensagem do prospect. Em `dry` não grava a entrada nem envia — só decide.
 */
export async function decidirEResponder(pIn: ProspectRow, texto: string, o: OpcoesConversa = {}): Promise<ResultadoConversa> {
  const agora = o.agora ?? new Date();
  const cfg = o.cfg ?? await carregarConfig();
  let p = pIn;
  const antes = p.estagio;
  const dry = !!o.dry;
  const historico = o.historico ?? (await mensagensDoProspect(p.id)).map((m) => ({ autor: m.autor, texto: m.texto }));

  if (!dry && !o.jaGravada) {
    await gravarMensagem({ prospect_id: p.id, direcao: "in", autor: "prospect", texto, message_id: o.messageId ?? null, estagio_antes: antes, correlation_id: o.correlationId ?? null });
  }
  const fim = (r: Omit<ResultadoConversa, "estagio_antes" | "estagio_depois" | "prospect"> & { prospect?: ProspectRow }): ResultadoConversa =>
    ({ ...r, estagio_antes: antes, estagio_depois: (r.prospect ?? p).estagio, prospect: r.prospect ?? p });
  const ctxRed = (extra: Partial<msg.ContextoRedacao> = {}): msg.ContextoRedacao => ({ p, cfg, historico, ultimaMensagem: texto, agora, forcarModo: o.forcarModo, ...extra });

  // ── Freios ─────────────────────────────────────────────────────────────────
  if (p.estagio === "nao_perturbe") return fim({ respondeu: false, motivo: "opt-out: silêncio" });

  const cc = (p.contexto_comercial ?? {}) as Passos;
  const propostoIso = cc.proposto_iso ?? null;
  const oferecidos = cc.horarios_oferecidos ?? [];
  const intent = await lerIntencao(texto, historico, { propostoIso, perguntouHorario: !!oferecidos.length, estagio: p.estagio, agora });
  if (!dry && o.messageId) { const { supabaseAdmin } = await import("@/lib/supabase/server"); await supabaseAdmin.from("prospect_messages").update({ intent }).eq("message_id", o.messageId); }

  // Escritas no prospect: em `dry` só mudam a cópia em memória (simulador não toca no banco).
  const patchP = async (extra: Record<string, unknown>) => { p = dry ? ({ ...p, ...extra } as ProspectRow) : await atualizarProspect(p.id, extra); return p; };
  const ctxCom = (extra: Partial<Passos>) => ({ ...(p.contexto_comercial ?? {}), ...extra });
  const ir = async (para: Estagio, motivo: string, extra?: Parameters<typeof transicionar>[1]["patch"], proximaAcao?: Parameters<typeof transicionar>[1]["proximaAcao"], ctx?: Parameters<typeof transicionar>[1]["ctx"]) => {
    if (p.estagio === para) { if (extra) await patchP(extra as Record<string, unknown>); return p; }
    if (dry) {
      if (!podeIr(p.estagio, para)) throw new Error(`transição inválida: ${p.estagio} → ${para}`);
      const acao = proximaAcao !== undefined ? proximaAcao : proximaAcaoPadrao(para, { agora, followups: p.followups, ...(ctx ?? {}) });
      p = { ...p, ...(extra ?? {}), estagio: para, etapa_pipeline: etapaPipeline(para), next_action_type: acao?.type ?? null, next_action_at: acao?.at ?? null, next_action_owner: acao?.owner ?? null, next_action_reason: acao?.reason ?? null } as ProspectRow;
      if (POS_REUNIAO.has(para)) p = { ...p, owner: "ROBERTO", modo_agente: "observacao" };
      return p;
    }
    p = await transicionar(p, { para, motivo, mensagem: texto, patch: extra, proximaAcao, ctx: { agora, followups: p.followups, ...(ctx ?? {}) } });
    return p;
  };
  const evento = async (tipo: string, motivo?: string) => { if (!dry) await registrarEvento(p.id, { tipo, mensagem: texto, motivo, responsavel: "SDR_AI" }); };
  const enviar = async (r: string, depois?: Estagio) => {
    if (dry) return { ok: true };
    return enviarAoProspect(p, r, { autor: "agente", delayMs: DELAY_DIGITANDO(), estagio_antes: p.estagio, estagio_depois: depois ?? null });
  };

  if (intent.intent === "OPT_OUT") {
    const r = await msg.respostaNaoPerturbe(ctxRed());
    await enviar(r, "nao_perturbe");
    await ir("nao_perturbe", "Pediu para não ser contatado", { motivo_perda: "opt-out" });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  }

  if (TERMINAIS.has(p.estagio)) {
    if (["INTERESSADO", "QUER_REUNIAO", "QUER_VISITA", "PROPOE_HORARIO"].includes(intent.intent)) {
      p = await marcarPrecisaHumano(p, `respondeu com interesse depois de ${p.estagio}: "${texto.slice(0, 80)}"`, dry);
    }
    return fim({ respondeu: false, intent, motivo: `estágio terminal ${p.estagio}`, precisa_humano: p.precisa_humano, prospect: p });
  }

  // ── Depois da reunião marcada: a Rafaela só fecha pontas (endereço, lembrete). O resto é do Roberto. ──
  if (p.owner === "ROBERTO" || p.modo_agente === "observacao" || POS_REUNIAO.has(p.estagio)) {
    if (cc.passo === "confirmar_endereco") {
      if (pareceEndereco(texto)) {
        await patchP({ endereco: texto.trim().slice(0, 300), contexto_comercial: ctxCom({ passo: undefined }) });
        const r = `Anotado, obrigada! ${await msg.confirmacaoVisitaOk(ctxRed())}`;
        await enviar(r);
        await evento("endereco_confirmado", texto.slice(0, 120));
        return fim({ respondeu: true, resposta: r, intent, prospect: p });
      }
      if (ehAfirmativo(texto)) {
        await patchP({ contexto_comercial: ctxCom({ passo: undefined }) });
        const r = await msg.confirmacaoVisitaOk(ctxRed());
        await enviar(r);
        await evento("endereco_confirmado");
        return fim({ respondeu: true, resposta: r, intent, prospect: p });
      }
    }
    if (cc.passo === "lembrete" && ehAfirmativo(texto)) {
      await patchP({ contexto_comercial: ctxCom({ passo: undefined }) });
      const r = await msg.lembrete24hOk(ctxRed());
      await enviar(r);
      await evento("lembrete_confirmado");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    const remarcar = ["RECUSA_HORARIO", "PROPOE_HORARIO", "RETORNAR_DEPOIS", "NAO_INTERESSADO"].includes(intent.intent);
    p = await marcarPrecisaHumano(p, remarcar ? `quer remarcar/cancelar a reunião: "${texto.slice(0, 100)}"` : `mandou mensagem após o handoff: "${texto.slice(0, 100)}"`, dry);
    return fim({ respondeu: false, intent, motivo: "owner Roberto — agente em observação", precisa_humano: true, prospect: p });
  }

  if (p.modo_agente === "pausado" && (!p.pausado_ate || new Date(p.pausado_ate) > agora)) {
    return fim({ respondeu: false, intent, motivo: "agente pausado neste prospect (humano assumiu)" });
  }
  if (p.modo_agente === "pausado") await patchP({ modo_agente: "ativo", pausado_ate: null });

  const campanha = await campanhaAtual();
  const pode = podeResponderAgora({ cfg, campanha, agora });
  if (!pode.ok && !dry) {
    if (!cfg.ligado || !campanha || campanha.status !== "running") {
      p = await marcarPrecisaHumano(p, `respondeu com o agente ${!cfg.ligado ? "desligado" : "fora do piloto"}: "${texto.slice(0, 100)}"`, dry);
      return fim({ respondeu: false, intent, motivo: pode.motivo, precisa_humano: true, prospect: p });
    }
    const quando = proximaHoraDeResposta(campanha, agora);
    await definirProximaAcao(p.id, { type: "RESPONDER_PENDENTE", at: isoSP(quando), owner: "SDR_AI", reason: `Mensagem recebida fora do horário (${pode.motivo})` }, "resposta agendada para a janela");
    p = { ...p, next_action_type: "RESPONDER_PENDENTE", next_action_at: isoSP(quando) };
    return fim({ respondeu: false, intent, motivo: `resposta agendada: ${pode.motivo}`, prospect: p });
  }

  // ── Blocos reutilizáveis ───────────────────────────────────────────────────
  const tipoReuniao = (): "visita" | "online" => cc.tipo_reuniao ?? p.modalidade_preferida ?? ((p.distancia_km ?? Infinity) <= cfg.raio_visita_km ? "visita" : "online");
  const emAbordagem = ["abordado", "aguardando_resposta", "followup"].includes(p.estagio);
  const comDecisor = ["decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao", "momento_ruim", "nutricao_30d", "nutricao_90d"].includes(p.estagio);

  /** Passo 1 do interesse: confirmar a cidade (prepara visita × online). */
  const perguntarCidade = async () => {
    const r = await msg.perguntaCidade(ctxRed());
    await enviar(r, "interesse");
    await ir("interesse", `Interesse identificado (${intent.intent})`, { contexto_comercial: ctxCom({ passo: "confirmar_cidade", resumo: intent.resumo ?? texto.slice(0, 200) }) });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  };
  /** Passo 2: convite (visita ou Meet) pedindo permissão para olhar a agenda. */
  const convidar = async (forcar?: "visita" | "online") => {
    const c = msg.convite(ctxRed(), forcar);
    const r = await c.texto;
    await enviar(r, "interesse");
    await ir("interesse", `Convite para ${c.tipo}`, { modalidade_preferida: c.tipo, contexto_comercial: ctxCom({ passo: "convite", tipo_reuniao: c.tipo }) });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  };
  /** Passo 3: 2 horários reais. */
  const oferecerHorarios = async (periodo?: "manha" | "tarde" | null, prefixo?: string) => {
    const tipo = tipoReuniao();
    const { opcoes } = await horariosDisponiveis(cfg, 2, agora, periodo, cc.horarios_recusados ?? []);
    if (!opcoes.length) {
      p = await marcarPrecisaHumano(p, "sem horário livre nos próximos dias para oferecer", dry);
      const r = `${prefixo ? `${prefixo} ` : ""}Vou ver a agenda do ${cfg.identidade.quem_faz_reuniao} e te retorno com horários.`;
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
    }
    const r = `${prefixo ? `${prefixo}\n\n` : ""}${await msg.ofertaHorarios(ctxRed(), opcoes)}`;
    await enviar(r, "horario_proposto");
    await ir("horario_proposto", `Ofereceu ${opcoes.length} horários (${tipo})`, {
      modalidade_preferida: tipo,
      contexto_comercial: ctxCom({ passo: "oferecido", horarios_oferecidos: opcoes, proposto_iso: null, oferecido_em: agora.toISOString(), tipo_reuniao: tipo }),
    });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  };
  const perguntarPeriodo = async () => {
    const recusados = Array.from(new Set([...(cc.horarios_recusados ?? []), ...oferecidos]));
    const r = await msg.ofertaPeriodo(ctxRed());
    await enviar(r, "horario_proposto");
    await ir("horario_proposto", "Nenhum horário serviu: perguntou o período", { contexto_comercial: ctxCom({ passo: "periodo", horarios_oferecidos: [], horarios_recusados: recusados, proposto_iso: null }) });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  };
  const fecharReuniao = async (iso: string) => {
    const tipo = tipoReuniao();
    if (dry) {
      const r = await msg.confirmacao(ctxRed(), { quandoIso: iso, tipo, link: tipo === "online" ? "(link do Meet)" : null });
      p = { ...p, estagio: "reuniao_agendada", reuniao_em: iso, reuniao_tipo: tipo, owner: "ROBERTO", modo_agente: "observacao", contexto_comercial: ctxCom({ passo: tipo === "visita" ? "confirmar_endereco" : undefined }) } as ProspectRow;
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    const livre = await horarioLivre(cfg, iso);
    if (!livre.livre) return oferecerHorarios(null, `Esse horário acabou de ficar ocupado na agenda do ${cfg.identidade.quem_faz_reuniao}.`);
    const m = await marcarReuniao(p, cfg, { inicioIso: new Date(iso).toISOString(), tipo, resumo: cc.resumo ?? intent.resumo ?? null });
    if (!m.ok || !m.prospect) {
      p = await marcarPrecisaHumano(p, `não consegui criar a reunião (${m.error})`, dry);
      const r = `Perfeito. Vou confirmar na agenda do ${cfg.identidade.quem_faz_reuniao} e te retorno com os detalhes.`;
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
    }
    p = m.prospect;
    const r = await msg.confirmacao(ctxRed(), { quandoIso: iso, tipo, link: m.meet_url });
    await enviar(r, "reuniao_agendada");
    // Visita: a próxima fala do prospect é a confirmação do endereço (ou o endereço em si).
    if (tipo === "visita") p = await atualizarProspect(p.id, { contexto_comercial: ctxCom({ passo: "confirmar_endereco" }) });
    const h = await fazerHandoff(p, cfg);
    p = h.prospect;
    return fim({ respondeu: true, resposta: r, intent, precisa_humano: m.sem_link, prospect: p });
  };

  // ── Passos que dependem do sub-estado (antes da tabela geral) ──────────────
  // "Horário na fala" só conta com horário de verdade: a IA às vezes chama "pode ver os horários" de proposta.
  const horarioNaFala = (intent.intent === "CONFIRMA_HORARIO" || intent.intent === "PROPOE_HORARIO") && (!!intent.quando || !!propostoIso || !!casarOpcao(texto, oferecidos));
  if ((intent.intent === "PROPOE_HORARIO" || intent.intent === "CONFIRMA_HORARIO") && !horarioNaFala) intent.intent = ehAfirmativo(texto) ? "INTERESSADO" : "OUTRO";
  const desvia = ["NAO_INTERESSADO", "RETORNAR_DEPOIS", "PEDIU_PRECO", "E_ROBO", "JA_TEM_AGENCIA", "SEM_ORCAMENTO", "CLIENTE_NAO_E_ICP", "OPT_OUT"].includes(intent.intent);
  if (p.estagio === "interesse" && !horarioNaFala && !desvia) {
    if (cc.passo === "confirmar_cidade") {
      // "sim/isso/certo" ou qualquer resposta que não seja recusa → convite. Cidade diferente vira nota.
      if (!ehAfirmativo(texto) && /\bn[aã]o\b/i.test(texto)) await patchP({ contexto_comercial: ctxCom({ resumo: `${cc.resumo ?? ""} · disse sobre a cidade: "${texto.slice(0, 80)}"`.trim() }) });
      return convidar(intent.intent === "QUER_VISITA" ? "visita" : intent.intent === "QUER_REUNIAO" ? "online" : undefined);
    }
    if (cc.passo === "convite") {
      if (intent.intent === "QUER_VISITA" && cc.tipo_reuniao !== "visita") return convidar("visita");
      if (intent.intent === "QUER_REUNIAO" && cc.tipo_reuniao !== "online") { await patchP({ modalidade_preferida: "online", contexto_comercial: ctxCom({ tipo_reuniao: "online" }) }); return oferecerHorarios(null); }
      if (ehAfirmativo(texto) || ["INTERESSADO", "QUER_REUNIAO", "QUER_VISITA"].includes(intent.intent)) return oferecerHorarios(null);
    }
  }
  if (p.estagio === "horario_proposto" && cc.passo === "periodo") {
    const per = lerPeriodo(texto);
    if (per) return oferecerHorarios(per);
  }

  switch (intent.intent) {
    case "E_ROBO": {
      const r = await msg.respostaERobo(ctxRed());
      await enviar(r);
      await evento("perguntou_se_e_robo");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "PEDIU_PRECO": {
      const jaPerguntou = p.objecoes?.includes("perguntou preço");
      const r = await msg.respostaPreco(ctxRed({ intent }));
      await enviar(r);
      await patchP({ objecoes: Array.from(new Set([...(p.objecoes ?? []), "perguntou preço"])) });
      p = await marcarPrecisaHumano(p, jaPerguntou ? `insistiu em preço: "${texto.slice(0, 80)}"` : `pediu preço/proposta: "${texto.slice(0, 80)}"`, dry);
      return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
    }
    case "CLIENTE_NAO_E_ICP": {
      const r = "Entendi, desculpe o incômodo. Obrigada e bom trabalho!";
      await enviar(r, "fora_icp");
      await ir("fora_icp", `Não é do ramo: "${texto.slice(0, 80)}"`);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "NAO_INTERESSADO": {
      const r = await msg.respostaSemInteresse(ctxRed());
      await enviar(r, "perdido");
      await ir("perdido", "Não interessado", { motivo_perda: "Não interessado", objecoes: Array.from(new Set([...(p.objecoes ?? []), intent.objecao ?? "não interessado"])) });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "JA_TEM_AGENCIA": {
      const r = await msg.respostaJaTemAgencia(ctxRed({ intent }));
      await enviar(r);
      await patchP({ objecoes: Array.from(new Set([...(p.objecoes ?? []), "já tem agência"])), contexto_comercial: ctxCom({ objecao: "já tem agência" }) });
      if (!comDecisor) await ir("decisor_contatado", "Objeção: já tem agência");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "SEM_ORCAMENTO": {
      const retornar = resolverQuando("60 dias", agora)!;
      const r = await msg.respostaRetornarDepois(ctxRed(), msg.quandoPorExtenso(retornar));
      await enviar(r, "momento_ruim");
      await ir("momento_ruim", "Sem orçamento agora", { objecoes: Array.from(new Set([...(p.objecoes ?? []), "sem orçamento agora"])), cadencia_cancelada: true, contexto_comercial: ctxCom({ objecao: "sem orçamento agora", motivo_retorno: "estava sem orçamento no momento", retornar_em: isoSP(retornar) }) },
        { type: "RETOMAR", at: isoSP(retornar), owner: "SDR_AI", reason: "Sem orçamento: retomar em 60 dias" });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "RETORNAR_DEPOIS": {
      const quando = resolverQuando(intent.quando ?? texto, agora) ?? resolverQuando("30 dias", agora)!;
      const quandoTxt = msg.quandoPorExtenso(quando);
      const r = await msg.respostaRetornarDepois(ctxRed(), quandoTxt);
      await enviar(r, "momento_ruim");
      await ir("momento_ruim", `Pediu contato depois: "${(intent.quando ?? texto).slice(0, 80)}"`, {
        cadencia_cancelada: true,
        contexto_comercial: ctxCom({ passo: undefined, motivo_retorno: intent.contexto ?? texto.slice(0, 200), retornar_em: isoSP(quando), proxima_abordagem: `retomar citando: ${(intent.contexto ?? texto).slice(0, 120)}` }),
      }, { type: "RETOMAR", at: isoSP(quando), owner: "SDR_AI", reason: `Prospect pediu contato ${quandoTxt}` });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "DECISOR_INDISPONIVEL": {
      const r = p.estagio === "atendente"
        ? `Sem problema. Qual o melhor horário para eu falar com ele? Se preferir, pode me passar o contato direto que eu chamo por lá.`
        : await msg.mensagemRecepcao(ctxRed({ intent }));
      await enviar(r, "atendente");
      await ir("atendente", "Falou com a recepção; decisor indisponível");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "DECISOR_IDENTIFICADO": {
      const patch: Record<string, unknown> = {};
      if (intent.decisor_nome) { patch.decisor_nome = nomeProprio(intent.decisor_nome); patch.decisor_confianca = 0.85; patch.decisor_fontes = Array.from(new Set([...(p.decisor_fontes ?? []), "conversa"])); }
      if (intent.decisor_cargo) patch.decisor_cargo = intent.decisor_cargo;
      const quem = intent.decisor_nome ? `o ${primeiroNome(intent.decisor_nome)}` : "ele";
      const r = `Obrigada! Consigo falar com ${quem} por aqui? Se for mais fácil, pode me passar o contato direto ${intent.decisor_nome ? "dele" : "do responsável"}.`;
      await enviar(r, "decisor_identificado");
      await ir("decisor_identificado", `Decisor identificado: ${intent.decisor_nome ?? intent.decisor_cargo ?? "?"}`, patch);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "PASSOU_CONTATO": {
      const tel = telefoneDigitos(intent.telefone);
      if (!tel) break;
      const r = "Obrigada! Vou falar com ele por lá.";
      await enviar(r, "decisor_identificado");
      let verificado: boolean | null = null;
      if (!dry) { const v = await verificarWhatsapp([tel]); verificado = v[0]?.existe ?? null; }
      await patchP({ decisor_telefone: tel, decisor_fontes: Array.from(new Set([...(p.decisor_fontes ?? []), "conversa"])) });
      await ir("decisor_identificado", `Recebeu o contato do decisor (${tel})`);
      if (verificado === false) {
        p = await marcarPrecisaHumano(p, `o número passado (${tel}) não tem WhatsApp`, dry);
        return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
      }
      // Abre a conversa direto com o decisor (mesma empresa — não conta como nova prospecção).
      const abordagem = await msg.abordagemInicial(ctxRed({ historico: [] }));
      if (!dry) await enviarTexto(`${tel}@s.whatsapp.net`, abordagem, DELAY_DIGITANDO());
      if (!dry) await gravarMensagem({ prospect_id: p.id, direcao: "out", autor: "agente", texto: abordagem, estagio_antes: p.estagio, estagio_depois: "decisor_contatado" });
      await ir("decisor_contatado", "Abordou o decisor no número direto");
      return fim({ respondeu: true, resposta: `${r}\n\n[para ${tel}] ${abordagem}`, intent, prospect: p });
    }
    case "SOU_O_DECISOR": {
      const patch: Record<string, unknown> = {};
      if (!p.decisor_nome && intent.decisor_nome) { patch.decisor_nome = nomeProprio(intent.decisor_nome); patch.decisor_confianca = 0.9; patch.decisor_fontes = ["conversa"]; }
      if (Object.keys(patch).length) await patchP(patch);
      // Contexto + gancho, e PARA: sem pedir reunião. A resposta dele decide o próximo passo.
      const r = await msg.mensagemDecisor(ctxRed({ intent }));
      await enviar(r, "decisor_contatado");
      await ir("decisor_contatado", "Chegou ao decisor");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "QUER_SABER_MAIS": {
      if (emAbordagem || p.estagio === "atendente") {
        const r = await msg.mensagemRecepcao(ctxRed({ intent }));
        await enviar(r, "atendente");
        await ir("atendente", "Recepção perguntou do que se trata");
        return fim({ respondeu: true, resposta: r, intent, prospect: p });
      }
      const r = await msg.respostaSaberMais(ctxRed({ intent }));
      await enviar(r);
      if (!comDecisor) await ir("decisor_contatado", "Quis saber mais");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "INTERESSADO":
    case "QUER_REUNIAO":
    case "QUER_VISITA": {
      // Pediu visita/Meet explicitamente → pula a pergunta da cidade e convida direto.
      if (intent.intent === "QUER_VISITA") return convidar("visita");
      if (intent.intent === "QUER_REUNIAO") { await ir("interesse", "Pediu reunião online", { modalidade_preferida: "online", contexto_comercial: ctxCom({ tipo_reuniao: "online", resumo: intent.resumo ?? texto.slice(0, 200) }) }); return oferecerHorarios(null); }
      if (p.estagio === "interesse" && cc.passo === "convite") return oferecerHorarios(null);
      return perguntarCidade();
    }
    case "PROPOE_HORARIO": {
      if (!intent.quando) break;
      const iso = intent.quando;
      const livre = dry ? { livre: true } : await horarioLivre(cfg, iso);
      if (!livre.livre) return oferecerHorarios(null, `${porExtensoSP(iso)} o ${cfg.identidade.quem_faz_reuniao} já tem compromisso.`);
      const r = `Perfeito, ${porExtensoSP(iso)} funciona. Posso confirmar?`;
      await enviar(r, "aguardando_confirmacao");
      await ir("aguardando_confirmacao", `Prospect sugeriu ${porExtensoSP(iso)}`, { contexto_comercial: ctxCom({ proposto_iso: iso, proposto_em: agora.toISOString(), tipo_reuniao: tipoReuniao() }) });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "CONFIRMA_HORARIO": {
      const iso = intent.quando ?? propostoIso ?? casarOpcao(texto, oferecidos);
      if (!iso) break;
      return fecharReuniao(iso);
    }
    case "RECUSA_HORARIO": {
      if (cc.passo === "periodo") { const per = lerPeriodo(texto); if (per) return oferecerHorarios(per); }
      return perguntarPeriodo();
    }
    case "SAUDACAO": {
      if (emAbordagem) {
        const nome = primeiroNome(p.decisor_nome);
        const r = nome ? `Oi! Tudo bem? Consigo falar com o ${nome} por aqui?` : `Oi! Tudo bem? Consigo falar com o responsável pela ${p.nome} por aqui?`;
        await enviar(r);
        return fim({ respondeu: true, resposta: r, intent, prospect: p });
      }
      break;
    }
    default: break;
  }

  // Resposta a uma oferta de horário que as regras não casaram ("quarta" / "pode ser sim").
  if (oferecidos.length && ["horario_proposto", "aguardando_confirmacao"].includes(p.estagio)) {
    const escolhido = casarOpcao(texto, oferecidos);
    if (escolhido) return fecharReuniao(escolhido);
    if (ehAfirmativo(texto) && oferecidos.length > 1) {
      const r = `Qual dos dois fica melhor: ${oferecidos.map(porExtensoSP).join(" ou ")}?`;
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    if (/\bnenhum|n[aã]o (d[aá]|consigo|posso)|outro (dia|hor[aá]rio)\b/i.test(texto)) return perguntarPeriodo();
  }

  // Não entendi com segurança: a IA tenta responder dentro do playbook; se não der, humano.
  if (intent.confianca >= 0.5 && intent.intent === "OUTRO" && comDecisor) {
    const r = await msg.respostaSaberMais(ctxRed({ intent }));
    if (r) { await enviar(r); return fim({ respondeu: true, resposta: r, intent, prospect: p }); }
  }
  p = await marcarPrecisaHumano(p, `não entendi a resposta: "${texto.slice(0, 120)}"`, dry);
  return fim({ respondeu: false, intent, motivo: "sem decisão segura → humano", precisa_humano: true, prospect: p });
}

/** Retoma um estágio com data (nutrição / momento ruim) — chamado pelo tick. */
export async function retomarContato(p: ProspectRow, cfg: ProspectConfig, dry = false): Promise<{ ok: boolean; texto?: string | null; motivo?: string }> {
  const historico = (await mensagensDoProspect(p.id)).map((m) => ({ autor: m.autor, texto: m.texto }));
  const texto = await msg.mensagemNutricao({ p, cfg, historico, origem: "prospeccao:retorno" });
  if (!texto) {
    await marcarPrecisaHumano(p, "hora de retomar o contato, mas não há contexto da conversa anterior para uma retomada honesta", dry);
    return { ok: false, motivo: "sem texto" };
  }
  if (!dry) {
    const r = await enviarAoProspect(p, texto, { autor: "agente", delayMs: DELAY_DIGITANDO(), estagio_antes: p.estagio, estagio_depois: "decisor_contatado" });
    if (!r.ok) return { ok: false, motivo: r.error };
    await transicionar(p, { para: "decisor_contatado", motivo: "Retomou o contato (nutrição)", mensagem: texto, patch: { followups: 0, cadencia_cancelada: false } });
  }
  return { ok: true, texto };
}

/** Descoberta de "dia útil às 09:30" para os testes e o tick. */
export const proximoFollowupEm = (agora: Date, dias: number) => { const c = componentesSP(agora); return dataSP(c.ano, c.mes, c.dia + dias, 9, 30); };
