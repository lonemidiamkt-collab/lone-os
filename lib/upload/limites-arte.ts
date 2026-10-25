// lib/upload/limites-arte.ts — o que pode subir como arte ou referência de um card, dito ANTES.
// Regra pura (tests/upload-limites-arte.test.ts). Os números são os do /api/upload-art.
//
// Por que existe (24/10/2026, auditoria de erro recuperável, itens 2.7 e 2.15):
//  · no "Novo conteúdo" o limite não aparecia em lugar nenhum: a pessoa colava um print de 14 MB,
//    criava a demanda e só depois lia "a referência não subiu";
//  · no "Anexar arte" o erro piscava e sumia, e quando 2 de 5 subiam a tela não mostrava as 2 — a
//    pessoa mandava as 5 de novo e o card ficava com arte repetida.
// O limite é escrito na tela, o arquivo é conferido na hora em que é escolhido, e a falha parcial
// diz o que subiu e o que falta.

export const TIPOS_DE_ARTE = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_MB_ARTE = 10;
export const MAX_BYTES_ARTE = MAX_MB_ARTE * 1024 * 1024;
/** Teto por card (o carrossel do Instagram) — o mesmo do /api/upload-art. */
export const MAX_ARTES_POR_CARD = 20;

/** A frase do limite, para ficar escrita perto do campo. */
export const TEXTO_DO_LIMITE = `PNG, JPEG, WebP ou GIF · até ${MAX_MB_ARTE} MB cada · até ${MAX_ARTES_POR_CARD} por card`;

export interface ArquivoParaConferir {
  name: string;
  type: string;
  size: number;
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");

/** Por que este arquivo não pode subir. null = pode. */
export function problemaDoArquivo(f: ArquivoParaConferir): string | null {
  const nome = f.name || "arquivo sem nome";
  if (!(TIPOS_DE_ARTE as readonly string[]).includes(f.type)) {
    return `"${nome}" não é PNG, JPEG, WebP ou GIF — exporte a imagem num desses formatos.`;
  }
  if (f.size === 0) return `"${nome}" está vazio — copie ou exporte a imagem de novo.`;
  if (f.size > MAX_BYTES_ARTE) {
    return `"${nome}" tem ${mb(f.size)} MB — o limite é ${MAX_MB_ARTE} MB. Exporte menor (JPEG costuma resolver).`;
  }
  return null;
}

export interface Separacao<T> {
  aceitos: T[];
  /** Um motivo por arquivo recusado, já em frase. */
  recusados: { arquivo: T; motivo: string }[];
}

/**
 * Separa o que pode subir do que não pode. `jaNoCard` conta o que o card já tem (ou o que já está
 * na lista): o que passaria do teto fica de fora com o motivo, em vez de o lote inteiro falhar.
 */
export function separarArquivos<T extends ArquivoParaConferir>(arquivos: readonly T[], jaNoCard = 0): Separacao<T> {
  const aceitos: T[] = [];
  const recusados: { arquivo: T; motivo: string }[] = [];
  for (const f of arquivos) {
    const p = problemaDoArquivo(f);
    if (p) { recusados.push({ arquivo: f, motivo: p }); continue; }
    if (jaNoCard + aceitos.length >= MAX_ARTES_POR_CARD) {
      recusados.push({ arquivo: f, motivo: `"${f.name}" passa do limite de ${MAX_ARTES_POR_CARD} artes por card.` });
      continue;
    }
    aceitos.push(f);
  }
  return { aceitos, recusados };
}

/** Os motivos de recusa numa frase só (até 3 nomes; o resto vira "e mais N"). */
export function frasesDeRecusa(recusados: readonly { motivo: string }[]): string | null {
  if (!recusados.length) return null;
  const primeiros = recusados.slice(0, 3).map((r) => r.motivo);
  const resto = recusados.length - primeiros.length;
  return `${primeiros.join(" ")}${resto > 0 ? ` E mais ${resto} arquivo${resto > 1 ? "s" : ""} com problema.` : ""}`;
}

/**
 * "Novo conteúdo" com referência: o card foi criado e parte das referências não subiu. 2.15: clicar
 * em "Criar" de novo criava OUTRO card e subia todas de novo; agora o card fica guardado e a nova
 * tentativa manda só as que falharam — e a frase diz isso.
 */
export function resumoDasReferencias(p: { titulo: string; total: number; falhas: readonly { nome: string; erro: string }[] }): string | null {
  if (!p.falhas.length) return null;
  const subiram = Math.max(0, p.total - p.falhas.length);
  const nomes = p.falhas.slice(0, 3).map((f) => `"${f.nome}"`).join(", ") + (p.falhas.length > 3 ? ` e mais ${p.falhas.length - 3}` : "");
  const erro = p.falhas[0].erro.trim().replace(/[.\s]+$/, "");
  const parte = subiram > 0 ? `${subiram} de ${p.total} referências subiram; ` : "";
  return `A demanda "${p.titulo}" já foi criada. ${parte}não ${p.falhas.length === 1 ? "subiu" : "subiram"}: ${nomes} (${erro}). "Reenviar" manda só ${p.falhas.length === 1 ? "essa" : "essas"} — não cria outro card. Se preferir, remova e clique em "Concluir".`;
}

/**
 * O upload de várias artes falhou no meio. O servidor sobe na ordem e para no primeiro erro, então
 * as `subiram` primeiras estão no card — a lista recarregada mostra quais — e o resto não.
 */
export function resumoDoUploadParcial(p: { nomes: readonly string[]; subiram: number; erro: string }): string {
  const total = p.nomes.length;
  const subiram = Math.max(0, Math.min(total, p.subiram));
  const faltam = p.nomes.slice(subiram);
  const erro = comPonto(p.erro);
  const lista = faltam.length <= 3 ? faltam.map((n) => `"${n}"`).join(", ") : `${faltam.slice(0, 3).map((n) => `"${n}"`).join(", ")} e mais ${faltam.length - 3}`;
  if (subiram === 0) {
    // A frase do servidor já pode dizer "tenta de novo" ("Sem conexão… Tenta de novo?"): não repete.
    const repetir = /tent[ae] de novo/i.test(erro) ? "" : " Tente de novo.";
    return total === 1
      ? `A arte não subiu: ${erro}${repetir}`
      : `Nenhuma das ${total} artes subiu: ${erro}${repetir}`;
  }
  return `Subiram ${subiram} de ${total} artes (já estão no card). Não ${faltam.length === 1 ? "subiu" : "subiram"}: ${lista} — ${erro} Mande de novo só ${faltam.length === 1 ? "essa" : "essas"}.`;
}

/** A frase do erro termina com pontuação (sem "?." nem ".."). */
function comPonto(erro: string): string {
  const e = erro.trim() || "erro desconhecido";
  return /[.?!]$/.test(e) ? e : `${e}.`;
}
