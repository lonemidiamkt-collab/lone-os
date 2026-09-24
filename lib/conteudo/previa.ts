// lib/conteudo/previa.ts — o post como ele vai aparecer e sair (Leva 7B, N13 e N14).
//
//   · N13 Prévia no Instagram: o feed mostra ~125 caracteres da legenda e corta com "… mais". Quem
//     aprova vê a legenda inteira no card e não percebe que o gancho ficou depois do corte.
//   · N14 Pronto para o mLabs: a legenda completa (legenda + hashtags, sem duplicar) para copiar, e
//     os nomes de pasta/arquivo do .zip das artes — na ordem do carrossel.
//
// Módulo puro (testado em tests/conteudo-previa.test.ts).

/** Quantos caracteres da legenda o feed do Instagram mostra antes do "mais". */
export const LIMITE_LEGENDA_INSTAGRAM = 125;

/**
 * A legenda que vai para o Instagram: o texto + as hashtags, separadas por uma linha em branco.
 * Legenda que já traz as hashtags (as escritas em lote gravam tudo junto) não as repete.
 */
export function legendaCompleta(caption?: string | null, hashtags?: string | null): string {
  const texto = (caption ?? "").trim();
  const tags = (hashtags ?? "").trim();
  if (!tags) return texto;
  if (!texto) return tags;
  if (texto.includes(tags)) return texto;
  return `${texto}\n\n${tags}`;
}

/**
 * O que o feed mostra antes do "mais". Corta no fim da palavra (se houver espaço perto do limite)
 * e nunca no meio de uma quebra de linha. `cortada` = sobrou texto escondido.
 */
export function cortarLegenda(texto: string, limite = LIMITE_LEGENDA_INSTAGRAM): { visivel: string; cortada: boolean } {
  const t = texto.trim();
  if (t.length <= limite) return { visivel: t, cortada: false };
  let corte = limite;
  const espaco = t.lastIndexOf(" ", limite);
  const quebra = t.lastIndexOf("\n", limite);
  const melhor = Math.max(espaco, quebra);
  if (melhor >= limite - 20) corte = melhor;
  return { visivel: t.slice(0, corte).trimEnd(), cortada: true };
}

// ─── Pacote para agendar (zip) ───────────────────────────────────────────────

/** Texto seguro para nome de arquivo: sem acento, minúsculo, só letras/números/hífen. */
export function paraNomeDeArquivo(s: string, max = 40): string {
  const base = s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, max).replace(/-+$/, "") || "sem-nome";
}

/** Pasta de um card dentro do zip: "2026-09-26-cliente-titulo". */
export function pastaDoCard(c: { title: string; clientName?: string | null; dueDate?: string | null }): string {
  const data = c.dueDate?.slice(0, 10) || "sem-data";
  return `${data}-${paraNomeDeArquivo(c.clientName ?? "", 24)}-${paraNomeDeArquivo(c.title, 40)}`;
}

/** "arte-01.png" — a ordem é a do carrossel. */
export function nomeDaArte(indice: number, extensao: string): string {
  return `arte-${String(indice + 1).padStart(2, "0")}.${extensao}`;
}

/** Extensão pela resposta (content-type) ou pelo endereço. Padrão: png. */
export function extensaoDaArte(url: string, mime?: string | null): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  const ext = url.split("?")[0].match(/\.([a-z0-9]{3,4})$/i)?.[1]?.toLowerCase();
  if (ext === "jpeg") return "jpg";
  return ext && ["png", "jpg", "webp", "gif", "mp4", "mov"].includes(ext) ? ext : "png";
}

/**
 * As artes que vão para o agendamento, na ordem: as ENTREGAS do designer; sem entrega marcada, os
 * anexos legados (tipo vazio); só a capa antiga quando não há anexo nenhum. Referência do social
 * NUNCA entra — foi assim que a publicação automática mandou referência pro Instagram do cliente.
 */
export function artesParaAgendar(
  anexos: readonly { url: string; path?: string | null; position?: number | null; tipo?: string | null }[],
  capaLegada?: string | null,
): { url: string; path: string | null }[] {
  const ordenados = [...anexos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const entregas = ordenados.filter((a) => a.tipo === "entrega");
  const escolhidos = entregas.length ? entregas : ordenados.filter((a) => !a.tipo);
  if (escolhidos.length) return escolhidos.map((a) => ({ url: a.url, path: a.path ?? null }));
  if (capaLegada && /^https?:\/\//.test(capaLegada) && !/drive\.google\.com/.test(capaLegada)) return [{ url: capaLegada, path: null }];
  return [];
}
