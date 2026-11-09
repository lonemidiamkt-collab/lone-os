// lib/integracoes/catalogo.ts — OS APLICATIVOS QUE O LONE OS USA, e como ler o estado de cada um. Módulo PURO.
//
// Roberto (09/11/2026): "por que essa questão [conectar o Google] tá indo pro Lone Comercial? Isso deveria
// estar no Lone OS… passar pro Lone OS para ter controle lá dessas automações e aplicativos que a gente está
// utilizando no sistema no geral." Daí a tela Sistema › Integrações (app/integracoes): um cartão por
// aplicativo, com o estado CONFERIDO NA HORA, o que depende dele e onde se resolve.
//
// Só entra aplicativo que o código usa de verdade. A tela /integrations de antes tinha 11 cartões e 10
// eram simulados (Leva 4) — cartão bonito com estado inventado é pior que cartão nenhum.
//
// A checagem (rede, banco) é lib/integracoes/verificar-server.ts; aqui fica só a leitura do resultado.

import type { CausaConhecida } from "@/lib/ia/causa-erro";

export type SituacaoIntegracao = "ok" | "atencao" | "erro" | "desligada";

export type IdIntegracao = "google" | "meta" | "whatsapp" | "ia" | "d4sign" | "email" | "pdf" | "academy" | "finance" | "site";

export interface EstadoIntegracao {
  id: IdIntegracao;
  nome: string;
  /** O que no Lone OS para quando ela para. */
  servePara: string;
  situacao: SituacaoIntegracao;
  /** O estado numa frase, com o que fazer quando não está ok. */
  resumo: string;
  detalhes: string[];
  /** Onde se resolve (tela do Lone OS ou site de fora). */
  acao?: { rotulo: string; href: string; externo?: boolean };
  /** "principal": sem ela, parte do trabalho do time para. "apoio": serviço por trás de uma função. */
  grupo: "principal" | "apoio";
}

const ORDEM: Record<SituacaoIntegracao, number> = { erro: 0, atencao: 1, desligada: 2, ok: 3 };

/** A pior das situações (para um cartão com várias partes, como as duas linhas do WhatsApp). */
export function piorSituacao(s: SituacaoIntegracao[]): SituacaoIntegracao {
  return s.reduce<SituacaoIntegracao>((pior, x) => (ORDEM[x] < ORDEM[pior] ? x : pior), "ok");
}

/** Para a lista: o que precisa de alguém primeiro, depois a ordem do catálogo. */
export function ordenar(lista: EstadoIntegracao[]): EstadoIntegracao[] {
  const pos = new Map(CATALOGO.map((c, i) => [c.id, i] as const));
  return [...lista].sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99));
}

export const CATALOGO: readonly { id: IdIntegracao; nome: string; servePara: string; grupo: "principal" | "apoio" }[] = [
  { id: "google", nome: "Google (Agenda e Drive)", grupo: "principal",
    servePara: "Reunião do Comercial com Meet no Google Agenda e a pasta de cada cliente no Drive (Documentos e Fotos e Vídeos)." },
  { id: "meta", nome: "Meta (Facebook e Instagram)", grupo: "principal",
    servePara: "Saldos e alertas de verba, relatório semanal, portal do cliente, Instagram e a aba Anúncios." },
  { id: "whatsapp", nome: "WhatsApp (Evolution)", grupo: "principal",
    servePara: "Relatórios e mensagens nos grupos dos clientes, avisos do time e o Loninho lendo os grupos." },
  { id: "ia", nome: "IA (OpenAI)", grupo: "principal",
    servePara: "Loninho, revisão de arte, transcrição de áudio, legendas, placar da semana e os outros agentes." },
  { id: "d4sign", nome: "D4Sign (assinatura de contrato)", grupo: "principal",
    servePara: "Envio do contrato para assinar e o aviso de quem assinou." },
  { id: "email", nome: "E-mail (Resend)", grupo: "apoio",
    servePara: "Boas-vindas do cliente, acesso à Lone Academy e avisos por e-mail." },
  { id: "pdf", nome: "Gerador de PDF (Browserless)", grupo: "apoio",
    servePara: "Todos os PDFs: relatório semanal e mensal, contratos, diagnóstico de tráfego." },
  { id: "academy", nome: "Lone Academy", grupo: "apoio",
    servePara: "Liberar o treinamento para o time do cliente." },
  { id: "finance", nome: "Lone Finance", grupo: "apoio",
    servePara: "O financeiro lê clientes e contratos do Lone OS (só leitura)." },
  { id: "site", nome: "Site da Lone (leads)", grupo: "apoio",
    servePara: "Formulário de diagnóstico do site entra direto no funil do Comercial." },
];

/** Nome, para que serve e grupo da integração (o que todo cartão tem). */
export function base(id: IdIntegracao): Pick<EstadoIntegracao, "id" | "nome" | "servePara" | "grupo"> {
  const c = CATALOGO.find((x) => x.id === id)!;
  return { id: c.id, nome: c.nome, servePara: c.servePara, grupo: c.grupo };
}

const dataCurta = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// ── Google ──────────────────────────────────────────────────────────────────────────────────────────

/** O número do projeto do Google Cloud na mensagem de "API desligada" — para o link ir direto ao botão Ativar. */
export function linkAtivarDriveApi(mensagem: string | null | undefined): string {
  const projeto = (mensagem ?? "").match(/project (\d{6,})/i)?.[1];
  return `https://console.cloud.google.com/apis/library/drive.googleapis.com${projeto ? `?project=${projeto}` : ""}`;
}

export function estadoGoogleIntegracao(p: {
  configurado: boolean;
  conectado: boolean;
  email: string | null;
  drive: boolean | null;
  /** Teste do Drive (null = não testado: sem conexão ou sem a permissão). */
  driveApi: { ok: boolean; status?: number | null; motivo?: string | null; mensagem?: string | null } | null;
}): EstadoIntegracao {
  const b = base("google");
  const conta = p.email ? ` (${p.email})` : "";
  if (!p.configurado) {
    return { ...b, situacao: "desligada", detalhes: [], resumo: "Falta a credencial do app do Google (Client ID e segredo). Cole abaixo e conecte." };
  }
  if (!p.conectado) {
    return { ...b, situacao: "erro", detalhes: [], resumo: "Desconectado: a reunião do Comercial fica sem Meet e a pasta do cliente não é criada. Clique em Conectar Google." };
  }
  if (p.drive === false) {
    return { ...b, situacao: "atencao", detalhes: [`Conta${conta}`], resumo: "Agenda funcionando, mas o Drive não foi liberado. Clique em Reconectar Google e aceite o Drive." };
  }
  const api = p.driveApi;
  if (api && !api.ok) {
    const txt = `${api.motivo ?? ""} ${api.mensagem ?? ""}`;
    if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project|it is disabled/i.test(txt)) {
      return {
        ...b, situacao: "atencao", detalhes: [`Conta${conta}`],
        resumo: "Agenda funcionando. A Google Drive API está desligada no projeto do Google Cloud: clique em Ativar (uma vez só).",
        acao: { rotulo: "Ativar a Google Drive API", href: linkAtivarDriveApi(api.mensagem), externo: true },
      };
    }
    if (/insufficient|ACCESS_TOKEN_SCOPE/i.test(txt)) {
      return { ...b, situacao: "atencao", detalhes: [`Conta${conta}`], resumo: "Agenda funcionando, mas o Drive não foi liberado. Clique em Reconectar Google e aceite o Drive." };
    }
    return { ...b, situacao: "erro", detalhes: [`Conta${conta}`], resumo: `O Drive não respondeu: ${(api.mensagem || api.motivo || "erro desconhecido").slice(0, 160)}` };
  }
  return { ...b, situacao: "ok", detalhes: [], resumo: `Agenda e Drive funcionando${conta}.` };
}

// ── Meta ────────────────────────────────────────────────────────────────────────────────────────────

/** Faltando isto ou menos para vencer, o cartão já pede atenção. */
export const DIAS_AVISO_META = 15;

export function estadoMetaIntegracao(p: { estado: "ok" | "expirada" | "ausente"; expiraEm: number | null; agora: number }): EstadoIntegracao {
  const b = { ...base("meta"), acao: { rotulo: "Abrir Conexão Meta", href: "/conexao-meta" } };
  if (p.estado === "ausente") return { ...b, situacao: "erro", detalhes: [], resumo: "Sem token: saldos, alertas de verba, relatórios e portal param. Conecte em Conexão Meta." };
  if (p.estado === "expirada") return { ...b, situacao: "erro", detalhes: [], resumo: "Token vencido: saldos, alertas, relatórios e portal pararam. Reconecte em Conexão Meta." };
  if (p.expiraEm) {
    const dias = Math.ceil((p.expiraEm - p.agora) / 86_400_000);
    if (dias <= DIAS_AVISO_META) {
      return { ...b, situacao: "atencao", detalhes: [], resumo: `Funcionando, mas o token vence em ${dias} dia${dias === 1 ? "" : "s"} (${dataCurta(p.expiraEm)}). Reconecte antes para não parar.` };
    }
    return { ...b, situacao: "ok", detalhes: [], resumo: `Funcionando. O token vence em ${dataCurta(p.expiraEm)} (${dias} dias).` };
  }
  return { ...b, situacao: "ok", detalhes: [], resumo: "Funcionando." };
}

// ── WhatsApp ────────────────────────────────────────────────────────────────────────────────────────

export interface LinhaWhatsapp {
  rotulo: string;
  configurada: boolean;
  /** Estado da Evolution ("open", "close", "connecting"…); null = não deu para perguntar. */
  estado: string | null;
  erro?: string | null;
  /** Última mensagem que chegou dos grupos (só a linha do Loninho lê). */
  ultimaRecebida?: string | null;
}

/** "open" sem receber nada há mais que isto = conexão zumbi (12/07/2026: dizia aberta e não recebia). */
export const HORAS_SEM_RECEBER = 12;

export function estadoWhatsappIntegracao(linhas: LinhaWhatsapp[], agora: number): EstadoIntegracao {
  const b = { ...base("whatsapp"), acao: { rotulo: "Abrir o Manager da Evolution", href: "https://evo.lonemidia.com/manager/", externo: true } };
  const partes = linhas.map((l): { s: SituacaoIntegracao; frase: string } => {
    if (!l.configurada) return { s: "desligada", frase: `${l.rotulo}: não configurada no servidor.` };
    if (l.erro) return { s: "erro", frase: `${l.rotulo}: não consegui falar com a Evolution (${l.erro}).` };
    if (l.estado !== "open") return { s: "erro", frase: `${l.rotulo}: desconectada (${l.estado ?? "sem estado"}) — reconectar pelo QR no Manager.` };
    if (l.ultimaRecebida !== undefined) {
      const horas = l.ultimaRecebida ? (agora - new Date(l.ultimaRecebida).getTime()) / 3_600_000 : Infinity;
      if (horas > HORAS_SEM_RECEBER) {
        return { s: "atencao", frase: `${l.rotulo}: diz conectada, mas não recebe mensagem ${l.ultimaRecebida ? `desde ${dataHora(l.ultimaRecebida)}` : "há dias"} — pode ser conexão travada (reiniciar a Evolution).` };
      }
      return { s: "ok", frase: `${l.rotulo}: conectada, recebendo (última mensagem ${dataHora(l.ultimaRecebida as string)}).` };
    }
    return { s: "ok", frase: `${l.rotulo}: conectada.` };
  });
  const situacao = piorSituacao(partes.map((p) => p.s));
  const ruins = partes.filter((p) => p.s !== "ok");
  return {
    ...b, situacao, detalhes: partes.map((p) => p.frase),
    resumo: situacao === "ok" ? "As duas linhas conectadas." : ruins.map((p) => p.frase).join(" "),
  };
}

// ── IA ──────────────────────────────────────────────────────────────────────────────────────────────

export function estadoIaIntegracao(p: {
  configurada: boolean;
  ultimoOk: string | null;
  fora: { causa: CausaConhecida; desde: string; falhas: number } | null;
}): EstadoIntegracao {
  const b = { ...base("ia"), acao: { rotulo: "Abrir Central de Agentes", href: "/agentes" } };
  if (!p.configurada) return { ...b, situacao: "desligada", detalhes: [], resumo: "Sem a chave da OpenAI no servidor: os agentes estão parados." };
  if (p.fora) {
    return {
      ...b, situacao: "erro", detalhes: [p.fora.causa.explicacao],
      resumo: `${p.fora.causa.titulo} desde ${dataHora(p.fora.desde)} (${p.fora.falhas} chamadas falharam). ${p.fora.causa.acao}`,
    };
  }
  if (!p.ultimoOk) return { ...b, situacao: "atencao", detalhes: [], resumo: "Nenhuma chamada de IA deu certo nos últimos 7 dias. Veja a Central de Agentes." };
  return { ...b, situacao: "ok", detalhes: [], resumo: `Respondendo (última chamada certa ${dataHora(p.ultimoOk)}).` };
}

// ── D4Sign ──────────────────────────────────────────────────────────────────────────────────────────

export function estadoD4signIntegracao(p: {
  erro?: string | null;
  ligada: boolean;
  testeOk: boolean | null;
  testeResultado: string | null;
  segredoErrado: boolean;
  cofres: number;
  cofresComAviso: number;
}): EstadoIntegracao {
  const b = { ...base("d4sign"), acao: { rotulo: "Abrir em Configurações", href: "/settings" } };
  if (p.erro) return { ...b, situacao: "erro", detalhes: [], resumo: `Não consegui ler a configuração: ${p.erro}` };
  if (!p.ligada) return { ...b, situacao: "desligada", detalhes: [], resumo: "Não configurada: o contrato vai para assinar à mão e ninguém é avisado sozinho." };
  if (p.testeOk === false) return { ...b, situacao: "erro", detalhes: [], resumo: `O último teste falhou: ${(p.testeResultado ?? "sem detalhe").slice(0, 160)}` };
  if (p.segredoErrado) return { ...b, situacao: "atencao", detalhes: [], resumo: "O aviso de assinatura chega com o segredo errado (o Lone OS confere na D4Sign mesmo assim). Cole o segredo de novo." };
  const detalhes = [`${p.cofres} cofre${p.cofres === 1 ? "" : "s"} · aviso de assinatura ligado em ${p.cofresComAviso}`];
  if (p.cofres > 0 && p.cofresComAviso < p.cofres) {
    return { ...b, situacao: "atencao", detalhes, resumo: "Ligada, mas o aviso de assinatura não está ligado em todos os cofres: ligue em Configurações." };
  }
  return { ...b, situacao: "ok", detalhes, resumo: "Ligada: envio para assinatura e aviso de quem assinou." };
}

// ── Serviços de apoio (configurado + responde) ──────────────────────────────────────────────────────

export function estadoServicoIntegracao(id: Exclude<IdIntegracao, "google" | "meta" | "whatsapp" | "ia" | "d4sign">, p: {
  configurado: boolean;
  semConfig: string;
  /** Teste de alcance (null = esta integração não tem como testar daqui: quem chama é o outro lado). */
  alcance: { ok: boolean; erro?: string | null } | null;
  okTexto: string;
  detalhes?: string[];
}): EstadoIntegracao {
  const b = base(id);
  if (!p.configurado) return { ...b, situacao: "desligada", detalhes: p.detalhes ?? [], resumo: p.semConfig };
  if (p.alcance && !p.alcance.ok) return { ...b, situacao: "erro", detalhes: p.detalhes ?? [], resumo: `Configurado, mas não respondeu: ${p.alcance.erro ?? "sem resposta"}.` };
  return { ...b, situacao: "ok", detalhes: p.detalhes ?? [], resumo: p.okTexto };
}
