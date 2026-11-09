// lib/drive/pasta-cliente.ts — A PASTA DO CLIENTE NO GOOGLE DRIVE DA LONE. Módulo PURO (sem rede, sem banco).
//
// Roberto (09/11/2026): "quando ele fizesse todo esse cadastro, já criasse a pasta dele dentro do Drive…
// documento, pasta de fotos e vídeos… e no cadastro dele já ficassem esses links separadinhos, um só para
// documentos, um só para vídeo e fotos, que é o que o social media teria acesso."
//
//   Drive da Lone › Clientes Lone Mídia › <Cliente>        ← admins da equipe veem tudo (a de cima é deles)
//      📁 Documentos       contrato social, identidade, logo — copiados do que o cliente mandou no cadastro
//      📁 Fotos e Vídeos   social e designer DO cliente editam; vira o "Drive" que o pedido de arte já mostra
//
// SENHA NÃO VAI PARA O DRIVE (decisão de 09/11/2026). Um documento de senhas no Drive é texto aberto para
// quem tem a pasta e continua lá quando alguém sai da equipe; no cofre do Lone OS a senha é cifrada,
// revelada por papel e cada abertura fica registrada.
//
// Aqui fica só o que dá para testar sem o Google: nomes, links, quais arquivos deveriam estar na pasta,
// quem deveria ter acesso e a frase de cada erro. A conversa com o Google é lib/drive/google-drive.ts;
// trava, banco e aviso no grupo, lib/drive/sincronizar-pasta.ts. Testes: tests/drive-pasta-cliente.test.ts.

import { createHash } from "node:crypto";
import { listaDocs } from "@/lib/onboarding/docs";
import { linkAtivarDriveApi } from "@/lib/integracoes/catalogo";

export const NOME_RAIZ = "Clientes Lone Mídia";
export const SUBPASTA = { documentos: "Documentos", fotos: "Fotos e Vídeos" } as const;
export type PapelSubpasta = keyof typeof SUBPASTA;

/**
 * appProperties: o "crachá" que o Lone OS põe em tudo que cria no Drive. É por ele que acha a pasta de
 * novo (id perdido, pasta renomeada à mão) sem criar outra, e é por ele que sabe quais arquivos da pasta
 * Documentos foram postos pelo sistema — arquivo que alguém pôs à mão nunca é tocado.
 */
export const PROP = { raiz: "loneRaiz", cliente: "loneClienteId", papel: "lonePapel", arquivo: "loneArquivo" } as const;

export const MIME_PASTA = "application/vnd.google-apps.folder";

export function linkDaPasta(id: string | null | undefined): string | null {
  return id ? `https://drive.google.com/drive/folders/${id}` : null;
}

/** Nome da pasta do cliente: o nome fantasia (o que o time fala), sem espaço sobrando. */
export function nomeDaPasta(c: { name?: string | null; nome_fantasia?: string | null }): string {
  const nome = (c.nome_fantasia || c.name || "").replace(/\s+/g, " ").trim();
  return (nome || "Cliente sem nome").slice(0, 120);
}

// ── Documentos ──────────────────────────────────────────────────────────────────────────────────────

/** Os campos de documento do cadastro, na ordem em que aparecem na pasta. */
export const CAMPOS_DOC = [
  { campo: "doc_contrato_social", rotulo: "Contrato social" },
  { campo: "doc_identidade", rotulo: "Documento de identidade" },
  { campo: "doc_logo", rotulo: "Logo" },
] as const;
export type CampoDoc = (typeof CAMPOS_DOC)[number]["campo"];

export interface ArquivoDoCadastro {
  /** A referência guardada na ficha (legal://…, ou a URL pública do logo). */
  ref: string;
  campo: CampoDoc;
  /** Nome que o arquivo ganha no Drive: "Contrato social 2.pdf". */
  nome: string;
  /** Identidade do arquivo (hash da ref): é o que diz "este já está na pasta". */
  chave: string;
}

/** Extensão do arquivo pela referência ("jpg", "pdf"…); "" quando não dá para saber. */
export function extensaoDe(ref: string): string {
  const semQuery = ref.split(/[?#]/)[0];
  const arquivo = semQuery.split("/").pop() || "";
  const m = arquivo.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

export function chaveDoArquivo(ref: string): string {
  return createHash("sha1").update(ref.trim()).digest("hex");
}

const MIME_POR_EXT: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", heif: "image/heif", svg: "image/svg+xml",
};
export function mimePorExtensao(ext: string): string {
  return MIME_POR_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

/** O que deveria estar na pasta Documentos, pelo que está na ficha agora. */
export function arquivosDoCadastro(c: Partial<Record<CampoDoc, string | null>>): ArquivoDoCadastro[] {
  const out: ArquivoDoCadastro[] = [];
  const vistos = new Set<string>();
  for (const { campo, rotulo } of CAMPOS_DOC) {
    const refs = listaDocs(c[campo]);
    refs.forEach((ref, i) => {
      const chave = chaveDoArquivo(ref);
      if (vistos.has(chave)) return;
      vistos.add(chave);
      const ext = extensaoDe(ref);
      out.push({ ref, campo, chave, nome: `${rotulo}${refs.length > 1 ? ` ${i + 1}` : ""}${ext ? `.${ext}` : ""}` });
    });
  }
  return out;
}

/**
 * O que fazer na pasta Documentos: mandar o que falta e tirar (para a lixeira do Drive) o que saiu da
 * ficha — o cliente trocou o RG errado, o time removeu a página repetida. Só mexe no que tem a chave do
 * Lone OS; cópia repetida do mesmo arquivo (duas sincronias ao mesmo tempo) também sai.
 */
export function planoDeDocumentos(
  desejados: ArquivoDoCadastro[],
  naPasta: { id: string; chave: string | null }[],
): { enviar: ArquivoDoCadastro[]; remover: string[] } {
  const querem = new Set(desejados.map((d) => d.chave));
  const presentes = new Set<string>();
  const remover: string[] = [];
  for (const f of naPasta) {
    if (!f.chave) continue; // posto à mão: não é do sistema
    if (!querem.has(f.chave) || presentes.has(f.chave)) remover.push(f.id);
    else presentes.add(f.chave);
  }
  return { enviar: desejados.filter((d) => !presentes.has(d.chave)), remover };
}

// ── Quem acessa ─────────────────────────────────────────────────────────────────────────────────────

export interface MembroEquipe {
  name: string;
  email: string | null;
  role: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
}

const normNome = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const normEmail = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const ativo = (m: MembroEquipe) => m.is_active !== false && !m.deleted_at && !!normEmail(m.email);

/**
 * Quem edita Fotos e Vídeos: o social e o designer do cliente (o cadastro guarda o NOME; o e-mail vem da
 * equipe). Nome que não acha ninguém ativo com e-mail volta em `semEmail` — vira aviso, nunca silêncio.
 * A conta dona do Drive fica de fora: dona já tem tudo.
 */
export function acessoDasFotos(
  c: { assigned_social?: string | null; assigned_designer?: string | null },
  equipe: MembroEquipe[],
  dono: string | null,
): { emails: string[]; pessoas: { nome: string; email: string }[]; semEmail: string[] } {
  const pessoas: { nome: string; email: string }[] = [];
  const semEmail: string[] = [];
  for (const nome of [c.assigned_social, c.assigned_designer]) {
    if (!normNome(nome)) continue;
    const m = equipe.find((x) => ativo(x) && normNome(x.name) === normNome(nome));
    if (!m) { semEmail.push((nome as string).trim()); continue; }
    const email = normEmail(m.email);
    if (email === normEmail(dono) || pessoas.some((p) => p.email === email)) continue;
    pessoas.push({ nome: m.name, email });
  }
  return { emails: pessoas.map((p) => p.email), pessoas, semEmail };
}

/** Quem vê a pasta de cima (com Documentos): os admins ativos da equipe, menos a conta dona. */
export function acessoDaRaiz(equipe: MembroEquipe[], dono: string | null): string[] {
  return [...new Set(equipe.filter((m) => ativo(m) && m.role === "admin").map((m) => normEmail(m.email)))]
    .filter((e) => e && e !== normEmail(dono));
}

/**
 * O que mudar nos compartilhamentos de uma pasta. Dá acesso a quem deveria e não tem; tira SÓ quem o
 * próprio Lone OS deu e não deveria mais ter (social trocado). Quem alguém compartilhou à mão fica.
 */
export function planoDeAcessos(
  desejados: string[],
  concedidosAntes: string[],
  atuais: { id: string; email: string | null }[],
): { adicionar: string[]; remover: { id: string; email: string }[] } {
  const d = new Set(desejados.map(normEmail).filter(Boolean));
  const antes = new Set(concedidosAntes.map(normEmail));
  const temAgora = new Set(atuais.map((a) => normEmail(a.email)).filter(Boolean));
  return {
    adicionar: [...d].filter((e) => !temAgora.has(e)),
    remover: atuais
      .filter((a) => a.email && antes.has(normEmail(a.email)) && !d.has(normEmail(a.email)))
      .map((a) => ({ id: a.id, email: normEmail(a.email) })),
  };
}

/**
 * O que fica registrado como "dado pelo Lone OS" depois de aplicar o plano: o que já era nosso e
 * continua lá, mais o que acabamos de dar, menos o que tiramos. Quem já tinha acesso à mão antes de
 * virar social do cliente NÃO entra — senão, ao sair da carteira, o sistema tiraria um acesso que não deu.
 */
export function concedidosDepois(
  concedidosAntes: string[],
  atuais: { email: string | null }[],
  adicionados: string[],
  removidos: string[],
): string[] {
  const agora = new Set([...atuais.map((a) => normEmail(a.email)), ...adicionados.map(normEmail)]);
  const tirados = new Set(removidos.map(normEmail));
  return [...new Set([...concedidosAntes.map(normEmail), ...adicionados.map(normEmail)])]
    .filter((e) => e && agora.has(e) && !tirados.has(e))
    .sort();
}

// ── Erros do Google, em frase de quem resolve ───────────────────────────────────────────────────────

export interface ErroGoogle { status?: number | null; motivo?: string | null; mensagem?: string | null }

/** Onde se conecta o Google da Lone: Sistema › Integrações (saiu do Comercial em 09/11/2026). */
export const ONDE_CONECTAR = "Sistema › Integrações";

export function fraseDoErroDoGoogle(e: ErroGoogle): string {
  const m = `${e.motivo ?? ""} ${e.mensagem ?? ""}`;
  if (/sem_token|não conectado/i.test(m)) return `O Google da Lone não está conectado. Conecte em ${ONDE_CONECTAR}.`;
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions|insufficient authentication scopes|sem_escopo_drive/i.test(m)) {
    return `Falta liberar o Drive no Google da Lone: em ${ONDE_CONECTAR}, clique em "Reconectar Google" e aceite o Drive.`;
  }
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project|it is disabled/i.test(m)) {
    return `A Google Drive API está desligada no projeto do Google Cloud da Lone. Ative (uma vez só) em ${linkAtivarDriveApi(e.mensagem)} e tente de novo.`;
  }
  if (/storageQuotaExceeded/i.test(m)) return "O Drive da Lone está sem espaço. Libere espaço e tente de novo.";
  if (e.status === 429 || /rateLimitExceeded|userRateLimitExceeded/i.test(m)) {
    return "O Google pediu para esperar (muitas chamadas seguidas). Tente de novo em alguns minutos.";
  }
  if (e.status === 401 || /invalid_grant|authError/i.test(m)) return `O acesso ao Google da Lone venceu. Reconecte em ${ONDE_CONECTAR}.`;
  if (/^\s*rede\b/.test(m) || (e.status ?? 0) >= 500) return "O Google Drive não respondeu agora. Tente de novo em alguns minutos.";
  return `O Google Drive recusou: ${(e.mensagem || e.motivo || "erro desconhecido").slice(0, 160)}`;
}

// ── Mensagens do grupo de cadastro ──────────────────────────────────────────────────────────────────

export function mensagemPastaCriada(p: {
  cliente: string;
  fotos: string;
  documentos: string;
  quemEdita: string[];
  documentosCopiados: number;
  avisos: string[];
}): string {
  const linhas = [
    `📁 *Pasta do Drive criada — ${p.cliente}*`,
    `• *Fotos e Vídeos*${p.quemEdita.length ? ` (editam: ${p.quemEdita.join(", ")})` : ""}: ${p.fotos}`,
    `• *Documentos* (só admin)${p.documentosCopiados ? ` — ${p.documentosCopiados} ${p.documentosCopiados === 1 ? "arquivo" : "arquivos"} do cadastro` : ""}: ${p.documentos}`,
    "🔐 Senhas continuam no cofre do Lone OS, não no Drive.",
  ];
  if (p.avisos.length) linhas.push("", ...p.avisos.map((a) => `⚠️ ${a}`));
  return linhas.join("\n");
}

export function mensagemPastaFalhou(p: { cliente: string; motivo: string; linkFicha: string }): string {
  return [
    `⚠️ *Pasta do Drive não criada — ${p.cliente}*`,
    p.motivo,
    `Para tentar de novo: ficha › Marca & Briefing › Pasta do Drive. 👉 ${p.linkFicha}`,
  ].join("\n");
}
