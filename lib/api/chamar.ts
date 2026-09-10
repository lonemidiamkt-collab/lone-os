// lib/api/chamar.ts — UMA chamada de API que nunca surpreende quem clicou.
//
// Auditoria de 10/09/2026: 22 pontos do painel gravam dentro de `try { ... } finally { ... }` SEM
// catch. O caminho feliz está certo em todos; o problema é o resto:
//
//  1. `authedFetch` rejeita quando a rede cai — a exceção sobe, o `finally` desliga o spinner e a
//     pessoa fica olhando uma tela que não mudou e não explicou nada.
//  2. `r.json()` rejeita quando o corpo NÃO é JSON. Acontece de verdade: durante um deploy o nginx
//     devolve HTML de 502, e `await r.json()` estoura antes de qualquer checagem de `r.ok`.
//
// Os dois viram "cliquei e não aconteceu nada" — o padrão que mais gerou bug neste projeto. Em vez
// de 22 catches escritos à mão (22 chances de esquecer um), a regra mora aqui.
//
// Nunca lança. Quem chama decide o que mostrar.

import { authedFetch } from "@/lib/supabase/authed-fetch";

export interface Resposta<T = unknown> {
  ok: boolean;
  /** Corpo já convertido. Só vem quando `ok` e o corpo era JSON válido. */
  data: T | null;
  /** Frase pronta pra mostrar. `null` quando deu certo. */
  erro: string | null;
  /** Código HTTP; 0 quando a requisição nem saiu. */
  status: number;
}

/** Mensagem que ajuda quem está olhando a tela, não quem está olhando o log. */
function frase(status: number, doServidor?: string): string {
  if (doServidor) return doServidor;
  if (status === 0) return "Sem conexão com o servidor. Tenta de novo?";
  if (status === 401 || status === 403) return "Sua sessão expirou. Faça login de novo.";
  if (status === 404) return "Não encontrei esse item — ele pode ter sido removido.";
  if (status === 413) return "Arquivo grande demais.";
  if (status === 502 || status === 503 || status === 504) return "O painel está reiniciando. Tenta em alguns segundos.";
  return `Não consegui completar (erro ${status}).`;
}

/**
 * Chama uma rota do painel e devolve o resultado já tratado.
 *
 * ```ts
 * const r = await chamar("/api/reunioes/gerenciar", { acao: "concluir", reuniaoId: id });
 * if (!r.ok) { setErro(r.erro); return; }
 * ```
 */
export async function chamar<T = unknown>(
  url: string,
  corpo?: unknown,
  init?: Omit<RequestInit, "body">,
): Promise<Resposta<T>> {
  const temCorpo = corpo !== undefined;
  const ehFormData = typeof FormData !== "undefined" && corpo instanceof FormData;

  // `init` entra primeiro para que method/headers calculados aqui tenham a palavra final sobre o
  // Content-Type — trocar a ordem faria um init sem headers apagar o JSON que acabamos de montar.
  const opcoes: RequestInit = { ...init };
  opcoes.method = init?.method ?? (temCorpo ? "POST" : "GET");
  if (temCorpo) {
    opcoes.body = ehFormData ? (corpo as FormData) : JSON.stringify(corpo);
    // FormData define o próprio Content-Type (com o boundary) — forçar JSON quebra o upload.
    if (!ehFormData) {
      opcoes.headers = { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) };
    }
  }

  let res: Response;
  try {
    res = await authedFetch(url, opcoes);
  } catch {
    return { ok: false, data: null, erro: frase(0), status: 0 };
  }

  // TEXTO ANTES DE JSON: um corpo de HTML (502 do nginx) faria `res.json()` estourar aqui dentro,
  // e o erro chegaria como "Unexpected token <" em vez de "o painel está reiniciando".
  const texto = await res.text().catch(() => "");
  let corpoJson: unknown = null;
  if (texto) {
    try { corpoJson = JSON.parse(texto); } catch { corpoJson = null; }
  }

  if (!res.ok) {
    const doServidor = corpoJson && typeof corpoJson === "object" && "error" in corpoJson
      ? String((corpoJson as { error: unknown }).error)
      : undefined;
    return { ok: false, data: null, erro: frase(res.status, doServidor), status: res.status };
  }

  return { ok: true, data: corpoJson as T, erro: null, status: res.status };
}
