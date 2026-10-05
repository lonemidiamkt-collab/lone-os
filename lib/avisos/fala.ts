// lib/avisos/fala.ts — O PAINEL FALA OS AVISOS DE TRÁFEGO.
//
// Roberto (05/10/2026): "a gente já conversou sobre colocar um áudio, como se o sistema falasse com
// a gente, fizesse alguns avisos ... ela avisar, por exemplo, o cliente Bruno Tintas caiu o
// resultado, no computador do Júlio, de quem tem acesso a tráfego". Nunca tinha sido construído.
//
// Como funciona: os avisos de tráfego (conta parada, queda forte de resultado, saldo zerando) viram
// notificação do tipo "trafego" para o gestor do cliente e para a gestão (lib/avisos/trafego-server.ts).
// O painel já busca as notificações a cada 45 s; quando chega uma dessas, além do toast, ele FALA
// a frase em voz alta com a voz do próprio navegador (Web Speech) — sem custo e sem serviço novo.
//
// Limites do navegador, que não dá pra contornar: o painel precisa estar aberto (em qualquer aba) e
// a pessoa precisa ter clicado nele pelo menos uma vez desde que abriu — sem esse clique o Chrome
// não deixa a página falar sozinha.

import type { AppNotification } from "@/lib/types";

export const CHAVE_PREFERENCIA = "lone:avisos-falados";

/**
 * O que cada papel ouve. Tráfego e gestão: os avisos de tráfego. Social e designer: os avisos de
 * ARTE (arte entregue / adicionada) — os mesmos que já tocavam o som de três notas (Roberto,
 * 05/10: "rodar na máquina do Carlos um aviso de arte"). O resto continua só no sino e no toast.
 */
const OUVE_TRAFEGO = new Set(["traffic", "admin", "manager"]);
const OUVE_ARTE = new Set(["social", "designer", "admin", "manager"]);

export function podeOuvir(papel: string | null | undefined): boolean {
  const p = String(papel ?? "");
  return OUVE_TRAFEGO.has(p) || OUVE_ARTE.has(p);
}

/** Aviso sobre ARTE entrando — designer entregou ou o social adicionou. */
export function ehAvisoDeArte(n: Pick<AppNotification, "type" | "title" | "body">): boolean {
  if (n.type !== "content") return false;
  const t = `${n.title} ${n.body}`.toLowerCase();
  return /arte (entregue|pronta|adicionad|nova)|entregou a arte|nova arte|arte do designer|designer entregou/.test(t);
}

export function deveFalar(n: Pick<AppNotification, "type" | "title" | "body">, papel: string | null | undefined, ligado: boolean): boolean {
  if (!ligado) return false;
  const p = String(papel ?? "");
  if (n.type === "trafego") return OUVE_TRAFEGO.has(p);
  if (ehAvisoDeArte(n)) return OUVE_ARTE.has(p);
  return false;
}

/**
 * A frase falada: título e corpo, sem emoji, sem marcação do WhatsApp (*, _), sem link, com "R$"
 * lido como "reais" e cortada no fim de uma frase. Falar "asterisco SALDO CRÍTICO asterisco" ou um
 * link inteiro é o que faz aviso falado virar ruído.
 */
export function fraseParaFalar(titulo: string, corpo = "", max = 220): string {
  const limpar = (s: string) => s
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_~`]/g, "")
    .replace(/R\$\s?([\d.]+),(\d{2})/g, (_, r, c) => `${r.replace(/\./g, "")} reais${c !== "00" ? ` e ${Number(c)} ${Number(c) === 1 ? "centavo" : "centavos"}` : ""}`)
    .replace(/R\$\s?([\d.]+)/g, (_, r) => `${r.replace(/\./g, "")} reais`)
    .replace(/\s+/g, " ")
    .trim();
  const t = limpar(titulo).replace(/[.:—-]+$/, "");
  const c = limpar(corpo);
  let frase = c ? `${t}. ${c}` : t;
  if (frase.length > max) {
    const corte = frase.lastIndexOf(".", max);
    frase = corte > max * 0.5 ? frase.slice(0, corte + 1) : `${frase.slice(0, max).replace(/\s+\S*$/, "")}.`;
  }
  return frase;
}

// ── Navegador ────────────────────────────────────────────────────────────────

/** Ligado por padrão pra quem pode ouvir; a pessoa desliga no sino. */
export function falaLigada(): boolean {
  try { return localStorage.getItem(CHAVE_PREFERENCIA) !== "off"; } catch { return true; }
}

export function definirFala(ligada: boolean): void {
  try { localStorage.setItem(CHAVE_PREFERENCIA, ligada ? "on" : "off"); } catch { /* sem armazenamento: vale só na sessão */ }
}

function vozPtBr(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices().filter((v) => /^pt(-|_)?BR/i.test(v.lang) || /portugu[eê]s do brasil/i.test(v.name));
  // A do Google (Chrome) soa mais natural que a do sistema; depois Luciana (Mac) e Maria (Windows).
  return vozes.find((v) => /google/i.test(v.name)) ?? vozes.find((v) => /luciana|francisca|maria/i.test(v.name)) ?? vozes[0] ?? null;
}

/** Fala a frase. Nunca lança: navegador sem voz (ou sem o clique inicial) simplesmente não fala. */
export function falar(frase: string): boolean {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !frase) return false;
    const u = new SpeechSynthesisUtterance(frase);
    u.lang = "pt-BR";
    const voz = vozPtBr();
    if (voz) u.voice = voz;
    u.rate = 1.02;
    window.speechSynthesis.speak(u); // entra na fila: dois avisos seguidos são falados um depois do outro
    return true;
  } catch {
    return false;
  }
}
