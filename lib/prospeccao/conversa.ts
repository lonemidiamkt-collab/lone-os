// lib/prospeccao/conversa.ts — o agente conversando. Uma mensagem entra, uma decisão sai.
//
// Ordem fixa: gravar → freios (terminal, dono, pausa, piloto, janela) → intenção → tabela de
// decisão (intenção × estágio) → resposta → envio → transição → próxima ação. A IA lê e redige;
// quem decide o rumo é a tabela. O que a tabela não sabe resolver vira `precisa_humano`, com
// aviso ao Roberto — nunca um chute.

import type { IntentLida, ProspectRow, Estagio } from "./tipos";
import { carregarConfig, type ProspectConfig } from "./config";
import { campanhaAtual } from "./piloto";
import { podeResponderAgora, proximaHoraDeResposta } from "./limites";
import { lerIntencao } from "./intencao";
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

const DELAY_DIGITANDO = () => 3000 + Math.round(Math.random() * 5000);

/** Avisa o Roberto UMA vez por motivo e marca o prospect. */
export async function marcarPrecisaHumano(p: ProspectRow, motivo: string, dry = false): Promise<ProspectRow> {
  if (p.precisa_humano && p.motivo_humano === motivo) return p;
  if (dry) return { ...p, precisa_humano: true, motivo_humano: motivo };
  const atual = await atualizarProspect(p.id, { precisa_humano: true, motivo_humano: motivo });
  await registrarEvento(p.id, { tipo: "precisa_humano", motivo, responsavel: "SDR_AI" });
  if (!dry) {
    const adm = process.env.CS_ADM_GROUP_JID;
    if (adm) {
      try {
        const { csSendGroupText } = await import("@/lib/cs/notify");
        await csSendGroupText(adm, `SDR — ${p.nome} precisa de você: ${motivo}\n${appUrl()}/prospeccao?prospect=${p.id}`, undefined, { origem: "prospeccao", destino: "interno" });
      } catch { /* aviso é secundário */ }
    }
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
  if (opcoes.length === 1 && /^\s*(sim|pode|ok|beleza|fechado|perfeito|isso|combinado|show)\b/.test(t)) return opcoes[0];
  return null;
}

function contextoCom(p: ProspectRow, extra: Record<string, unknown>) {
  return { ...(p.contexto_comercial ?? {}), ...extra };
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

  // ── Freios ─────────────────────────────────────────────────────────────────
  if (p.estagio === "nao_perturbe") return fim({ respondeu: false, motivo: "opt-out: silêncio" });

  // Intenção primeiro para os freios que dependem dela (opt-out vale em qualquer estágio).
  const propostoIso = (p.contexto_comercial as { proposto_iso?: string })?.proposto_iso ?? null;
  const oferecidos = ((p.contexto_comercial as { horarios_oferecidos?: string[] })?.horarios_oferecidos ?? []);
  const intent = await lerIntencao(texto, historico, { propostoIso, perguntouHorario: !!oferecidos.length, estagio: p.estagio, agora });
  const anexarIntent = async () => { if (!dry && o.messageId) { const { supabaseAdmin } = await import("@/lib/supabase/server"); await supabaseAdmin.from("prospect_messages").update({ intent }).eq("message_id", o.messageId); } };
  await anexarIntent();

  // Escritas no prospect: em `dry` só mudam a cópia em memória (simulador não toca no banco).
  const patchP = async (extra: Record<string, unknown>) => {
    p = dry ? ({ ...p, ...extra } as ProspectRow) : await atualizarProspect(p.id, extra);
    return p;
  };
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

  if (intent.intent === "OPT_OUT") {
    const r = msg.respostaNaoPerturbe(cfg);
    if (!dry) await enviarAoProspect(p, r, { autor: "agente", delayMs: DELAY_DIGITANDO(), estagio_depois: "nao_perturbe" });
    await ir("nao_perturbe", "Pediu para não ser contatado", { motivo_perda: "opt-out" });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  }

  if (TERMINAIS.has(p.estagio)) {
    if (["INTERESSADO", "QUER_REUNIAO", "QUER_VISITA", "PROPOE_HORARIO"].includes(intent.intent)) {
      p = await marcarPrecisaHumano(p, `respondeu com interesse depois de ${p.estagio}: "${texto.slice(0, 80)}"`, dry);
    }
    return fim({ respondeu: false, intent, motivo: `estágio terminal ${p.estagio}`, precisa_humano: p.precisa_humano, prospect: p });
  }

  if (p.owner === "ROBERTO" || p.modo_agente === "observacao" || POS_REUNIAO.has(p.estagio)) {
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
    // Fora do horário: a resposta sai na abertura da janela (o tick chama de novo com a última mensagem).
    const quando = proximaHoraDeResposta(campanha, agora);
    await definirProximaAcao(p.id, { type: "RESPONDER_PENDENTE", at: isoSP(quando), owner: "SDR_AI", reason: `Mensagem recebida fora do horário (${pode.motivo})` }, "resposta agendada para a janela");
    p = { ...p, next_action_type: "RESPONDER_PENDENTE", next_action_at: isoSP(quando) };
    return fim({ respondeu: false, intent, motivo: `resposta agendada: ${pode.motivo}`, prospect: p });
  }

  // ── Decisão ────────────────────────────────────────────────────────────────
  const enviar = async (r: string, depois?: Estagio) => {
    if (dry) return { ok: true };
    return enviarAoProspect(p, r, { autor: "agente", delayMs: DELAY_DIGITANDO(), estagio_antes: p.estagio, estagio_depois: depois ?? null });
  };
  const nome = primeiroNome(p.decisor_nome);
  const emAbordagem = ["abordado", "aguardando_resposta", "followup"].includes(p.estagio);
  const comDecisor = ["decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao", "momento_ruim", "nutricao_30d", "nutricao_90d"].includes(p.estagio);

  const oferecerHorarios = async (tipo: "visita" | "online", prefixo?: string) => {
    const { opcoes } = await horariosDisponiveis(cfg, 2, agora);
    if (!opcoes.length) {
      p = await marcarPrecisaHumano(p, "sem horário livre nos próximos dias para oferecer", dry);
      const r = `${prefixo ? `${prefixo} ` : ""}Vou ver a agenda do Roberto e te retorno com horários.`;
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
    }
    const r = `${prefixo ? `${prefixo}\n\n` : ""}${msg.ofertaHorarios(opcoes, cfg)}`;
    await enviar(r, "horario_proposto");
    await ir("horario_proposto", `Ofereceu ${opcoes.length} horários (${tipo})`, {
      modalidade_preferida: tipo,
      contexto_comercial: contextoCom(p, { horarios_oferecidos: opcoes, proposto_iso: null, oferecido_em: agora.toISOString(), tipo_reuniao: tipo }),
    });
    return fim({ respondeu: true, resposta: r, intent, prospect: p });
  };

  const fecharReuniao = async (iso: string) => {
    const tipo: "visita" | "online" = ((p.contexto_comercial as { tipo_reuniao?: "visita" | "online" })?.tipo_reuniao) ?? p.modalidade_preferida ?? ((p.distancia_km ?? Infinity) <= cfg.raio_visita_km ? "visita" : "online");
    if (dry) {
      const r = msg.confirmacao(p, cfg, { quandoIso: iso, tipo, link: tipo === "online" ? "(link do Meet)" : null });
      p = { ...p, estagio: "reuniao_agendada", reuniao_em: iso, reuniao_tipo: tipo };
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    const livre = await horarioLivre(cfg, iso);
    if (!livre.livre) {
      return oferecerHorarios(tipo, `Esse horário acabou de ficar ocupado na agenda do Roberto.`);
    }
    const resumo = intent.resumo ?? null;
    const m = await marcarReuniao(p, cfg, { inicioIso: new Date(iso).toISOString(), tipo, resumo: p.contexto_comercial?.resumo ?? resumo });
    if (!m.ok || !m.prospect) {
      p = await marcarPrecisaHumano(p, `não consegui criar a reunião (${m.error})`, dry);
      const r = "Perfeito. Vou confirmar na agenda do Roberto e te retorno com os detalhes.";
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
    }
    p = m.prospect;
    const r = msg.confirmacao(p, cfg, { quandoIso: iso, tipo, link: m.meet_url });
    await enviar(r, "reuniao_agendada");
    const h = await fazerHandoff(p, cfg);
    p = h.prospect;
    return fim({ respondeu: true, resposta: r, intent, precisa_humano: m.sem_link, prospect: p });
  };

  switch (intent.intent) {
    case "E_ROBO": {
      const r = msg.respostaERobo(cfg);
      await enviar(r);
      await evento("perguntou_se_e_robo");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "PEDIU_PRECO": {
      // Responde redirecionando para a conversa com o Roberto E avisa: preço/proposta é decisão dele (§32).
      const jaPerguntou = p.objecoes?.includes("perguntou preço");
      const r = msg.respostaPreco(p, cfg);
      await enviar(r);
      await patchP({ objecoes: Array.from(new Set([...(p.objecoes ?? []), "perguntou preço"])) });
      p = await marcarPrecisaHumano(p, jaPerguntou ? `insistiu em preço: "${texto.slice(0, 80)}"` : `pediu preço/proposta: "${texto.slice(0, 80)}"`, dry);
      return fim({ respondeu: true, resposta: r, intent, precisa_humano: true, prospect: p });
    }
    case "CLIENTE_NAO_E_ICP": {
      const r = "Entendi, desculpe o incômodo. Bom dia!";
      await enviar(r, "fora_icp");
      await ir("fora_icp", `Não é do ramo: "${texto.slice(0, 80)}"`);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "NAO_INTERESSADO": {
      const r = msg.respostaSemInteresse(p, cfg);
      await enviar(r, "perdido");
      await ir("perdido", "Não interessado", { motivo_perda: "Não interessado", objecoes: Array.from(new Set([...(p.objecoes ?? []), intent.objecao ?? "não interessado"])) });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "JA_TEM_AGENCIA":
    case "SEM_ORCAMENTO": {
      const objecao = intent.intent === "JA_TEM_AGENCIA" ? "já tem agência" : "sem orçamento agora";
      const objetivo = intent.intent === "JA_TEM_AGENCIA"
        ? "O prospect disse que já tem agência. Reconheça sem pressionar e ofereça uma conversa de 20 minutos com o Roberto para mostrar o que a Lone faz diferente em empresas do segmento (sem compromisso). Se ele não quiser, tudo bem."
        : "O prospect disse que está sem orçamento agora. Reconheça, diga que a Lone volta a falar daqui a uns dois meses e pergunte se pode.";
      const r = (await msg.redigirComIA({ p, cfg, objetivo, historico, ultimaMensagem: texto, origem: "prospeccao:objecao" }))
        ?? (intent.intent === "JA_TEM_AGENCIA"
          ? "Entendi. Várias empresas que atendemos também tinham. Se fizer sentido, o Roberto mostra em 20 minutos o que estamos fazendo diferente no segmento, sem compromisso. Topa?"
          : "Entendi, sem problema. Posso voltar a falar com você daqui a uns dois meses?");
      await enviar(r);
      const objecoes = Array.from(new Set([...(p.objecoes ?? []), objecao]));
      if (intent.intent === "SEM_ORCAMENTO") {
        const retornar = resolverQuando("60 dias", agora)!;
        await ir("momento_ruim", "Sem orçamento agora", { objecoes, contexto_comercial: contextoCom(p, { objecao, motivo_retorno: "estava sem orçamento", proxima_abordagem: "perguntar se o momento melhorou para investir em comunicação" }) },
          { type: "RETOMAR", at: isoSP(retornar), owner: "SDR_AI", reason: "Sem orçamento: retomar em 60 dias" });
      } else {
        await patchP({ objecoes, contexto_comercial: contextoCom(p, { objecao }) });
        if (!comDecisor) await ir("decisor_contatado", "Objeção: já tem agência");
      }
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "RETORNAR_DEPOIS": {
      const quando = resolverQuando(intent.quando ?? texto, agora) ?? resolverQuando("30 dias", agora)!;
      const r = msg.respostaRetornarDepois(cfg, msg.quandoPorExtenso(quando));
      await enviar(r, "momento_ruim");
      await ir("momento_ruim", `Pediu contato depois: "${(intent.quando ?? texto).slice(0, 80)}"`, {
        cadencia_cancelada: true,
        contexto_comercial: contextoCom(p, { motivo_retorno: intent.contexto ?? texto.slice(0, 200), retornar_em: isoSP(quando), proxima_abordagem: `retomar citando: ${(intent.contexto ?? texto).slice(0, 120)}` }),
      }, { type: "RETOMAR", at: isoSP(quando), owner: "SDR_AI", reason: `Prospect pediu contato ${msg.quandoPorExtenso(quando)}` });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "DECISOR_INDISPONIVEL": {
      const r = p.estagio === "atendente"
        ? "Sem problema. Qual o melhor horário pra falar com ele? Se preferir, pode me passar o WhatsApp direto."
        : msg.mensagemRecepcao(p, cfg);
      await enviar(r, "atendente");
      await ir("atendente", "Falou com a recepção; decisor indisponível");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "DECISOR_IDENTIFICADO": {
      const patch: Record<string, unknown> = {};
      if (intent.decisor_nome) { patch.decisor_nome = nomeProprio(intent.decisor_nome); patch.decisor_confianca = 0.85; patch.decisor_fontes = Array.from(new Set([...(p.decisor_fontes ?? []), "conversa"])); }
      if (intent.decisor_cargo) patch.decisor_cargo = intent.decisor_cargo;
      const quem = intent.decisor_nome ? `o ${primeiroNome(intent.decisor_nome)}` : "ele";
      const r = `Obrigado! Consigo falar com ${quem}? Se preferir, me passa o WhatsApp direto ${intent.decisor_nome ? "dele" : "do responsável"}.`;
      await enviar(r, "decisor_identificado");
      await ir("decisor_identificado", `Decisor identificado: ${intent.decisor_nome ?? intent.decisor_cargo ?? "?"}`, patch);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "PASSOU_CONTATO": {
      const tel = telefoneDigitos(intent.telefone);
      if (!tel) break;
      const r = "Obrigado! Vou falar com ele por lá.";
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
      const abordagem = msg.abordagemInicial(p, cfg);
      if (!dry) await enviarTexto(`${tel}@s.whatsapp.net`, abordagem, DELAY_DIGITANDO());
      if (!dry) await gravarMensagem({ prospect_id: p.id, direcao: "out", autor: "agente", texto: abordagem, estagio_antes: p.estagio, estagio_depois: "decisor_contatado" });
      await ir("decisor_contatado", "Abordou o decisor no número direto");
      return fim({ respondeu: true, resposta: `${r}\n\n[para ${tel}] ${abordagem}`, intent, prospect: p });
    }
    case "SOU_O_DECISOR": {
      const patch: Record<string, unknown> = {};
      if (!p.decisor_nome && intent.decisor_nome) { patch.decisor_nome = nomeProprio(intent.decisor_nome); patch.decisor_confianca = 0.9; patch.decisor_fontes = ["conversa"]; }
      if (Object.keys(patch).length) await patchP(patch);
      const r = msg.mensagemDecisor(p, cfg);
      await enviar(r, "decisor_contatado");
      await ir("decisor_contatado", "Chegou ao decisor");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "QUER_SABER_MAIS": {
      if (emAbordagem || p.estagio === "atendente") {
        const r = msg.mensagemRecepcao(p, cfg);
        await enviar(r, "atendente");
        await ir("atendente", "Recepção perguntou do que se trata");
        return fim({ respondeu: true, resposta: r, intent, prospect: p });
      }
      const r = await msg.respostaSaberMais(p, cfg, historico, texto, intent)
        ?? `A Lone é uma assessoria de marketing especializada em construção civil: cuidamos de conteúdo, anúncios e da geração de demanda pelo WhatsApp para lojas do segmento. O Roberto explica melhor em uma conversa de 20 minutos. Posso ver um horário com ele?`;
      await enviar(r);
      if (!comDecisor) await ir("decisor_contatado", "Quis saber mais");
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "INTERESSADO":
    case "QUER_REUNIAO":
    case "QUER_VISITA": {
      const forcar = intent.intent === "QUER_VISITA" ? "visita" : intent.intent === "QUER_REUNIAO" ? "online" : undefined;
      const c = msg.convite(p, cfg, forcar);
      await ir("interesse", `Interesse identificado (${intent.intent})`, { contexto_comercial: contextoCom(p, { resumo: intent.resumo ?? texto.slice(0, 200) }) });
      return oferecerHorarios(c.tipo, c.texto.replace(/\s*Posso ver um horário com (ele|o Roberto)\?$/, "."));
    }
    case "PROPOE_HORARIO": {
      if (!intent.quando) break;
      const iso = intent.quando;
      const livre = dry ? { livre: true } : await horarioLivre(cfg, iso);
      if (!livre.livre) {
        const tipo = ((p.contexto_comercial as { tipo_reuniao?: "visita" | "online" })?.tipo_reuniao) ?? p.modalidade_preferida ?? "online";
        return oferecerHorarios(tipo, `${porExtensoSP(iso)} o Roberto já tem compromisso.`);
      }
      const r = `Perfeito, ${porExtensoSP(iso)} funciona. Posso confirmar?`;
      await enviar(r, "aguardando_confirmacao");
      await ir("aguardando_confirmacao", `Prospect sugeriu ${porExtensoSP(iso)}`, { contexto_comercial: contextoCom(p, { proposto_iso: iso, proposto_em: agora.toISOString() }) });
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
    case "CONFIRMA_HORARIO": {
      const iso = intent.quando ?? propostoIso ?? casarOpcao(texto, oferecidos);
      if (!iso) break;
      return fecharReuniao(iso);
    }
    case "RECUSA_HORARIO": {
      const tipo = ((p.contexto_comercial as { tipo_reuniao?: "visita" | "online" })?.tipo_reuniao) ?? p.modalidade_preferida ?? "online";
      return oferecerHorarios(tipo, "Sem problema.");
    }
    case "SAUDACAO": {
      if (emAbordagem) {
        const r = nome ? `Olá! Tudo bem? Consigo falar com o ${nome}?` : `Olá! Tudo bem? Consigo falar com o proprietário ou responsável pela ${p.nome}?`;
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
    if (/^\s*(sim|pode|ok|beleza|fechado|perfeito|combinado|show|bora|vamos)\b/i.test(texto) && oferecidos.length > 1) {
      const r = `Qual dos dois fica melhor: ${oferecidos.map(porExtensoSP).join(" ou ")}?`;
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
  }

  // Não entendi com segurança: a IA tenta responder dentro do playbook; se não der, humano.
  if (intent.confianca >= 0.5 && intent.intent === "OUTRO") {
    const r = await msg.respostaSaberMais(p, cfg, historico, texto, intent);
    if (r) {
      await enviar(r);
      return fim({ respondeu: true, resposta: r, intent, prospect: p });
    }
  }
  p = await marcarPrecisaHumano(p, `não entendi a resposta: "${texto.slice(0, 120)}"`, dry);
  return fim({ respondeu: false, intent, motivo: "sem decisão segura → humano", precisa_humano: true, prospect: p });
}

/** Retoma um estágio com data (nutrição / momento ruim) — chamado pelo tick. */
export async function retomarContato(p: ProspectRow, cfg: ProspectConfig, dry = false): Promise<{ ok: boolean; texto?: string | null; motivo?: string }> {
  const historico = (await mensagensDoProspect(p.id)).map((m) => ({ autor: m.autor, texto: m.texto }));
  const texto = await msg.mensagemNutricao(p, cfg, historico);
  if (!texto) {
    await marcarPrecisaHumano(p, "hora de retomar o contato, mas não consegui redigir a mensagem", dry);
    return { ok: false, motivo: "sem texto" };
  }
  if (!dry) {
    const r = await enviarAoProspect(p, texto, { autor: "agente", delayMs: DELAY_DIGITANDO(), estagio_antes: p.estagio, estagio_depois: "decisor_contatado" });
    if (!r.ok) return { ok: false, motivo: r.error };
  }
  if (!dry) await transicionar(p, { para: "decisor_contatado", motivo: "Retomou o contato (nutrição)", mensagem: texto, patch: { followups: 0, cadencia_cancelada: false } });
  return { ok: true, texto };
}

/** Descoberta de "dia útil às 09:30" para os testes e o tick. */
export const proximoFollowupEm = (agora: Date, dias: number) => { const c = componentesSP(agora); return dataSP(c.ano, c.mes, c.dia + dias, 9, 30); };
