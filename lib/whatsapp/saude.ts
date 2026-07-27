// lib/whatsapp/saude.ts — a conexão está viva DE VERDADE?
//
// Em 27/07/2026 os 38 relatórios de segunda falharam e ninguém percebeu na hora. O motivo:
// `/instance/connectionState` respondia **"open"** para o número do Julio enquanto a conexão real
// com o WhatsApp estava fechada. Qualquer envio voltava "Internal Server Error: Connection Closed".
//
// Ou seja: perguntar o status NÃO serve. É preciso exercitar o socket de verdade.
//
// O que este módulo faz, nesta ordem:
//   1. tenta uma operação REAL (ler um grupo) — se responde, está viva
//   2. se falhar, tenta reconectar sozinho (`/instance/connect`)
//      — foi exatamente isso que ressuscitou o Julio hoje, sem precisar de QR
//   3. testa de novo; só então avisa gente
//
// Rodar ANTES dos disparos (7h50), pra dar tempo de alguém agir antes do relatório das 8h.

const base = () => process.env.EVOLUTION_API_URL?.replace(/\/+$/, "") || "";

export interface Numero {
  /** Como aparece pro time. */
  rotulo: string;
  instancia: string;
  apiKey: string;
  /** Grupo usado como cobaia — só leitura, não manda mensagem. */
  grupoTeste: string;
  /** O que para de funcionar se este número cair. */
  impacto: string;
}

export interface DiagnosticoNumero {
  rotulo: string;
  instancia: string;
  /** O estado que a API DIZ (pode mentir — foi o que aconteceu). */
  estadoDeclarado: string | null;
  /** O socket respondeu a uma operação real? Esta é a resposta que vale. */
  vivo: boolean;
  /** Estava caído e voltou sozinho com o reconnect. */
  reconectado: boolean;
  erro?: string;
}

/** Os dois números da operação. Montado a partir do ambiente pra não espalhar env pelo código. */
export function numerosDaOperacao(): Numero[] {
  const interno = process.env.CS_INTERNAL_GROUP_JID || "";
  const l: Numero[] = [];
  if (process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    l.push({
      rotulo: "Número do gestor (Julio)",
      instancia: process.env.EVOLUTION_INSTANCE,
      apiKey: process.env.EVOLUTION_API_KEY,
      grupoTeste: interno,
      impacto: "relatório de segunda, mensagens de suporte e calendário do mês — tudo que vai pro grupo do CLIENTE",
    });
  }
  if (process.env.EVOLUTION_API_KEY_NEW && process.env.EVOLUTION_INSTANCE_NEW) {
    l.push({
      rotulo: "Número do agente (monitor[IA])",
      instancia: process.env.EVOLUTION_INSTANCE_NEW,
      apiKey: process.env.EVOLUTION_API_KEY_NEW,
      grupoTeste: interno,
      impacto: "bom dia, cobrança de pendência e tudo que o agente fala no grupo da EQUIPE",
    });
  }
  return l;
}

async function estadoDeclarado(n: Numero): Promise<string | null> {
  try {
    const r = await fetch(`${base()}/instance/connectionState/${encodeURIComponent(n.instancia)}`, {
      headers: { apikey: n.apiKey }, signal: AbortSignal.timeout(10_000),
    });
    const j = await r.json().catch(() => ({}));
    return (j?.instance?.state as string) ?? null;
  } catch { return null; }
}

/**
 * O teste que vale: lê UM grupo. Toca o socket do WhatsApp sem mandar mensagem pra ninguém.
 * (Listar todos os grupos também funcionaria, mas leva ~40s e não cabe num check de rotina.)
 */
async function socketResponde(n: Numero): Promise<{ ok: boolean; erro?: string }> {
  if (!n.grupoTeste) return { ok: false, erro: "sem grupo de teste configurado" };
  try {
    const r = await fetch(
      `${base()}/group/findGroupInfos?groupJid=${encodeURIComponent(n.grupoTeste)}`,
      { headers: { apikey: n.apiKey }, signal: AbortSignal.timeout(20_000) },
    );
    const txt = await r.text().catch(() => "");
    if (!r.ok) return { ok: false, erro: `HTTP ${r.status}: ${txt.slice(0, 90)}` };
    // "Connection Closed" volta com 200 em algumas versões — por isso olha o corpo também.
    if (/connection closed|connection lost/i.test(txt)) return { ok: false, erro: "Connection Closed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "erro de conexão" };
  }
}

/** Pede pra instância reconectar. Não desloga nem invalida sessão — no pior caso devolve um QR. */
async function tentarReconectar(n: Numero): Promise<void> {
  try {
    await fetch(`${base()}/instance/connect/${encodeURIComponent(n.instancia)}`, {
      headers: { apikey: n.apiKey }, signal: AbortSignal.timeout(25_000),
    });
  } catch { /* se nem o reconnect responde, o diagnóstico seguinte reporta */ }
}

export async function diagnosticar(n: Numero): Promise<DiagnosticoNumero> {
  const declarado = await estadoDeclarado(n);
  const primeiro = await socketResponde(n);
  if (primeiro.ok) {
    return { rotulo: n.rotulo, instancia: n.instancia, estadoDeclarado: declarado, vivo: true, reconectado: false };
  }

  // Caiu: tenta levantar antes de acordar alguém.
  await tentarReconectar(n);
  await new Promise((r) => setTimeout(r, 4000)); // o socket leva alguns segundos pra subir
  const segundo = await socketResponde(n);

  return {
    rotulo: n.rotulo, instancia: n.instancia, estadoDeclarado: declarado,
    vivo: segundo.ok, reconectado: segundo.ok,
    erro: segundo.ok ? undefined : (segundo.erro || primeiro.erro),
  };
}

/** Mensagem pro grupo interno. Vazio = está tudo de pé, e aí não se manda nada. */
export function textoAlerta(diags: DiagnosticoNumero[]): string {
  const caidos = diags.filter((d) => !d.vivo);
  if (!caidos.length) return "";

  const numeros = numerosDaOperacao();
  const l: string[] = [
    `🔌 *WhatsApp fora do ar* — ${caidos.length} número(s)`,
    "",
  ];
  for (const d of caidos) {
    const impacto = numeros.find((n) => n.instancia === d.instancia)?.impacto;
    l.push(`❌ *${d.rotulo}*`);
    if (impacto) l.push(`   Para de sair: ${impacto}`);
    if (d.erro) l.push(`   _${d.erro}_`);
    // O detalhe que mais confunde: o painel diz "open" e não está.
    if (d.estadoDeclarado === "open") l.push(`   ⚠️ o painel mostra "conectado", mas a conexão real está fechada`);
    l.push("");
  }
  l.push("Reconectar no painel do Evolution (ler o QR no celular do número).");
  l.push("_Tentei religar sozinho e não subiu — precisa de gente._");
  return l.join("\n");
}
