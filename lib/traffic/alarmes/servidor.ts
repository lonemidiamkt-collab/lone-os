// lib/traffic/alarmes/servidor.ts — a rodada dos dois alarmes de tráfego (regras em ./sem-conversa e ./ritmo-verba).
//
// Chamado de 2 em 2 h pelo /api/system/alarmes-trafego, 5 min depois da leitura de saldo. Uma leitura da Meta por
// campanha e por dia (./coleta) alimenta os dois alarmes. Para cada conta de cliente ativo, com tráfego contratado,
// não pausado e não oculto:
//   • "gastou sem conversa" — episódio novo, lembrete do dia ou fechamento (2 conversas);
//   • verba do mês acabando em até 3 dias ou já acabada — uma vez por mês por nível.
// O que sai: UMA mensagem por alarme no grupo de tráfego (interno), marcando o gestor de cada conta, e a voz no
// computador de quem cuida (lib/avisos, mesmo teto e horário dos outros avisos). Nunca fala com cliente.
//
// O evento em avisos_trafego é a RESERVA: só manda o WhatsApp do que conseguiu gravar (único por tipo + conta +
// dia). Sem gravar, não manda — senão a rodada seguinte repetiria. Leitura da Meta que falha nunca vira "zero".

import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { mencionar } from "@/lib/cs/mencao";
import { hojeSP } from "@/lib/clients/pausa";
import { getMetaToken } from "@/lib/traffic/sync-core";
import { registrarLote, type NovoAviso } from "@/lib/avisos/trafego-server";
import { nomeFalado, relogioSP } from "@/lib/avisos/regras";
import { lerCampanhasPorDia } from "./coleta";
import { diasAntes, textoSemConversa, falaSemConversa, DIAS_BASE, type ContaSemConversa } from "./sem-conversa";
import { textoRitmoUrgente, falaRitmoUrgente, fatoRitmo, acaoRitmo, type ContaRitmoUrgente } from "./ritmo-verba";
import { decidirRodada, montarContas, type ContaAlarme, type EventoGravado } from "./rodada";

export type { ContaAlarme } from "./rodada";


export interface ResultadoAlarmes {
  ok: boolean;
  dry: boolean;
  hoje: string;
  hora: string;
  contas: number;
  lidas: number;
  falhasLeitura: string[];
  semConversa: { cliente: string; decisao: string; gastoSemConversa: number; limite: number | null; desde: string | null }[];
  fechados: string[];
  ritmo: { cliente: string; nivel: string; fato: string; acao: string }[];
  ritmoResolvidos: string[];
  enviados: { semConversa: boolean; ritmo: boolean };
  textos: { semConversa: string | null; ritmo: string | null };
  erros: string[];
}

async function carregarContas(agora: Date): Promise<ContaAlarme[]> {
  const [{ data: ajustes }, { data: contas, error: eContas }, { data: clientes, error: eCli }, { data: politicas, error: ePol }] = await Promise.all([
    supabaseAdmin.from("agency_settings").select("value").eq("key", "hidden_ad_accounts").maybeSingle(),
    supabaseAdmin.from("ad_accounts").select("client_id, meta_account_id, account_status, monthly_budget, is_prepaid, last_balance"),
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic, service_type, active, churned_at, paused_at, paused_until, monthly_budget"),
    supabaseAdmin.from("client_traffic_policy").select("client_id, cpl_meta"),
  ]);
  if (eContas || eCli || ePol) throw new Error(`carregar contas: ${(eContas ?? eCli ?? ePol)!.message}`);
  return montarContas({ contas: contas ?? [], clientes: clientes ?? [], politicas: politicas ?? [], ocultasJson: (ajustes?.value as string) ?? null, agora });
}

export async function rodarAlarmes(opts: { dry: boolean; agora?: Date }): Promise<ResultadoAlarmes> {
  const agora = opts.agora ?? new Date();
  const hoje = hojeSP(agora);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(agora);
  const horaSP = relogioSP(agora).hora;
  const r: ResultadoAlarmes = {
    ok: true, dry: opts.dry, hoje, hora, contas: 0, lidas: 0, falhasLeitura: [], semConversa: [], fechados: [],
    ritmo: [], ritmoResolvidos: [], enviados: { semConversa: false, ritmo: false }, textos: { semConversa: null, ritmo: null }, erros: [],
  };

  const token = await getMetaToken();
  if (!token) return { ...r, ok: false, erros: ["Token da Meta ausente ou vencido"] };
  const contas = await carregarContas(agora);
  r.contas = contas.length;
  if (!contas.length) return r;

  const primeiroDoMes = `${hoje.slice(0, 8)}01`;
  const inicioJanela = diasAntes(hoje, DIAS_BASE)[0];
  const desde = primeiroDoMes < inicioJanela ? primeiroDoMes : inicioJanela;
  const leitura = await lerCampanhasPorDia(token, contas.map((c) => c.metaAccountId), desde, hoje);

  const ids = contas.map((c) => c.metaAccountId);
  const [{ data: abertos, error: eAb }, { data: doMes, error: eMes }] = await Promise.all([
    supabaseAdmin.from("avisos_trafego").select("id, meta_account_id, dia")
      .eq("tipo", "sem_conversa").is("resolvido_em", null).gte("dia", inicioJanela).in("meta_account_id", ids),
    supabaseAdmin.from("avisos_trafego").select("id, meta_account_id, tipo, resolvido_em")
      .in("tipo", ["verba_estourando", "verba_estourou"]).gte("dia", primeiroDoMes).in("meta_account_id", ids),
  ]);
  // Sem saber o que já foi avisado, não avisa (repetir de 2 em 2 h é pior que atrasar uma rodada).
  if (eAb || eMes) return { ...r, ok: false, erros: [`avisos_trafego: ${(eAb ?? eMes)!.message}`] };
  const { lidas, falhasLeitura, semConversa, fechar, ritmoAvisar, ritmoResolver } = decidirRodada({
    contas, leitura, hoje, horaSP,
    semConversaAbertos: ((abertos ?? []) as { id: string; meta_account_id: string }[]).map((e) => ({ ...e, tipo: "sem_conversa" })),
    verbaDoMes: (doMes ?? []) as EventoGravado[],
  });
  r.lidas = lidas;
  r.falhasLeitura = falhasLeitura;

  r.semConversa = semConversa.map((s) => ({ cliente: s.conta.nome, decisao: s.decisao, gastoSemConversa: s.leitura.gastoSemConversa, limite: s.leitura.limite, desde: s.leitura.desde }));
  r.fechados = fechar.map((f) => f.conta.nome);
  r.ritmo = ritmoAvisar.map((x) => ({ cliente: x.conta.nome, nivel: x.leitura.nivel, fato: fatoRitmo(x.leitura), acao: acaoRitmo(x.leitura, x.conta.saldo) }));
  r.ritmoResolvidos = ritmoResolver.map((x) => x.conta.nome);
  if (r.falhasLeitura.length && r.lidas === 0) { r.ok = false; r.erros.push("nenhuma conta lida na Meta"); }

  const mencao = new Map<string, Awaited<ReturnType<typeof mencionar>>>();
  for (const g of new Set([...semConversa.map((s) => s.conta.gestor), ...ritmoAvisar.map((x) => x.conta.gestor)])) {
    mencao.set(g ?? "", await mencionar(g).catch(() => ({ trecho: g ? g.split(/\s+/)[0] : "", jids: [], notifica: false })));
  }
  const trecho = (g: string | null) => mencao.get(g ?? "")?.trecho ?? "";
  const jidsDe = (gs: (string | null)[]) => [...new Set(gs.flatMap((g) => mencao.get(g ?? "")?.jids ?? []))];

  const listaSem = (lista: typeof semConversa): ContaSemConversa[] => lista.map((s) => ({ nome: s.conta.nome, leitura: s.leitura, decisao: s.decisao, hoje, gestorTrecho: trecho(s.conta.gestor) }));
  const listaRitmo = (lista: typeof ritmoAvisar): ContaRitmoUrgente[] => lista.map((x) => ({ nome: x.conta.nome, leitura: x.leitura, saldo: x.conta.saldo, gestorTrecho: trecho(x.conta.gestor) }));
  r.textos.semConversa = semConversa.length ? textoSemConversa(listaSem(semConversa), hora) : null;
  r.textos.ritmo = ritmoAvisar.length ? textoRitmoUrgente(listaRitmo(ritmoAvisar), hora) : null;
  if (opts.dry) return r;

  // ── Fechamentos (a medição: quanto tempo do aviso até voltar a conversa / a verba entrar no ritmo)
  const agoraIso = agora.toISOString();
  const idsFechar = [...fechar.flatMap((f) => f.ids), ...ritmoResolver.flatMap((x) => x.ids)];
  if (idsFechar.length) {
    const { error } = await supabaseAdmin.from("avisos_trafego").update({ resolvido_em: agoraIso }).in("id", idsFechar);
    if (error) r.erros.push(`fechar: ${error.message}`);
  }

  // ── Registro (reserva) + voz, depois o WhatsApp só do que foi gravado agora
  const avisosSem: NovoAviso[] = semConversa.map((s) => ({
    tipo: "sem_conversa", clientId: s.conta.clientId, metaAccountId: s.conta.metaAccountId, nome: nomeFalado(s.conta.nome), gestor: s.conta.gestor,
    ...falaSemConversa(nomeFalado(s.conta.nome), { leitura: s.leitura, hoje }),
    detalhe: { decisao: s.decisao, gasto_sem_conversa: s.leitura.gastoSemConversa, limite: s.leitura.limite, cpl_ref: s.leitura.cplRef, desde: s.leitura.desde, esperadas: s.leitura.esperadas },
  }));
  const avisosRitmo: NovoAviso[] = ritmoAvisar.map((x) => ({
    tipo: x.tipo, clientId: x.conta.clientId, metaAccountId: x.conta.metaAccountId, nome: nomeFalado(x.conta.nome), gestor: x.conta.gestor,
    ...falaRitmoUrgente(nomeFalado(x.conta.nome), x.leitura),
    detalhe: { nivel: x.leitura.nivel, verba: x.leitura.verba, gasto: x.leitura.gasto, diaria_necessaria: x.leitura.diariaNecessaria, ritmo_rodando: x.leitura.ritmoRodando, dia_estouro: x.leitura.diaEstouro },
  }));

  const jid = process.env.CS_TRAFFIC_GROUP_JID || "";
  if ((avisosSem.length || avisosRitmo.length) && !jid) {
    return { ...r, ok: false, erros: [...r.erros, "CS_TRAFFIC_GROUP_JID não configurado: nada foi gravado nem enviado"] };
  }

  const enviar = async (avisos: NovoAviso[], montar: (gravadas: Set<string>) => { texto: string | null; gestores: (string | null)[] }, origem: string) => {
    if (!avisos.length) return false;
    const lote = await registrarLote(avisos, agora);
    r.erros.push(...lote.erros);
    const gravadas = new Set(lote.inseridos.map((i) => i.metaAccountId));
    const { texto, gestores } = montar(gravadas);
    if (!texto) return false;
    const env = await csSendGroupText(jid, texto, undefined, { origem, destino: "interno" }, jidsDe(gestores));
    if (!env.ok) r.erros.push(`${origem}: ${env.error ?? "envio falhou"}${env.incerto ? " (pode ter saído)" : ""}`);
    return env.ok;
  };

  r.enviados.semConversa = await enviar(avisosSem, (gravadas) => {
    const lista = semConversa.filter((s) => gravadas.has(s.conta.metaAccountId));
    return { texto: lista.length ? textoSemConversa(listaSem(lista), hora) : null, gestores: lista.map((s) => s.conta.gestor) };
  }, "alarme-sem-conversa");
  r.enviados.ritmo = await enviar(avisosRitmo, (gravadas) => {
    const lista = ritmoAvisar.filter((x) => gravadas.has(x.conta.metaAccountId));
    return { texto: lista.length ? textoRitmoUrgente(listaRitmo(lista), hora) : null, gestores: lista.map((x) => x.conta.gestor) };
  }, "alarme-ritmo-verba");

  if (r.erros.length) r.ok = false;
  return r;
}
