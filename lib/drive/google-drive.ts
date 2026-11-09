// lib/drive/google-drive.ts — a conversa com a API do Google Drive (v3), com o token da conta Google da Lone
// (o mesmo da Agenda do Comercial, lib/prospeccao/google.ts). Só servidor.
//
// Escopo `drive.file`: o Lone OS só enxerga o que ELE criou no Drive — nunca o Drive inteiro da Lone.
// Tudo aqui devolve { ok, data } ou { ok:false, status, motivo, mensagem } e NUNCA lança: quem chama
// transforma em frase (lib/drive/pasta-cliente.ts → fraseDoErroDoGoogle).

import { accessToken } from "@/lib/prospeccao/google";
import { MIME_PASTA } from "./pasta-cliente";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const CAMPOS = "id,name,mimeType,trashed,parents,appProperties";

export interface ArquivoDrive {
  id: string;
  name: string;
  mimeType?: string;
  trashed?: boolean;
  parents?: string[];
  appProperties?: Record<string, string>;
}

export interface RespDrive<T> {
  ok: boolean;
  data?: T;
  status?: number;
  /** `reason` do Google (insufficientPermissions, notFound…), "sem_token" ou "rede". */
  motivo?: string | null;
  mensagem?: string | null;
}

interface CorpoErro {
  error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
}

function lerErro(status: number, j: CorpoErro | null, txt: string): RespDrive<never> {
  const e = j?.error;
  const detalhe = e?.details?.find((d) => d.reason)?.reason;
  const motivo = [e?.errors?.[0]?.reason, detalhe, e?.status].filter(Boolean).join(" ") || null;
  return { ok: false, status, motivo, mensagem: e?.message ?? (txt.slice(0, 200) || null) };
}

async function pedir<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<RespDrive<T>> {
  const tok = await accessToken();
  if (!tok) return { ok: false, motivo: "sem_token", mensagem: "Google não conectado" };
  const { timeoutMs, ...resto } = init;
  try {
    const res = await fetch(url, {
      ...resto,
      headers: {
        Authorization: `Bearer ${tok}`,
        ...(typeof resto.body === "string" ? { "Content-Type": "application/json; charset=UTF-8" } : {}),
        ...(resto.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs ?? 20_000),
    });
    if (res.status === 204) return { ok: true, status: 204 };
    const txt = await res.text().catch(() => "");
    let j: unknown = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) return lerErro(res.status, j as CorpoErro | null, txt);
    return { ok: true, status: res.status, data: j as T };
  } catch (err) {
    return { ok: false, motivo: "rede", mensagem: err instanceof Error ? err.message : "erro de conexão" };
  }
}

/** Valor dentro de uma consulta `q` do Drive (aspas simples e barra escapadas). */
export function literal(v: string): string {
  return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function lerArquivo(id: string): Promise<RespDrive<ArquivoDrive>> {
  return pedir<ArquivoDrive>(`${API}/files/${encodeURIComponent(id)}?fields=${CAMPOS}`);
}

/** Busca (até 5 páginas de 100). Só volta o que o Lone OS criou — é o limite do escopo drive.file. */
export async function procurar(q: string): Promise<RespDrive<ArquivoDrive[]>> {
  const todos: ArquivoDrive[] = [];
  let pagina: string | undefined;
  for (let i = 0; i < 5; i++) {
    const p = new URLSearchParams({ q, fields: `nextPageToken,files(${CAMPOS})`, pageSize: "100", spaces: "drive" });
    if (pagina) p.set("pageToken", pagina);
    const r = await pedir<{ files?: ArquivoDrive[]; nextPageToken?: string }>(`${API}/files?${p.toString()}`);
    if (!r.ok) return { ...r, data: undefined };
    todos.push(...(r.data?.files ?? []));
    pagina = r.data?.nextPageToken;
    if (!pagina) break;
  }
  return { ok: true, data: todos };
}

export function criarPasta(nome: string, pai: string | null, props: Record<string, string>): Promise<RespDrive<ArquivoDrive>> {
  return pedir<ArquivoDrive>(`${API}/files?fields=${CAMPOS}`, {
    method: "POST",
    body: JSON.stringify({ name: nome, mimeType: MIME_PASTA, appProperties: props, ...(pai ? { parents: [pai] } : {}) }),
  });
}

export function renomear(id: string, nome: string): Promise<RespDrive<ArquivoDrive>> {
  return pedir<ArquivoDrive>(`${API}/files/${encodeURIComponent(id)}?fields=${CAMPOS}`, { method: "PATCH", body: JSON.stringify({ name: nome }) });
}

/** Para a lixeira do Drive (some da pasta, mas dá para recuperar por 30 dias). Nunca apaga de vez. */
export function mandarParaLixeira(id: string): Promise<RespDrive<ArquivoDrive>> {
  return pedir<ArquivoDrive>(`${API}/files/${encodeURIComponent(id)}?fields=id,trashed`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
}

/**
 * Envia um arquivo em duas etapas (upload "resumable"): serve para qualquer tamanho — o "multipart"
 * para em 5 MB, e documento de cadastro escaneado passa disso.
 */
export async function enviarArquivo(p: { pai: string; nome: string; mime: string; corpo: Blob; props: Record<string, string> }): Promise<RespDrive<ArquivoDrive>> {
  const tok = await accessToken();
  if (!tok) return { ok: false, motivo: "sem_token", mensagem: "Google não conectado" };
  try {
    const ini = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=${CAMPOS}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": p.mime,
        "X-Upload-Content-Length": String(p.corpo.size),
      },
      body: JSON.stringify({ name: p.nome, parents: [p.pai], appProperties: p.props }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!ini.ok) {
      const txt = await ini.text().catch(() => "");
      let j: unknown = null;
      try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
      return lerErro(ini.status, j as CorpoErro | null, txt);
    }
    const sessao = ini.headers.get("location");
    if (!sessao) return { ok: false, status: ini.status, motivo: "sem_sessao", mensagem: "o Google não abriu o envio do arquivo" };
    const res = await fetch(sessao, { method: "PUT", headers: { "Content-Type": p.mime }, body: p.corpo, signal: AbortSignal.timeout(120_000) });
    const txt = await res.text().catch(() => "");
    let j: unknown = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) return lerErro(res.status, j as CorpoErro | null, txt);
    return { ok: true, status: res.status, data: j as ArquivoDrive };
  } catch (err) {
    return { ok: false, motivo: "rede", mensagem: err instanceof Error ? err.message : "erro de conexão" };
  }
}

export interface PermissaoDrive { id: string; type?: string; role?: string; emailAddress?: string }

/** Quem tem acesso direto à pasta (pessoas; "qualquer um com o link" e domínio ficam de fora). */
export async function listarPermissoes(id: string): Promise<RespDrive<{ id: string; email: string | null; role: string | null }[]>> {
  const r = await pedir<{ permissions?: PermissaoDrive[] }>(`${API}/files/${encodeURIComponent(id)}/permissions?fields=permissions(id,type,role,emailAddress)`);
  if (!r.ok) return { ...r, data: undefined };
  return {
    ok: true,
    data: (r.data?.permissions ?? [])
      .filter((x) => x.type === "user" && x.role !== "owner")
      .map((x) => ({ id: x.id, email: x.emailAddress?.toLowerCase() ?? null, role: x.role ?? null })),
  };
}

/**
 * Dá acesso por e-mail. `notificar` decide se o Google manda o e-mail "compartilhou uma pasta com você".
 * Sem notificação o Google só aceita conta Google; se recusar por isso, tenta de novo avisando.
 */
export async function compartilhar(id: string, email: string, papel: "writer" | "reader", notificar: boolean): Promise<RespDrive<PermissaoDrive>> {
  const tentar = (avisar: boolean) => pedir<PermissaoDrive>(
    `${API}/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=${avisar ? "true" : "false"}&fields=id,emailAddress,role`,
    { method: "POST", body: JSON.stringify({ type: "user", role: papel, emailAddress: email }) },
  );
  const r = await tentar(notificar);
  if (!r.ok && !notificar && /invalidSharingRequest|notification/i.test(`${r.motivo} ${r.mensagem}`)) return tentar(true);
  return r;
}

export function tirarPermissao(id: string, permissaoId: string): Promise<RespDrive<never>> {
  return pedir<never>(`${API}/files/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissaoId)}`, { method: "DELETE" });
}
