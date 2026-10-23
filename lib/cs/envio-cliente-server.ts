// lib/cs/envio-cliente-server.ts — banco e WhatsApp da prévia + "ok" antes de mandar no grupo do
// cliente. As regras (texto da prévia, leitura do "ok", desfecho do envio) moram em
// lib/cs/envio-cliente.ts. Tabela: cs_envios_cliente (migration 20261021130002).

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { registrarEnvio, temCheckinAguardando, type PerguntaCheckin } from "@/lib/cs/checkin";
import { desfechoDoEnvio, previaPeloTexto, previaVencida, textoPrevia, type TipoEnvio } from "@/lib/cs/envio-cliente";

export interface EnvioCliente {
  id: string;
  tipo: TipoEnvio;
  client_id: string;
  cliente_nome: string;
  grupo_cliente: string;
  grupo_interno: string;
  texto: string;
  chave: string | null;
  dados: Record<string, unknown> | null;
  status: string;
  msg_id_previa: string | null;
  created_at: string;
}

/** Já saiu a cobrança com esta chave? "erro" = não deu pra conferir (quem chama não manda). */
export async function cobrancaJaFeita(chave: string): Promise<"sim" | "nao" | "erro"> {
  const { data, error } = await supabaseAdmin.from("cs_cobrancas").select("id").eq("chave", chave).limit(1);
  if (error) {
    console.error("[CS/envio-cliente] conferir cobrança:", error.message);
    return "erro";
  }
  return data && data.length ? "sim" : "nao";
}

/**
 * Guarda o envio e mostra a prévia no grupo interno. Nada vai pro cliente aqui. Falhou (tabela
 * ausente, prévia que não saiu) → { ok: false } com o motivo, para o chamador dizer "não consegui".
 */
export async function prepararEnvioAoCliente(p: {
  tipo: TipoEnvio; clientId: string; clienteNome: string; grupoCliente: string; grupoInterno: string;
  texto: string; chave?: string | null; dados?: Record<string, unknown> | null; pedidoPor?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data, error } = await supabaseAdmin.from("cs_envios_cliente").insert({
    tipo: p.tipo, client_id: p.clientId, cliente_nome: p.clienteNome,
    grupo_cliente: p.grupoCliente, grupo_interno: p.grupoInterno,
    texto: p.texto, chave: p.chave ?? null, dados: p.dados ?? null, pedido_por: p.pedidoPor ?? null,
    status: "aguardando",
  }).select("id").single();
  if (error || !data) {
    console.error("[CS/envio-cliente] guardar prévia:", error?.message);
    return { ok: false, erro: error?.message ?? "o banco não devolveu a prévia" };
  }
  const id = data.id as string;
  const r = await csSendGroupText(p.grupoInterno, textoPrevia(p.tipo, p.clienteNome, p.texto), undefined,
    { origem: "envio-cliente-previa", destino: "interno", clientId: p.clientId });
  if (!r.ok) {
    await supabaseAdmin.from("cs_envios_cliente").update({ status: "falhou", erro: `a prévia não saiu: ${r.error ?? "?"}` }).eq("id", id);
    return { ok: false, erro: r.error ?? "a prévia não saiu" };
  }
  if (r.id) await supabaseAdmin.from("cs_envios_cliente").update({ msg_id_previa: r.id }).eq("id", id);
  return { ok: true, id };
}

/**
 * A prévia que a mensagem cita: pelo id (o normal) ou pelo texto citado (quando o id de envio não
 * bate com o do reply). Devolve também prévia já decidida — o chamador avisa em vez de calar.
 */
export async function acharEnvioCitado(
  grupoInterno: string, citadaId?: string | null, citadoTexto?: string | null,
): Promise<EnvioCliente | null> {
  if (citadaId) {
    const { data } = await supabaseAdmin.from("cs_envios_cliente").select("*")
      .eq("msg_id_previa", citadaId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) return data as EnvioCliente;
  }
  if (!citadoTexto) return null;
  const desde = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: recentes } = await supabaseAdmin.from("cs_envios_cliente").select("*")
    .eq("grupo_interno", grupoInterno).gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(20);
  return previaPeloTexto((recentes ?? []) as EnvioCliente[], citadoTexto);
}

export type ResultadoEnvio =
  | { tipo: "enviado" }
  | { tipo: "falhou"; erro: string }
  | { tipo: "incerto"; erro: string }
  | { tipo: "vencida" | "ja_decidida" | "ja_enviado_hoje" | "checkin_aberto" }
  | { tipo: "nao_conferiu"; erro: string };

/**
 * O "ok" da prévia: confere de novo, trava contra o duplo "ok", manda e CONFERE o envio.
 * Só diz "enviado" quando o WhatsApp confirmou.
 */
export async function executarEnvioAoCliente(e: EnvioCliente, quem: string, agora = new Date()): Promise<ResultadoEnvio> {
  if (e.status !== "aguardando") return { tipo: "ja_decidida" };
  if (previaVencida(e.created_at, agora)) {
    await supabaseAdmin.from("cs_envios_cliente").update({ status: "expirado" }).eq("id", e.id).eq("status", "aguardando");
    return { tipo: "vencida" };
  }
  if (e.tipo === "checkin" && await temCheckinAguardando(e.client_id, "cliente")) return { tipo: "checkin_aberto" };

  // Trava: só um "ok" passa daqui (retry do webhook, duas pessoas respondendo juntas).
  const { data: travou, error: errTrava } = await supabaseAdmin.from("cs_envios_cliente")
    .update({ status: "enviando", decidido_por: quem, decidido_em: agora.toISOString() })
    .eq("id", e.id).eq("status", "aguardando").select("id");
  if (errTrava) return { tipo: "nao_conferiu", erro: errTrava.message };
  if (!travou?.length) return { tipo: "ja_decidida" };
  const voltarAguardando = (erro: string) => supabaseAdmin.from("cs_envios_cliente")
    .update({ status: "aguardando", erro: erro.slice(0, 500) }).eq("id", e.id);

  // A chave da cobrança é UNIQUE em cs_cobrancas: reservar ANTES de mandar é o que impede a
  // segunda cobrança do dia (antes ela era gravada sem esperar e nunca lida).
  let reservaId: string | null = null;
  if (e.tipo === "cobranca_pendencias" && e.chave) {
    const { data: reserva, error } = await supabaseAdmin.from("cs_cobrancas").insert({
      vigilancia: 0, client_id: e.client_id, card_id: null, pessoa_cobrada: e.cliente_nome,
      chave: e.chave, mensagem: e.texto.slice(0, 1000), dry_run: false,
    }).select("id").single();
    if (error?.code === "23505") {
      await supabaseAdmin.from("cs_envios_cliente").update({ status: "cancelado", erro: "já cobrado hoje" }).eq("id", e.id);
      return { tipo: "ja_enviado_hoje" };
    }
    if (error || !reserva) {
      await voltarAguardando(`não consegui conferir se já cobrei hoje: ${error?.message ?? "?"}`);
      return { tipo: "nao_conferiu", erro: error?.message ?? "sem retorno do banco" };
    }
    reservaId = reserva.id as string;
  }

  const r = await csSendGroupText(e.grupo_cliente, e.texto, undefined, {
    origem: e.tipo === "checkin" ? "cs-checkin-cliente" : "cs-cobranca-pendencias",
    destino: "cliente", clientId: e.client_id,
  });
  const desfecho = desfechoDoEnvio(r);

  if (desfecho === "enviado") {
    await supabaseAdmin.from("cs_envios_cliente")
      .update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", e.id);
    if (e.tipo === "checkin") {
      const pergunta = e.dados?.pergunta as PerguntaCheckin | undefined;
      if (pergunta) await registrarEnvio(e.client_id, "cliente", pergunta, e.grupo_cliente);
    }
    return { tipo: "enviado" };
  }
  const erro = r.error ?? "erro desconhecido";
  if (desfecho === "incerto") {
    // A reserva da cobrança FICA: se a mensagem chegou, uma segunda hoje seria repetida.
    await supabaseAdmin.from("cs_envios_cliente").update({ status: "incerto", erro: erro.slice(0, 500) }).eq("id", e.id);
    return { tipo: "incerto", erro };
  }
  // Falhou de verdade (nada saiu): solta a reserva e volta a aguardar — um novo "ok" tenta de novo.
  if (reservaId) await supabaseAdmin.from("cs_cobrancas").delete().eq("id", reservaId);
  await voltarAguardando(erro);
  return { tipo: "falhou", erro };
}

/** O "não" da prévia. false = já tinha sido decidida. */
export async function cancelarEnvioAoCliente(e: EnvioCliente, quem: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("cs_envios_cliente")
    .update({ status: "cancelado", decidido_por: quem, decidido_em: new Date().toISOString() })
    .eq("id", e.id).eq("status", "aguardando").select("id");
  return !!data?.length;
}
