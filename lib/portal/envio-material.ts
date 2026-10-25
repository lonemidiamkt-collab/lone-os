// lib/portal/envio-material.ts — "Enviar material" do portal: um aviso só no grupo por envio, e o
// cliente pode apagar o que mandou errado enquanto o time não abriu.
//
// POR QUE (24/10/2026, auditoria de erro recuperável, item 1.11). O portal enviava ao ESCOLHER os
// arquivos — sem lista, sem como tirar o errado — e cada arquivo virava uma mensagem no grupo do time
// (8 fotos = 8 mensagens). Agora:
//   · o cliente escolhe, vê a lista, remove o que não queria e só então toca em "Enviar";
//   · cada arquivo sobe sozinho (rede fraca de celular), marcado com o LOTE daquele envio, sem aviso;
//   · no fim a página pede UM aviso com todos (rota .../upload/aviso). Se a aba fechar no meio, o
//     servidor avisa sozinho o que chegou, alguns minutos depois do último arquivo (rede de proteção);
//   · arquivo que o time ainda não abriu (visto_em vazio) pode ser apagado pelo cliente.
//
// Puro, menos o registro de lotes em memória (uma instância, como os limites de lib/portal/limite.ts).
// Testado em tests/portal-envio-material.test.ts.

export interface ArquivoDoAviso { nome: string; tamanhoBytes?: number | null }

/** Lote: id que a página gera para um clique em "Enviar". Só letras minúsculas, números e hífen. */
export function loteValido(lote: unknown): lote is string {
  return typeof lote === "string" && /^[a-z0-9-]{8,64}$/.test(lote);
}

function tamanho(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  return bytes >= 1024 * 1024 ? ` (${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB)` : ` (${Math.max(1, Math.round(bytes / 1024))} KB)`;
}

/** A mensagem única para o grupo do time, com todos os arquivos do envio. */
export function mensagemDoLote(a: { cliente: string; enviadoPor?: string | null; observacao?: string | null; arquivos: ArquivoDoAviso[] }): string {
  const n = a.arquivos.length;
  const MAX_LISTA = 15;
  const lista = a.arquivos.slice(0, MAX_LISTA).map((x) => `• ${x.nome}${tamanho(x.tamanhoBytes)}`);
  if (n > MAX_LISTA) lista.push(`• … e mais ${n - MAX_LISTA}`);
  return [
    `📎 *${a.cliente}* mandou ${n === 1 ? "1 arquivo" : `${n} arquivos`} pelo painel`,
    a.enviadoPor?.trim() ? `Enviado por: ${a.enviadoPor.trim()}` : "",
    lista.join("\n"),
    a.observacao?.trim() ? `\n_"${a.observacao.trim()}"_` : "",
  ].filter(Boolean).join("\n");
}

/** O cliente só apaga o que o time ainda não abriu (depois disso o arquivo já pode estar em uso). */
export function podeApagarMaterial(u: { visto_em?: string | null }): boolean {
  return !u.visto_em;
}

// ── Registro de lotes (em memória) ──────────────────────────────────────────────────────────────

interface Pendente {
  clienteId: string;
  ids: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface RegistroDeLotes {
  /** Um arquivo do lote chegou: (re)arma o aviso automático para `esperaMs` depois do último. */
  chegou(lote: string, clienteId: string, uploadId: string): void;
  /**
   * A página pediu o aviso: devolve os ids que ainda não foram avisados (null = o lote JÁ foi avisado,
   * não avisar de novo) e desarma o automático. Lote desconhecido (servidor reiniciou) devolve [].
   */
  concluir(lote: string, clienteId: string): string[] | null;
  /** O aviso pedido falhou: deixa a página pedir de novo (senão o lote ficaria "já avisado"). */
  esquecer(lote: string, clienteId: string): void;
  /** Quantos lotes estão esperando (teste). */
  pendentes(): number;
}

/**
 * `avisar(clienteId, ids)` é chamado pelo automático quando a página não pediu o aviso a tempo.
 * Lotes avisados ficam lembrados por `memoriaMs` para um pedido atrasado não avisar duas vezes.
 */
export function criarRegistroDeLotes(opcoes: {
  esperaMs: number;
  avisar: (clienteId: string, ids: string[]) => void | Promise<void>;
  memoriaMs?: number;
}): RegistroDeLotes {
  const pendentes = new Map<string, Pendente>();
  const avisados = new Map<string, number>();
  const memoriaMs = opcoes.memoriaMs ?? 6 * 3600_000;

  const lembrarAvisado = (lote: string) => {
    const agora = Date.now();
    avisados.set(lote, agora);
    for (const [k, t] of avisados) if (agora - t > memoriaMs) avisados.delete(k);
  };

  return {
    chegou(lote, clienteId, uploadId) {
      const chave = `${clienteId}:${lote}`;
      let p = pendentes.get(chave);
      if (!p) { p = { clienteId, ids: new Set(), timer: null }; pendentes.set(chave, p); }
      p.ids.add(uploadId);
      if (p.timer) clearTimeout(p.timer);
      const atual = p;
      atual.timer = setTimeout(() => {
        pendentes.delete(chave);
        lembrarAvisado(chave);
        void Promise.resolve(opcoes.avisar(clienteId, [...atual.ids])).catch(() => {});
      }, opcoes.esperaMs);
    },
    concluir(lote, clienteId) {
      const chave = `${clienteId}:${lote}`;
      const p = pendentes.get(chave);
      if (p) {
        if (p.timer) clearTimeout(p.timer);
        pendentes.delete(chave);
        lembrarAvisado(chave);
        return [...p.ids];
      }
      if (avisados.has(chave)) return null;
      lembrarAvisado(chave);
      return [];
    },
    esquecer(lote, clienteId) {
      avisados.delete(`${clienteId}:${lote}`);
    },
    pendentes: () => pendentes.size,
  };
}
