// lib/avisos/tocar.ts — TOCA a frase no computador (só navegador).
//
// 1º a voz natural (OpenAI, /api/avisos/audio — Roberto achou a do navegador "bem feia");
// se não vier (sem crédito, rede, 204), a voz em português do próprio navegador. Uma frase por vez,
// em fila: dois avisos seguidos não se atropelam.
//
// Regra do navegador para as duas: a página só toca som sozinha depois de a pessoa ter clicado nela
// (por isso só a aba já clicada disputa a vez de falar — ./lider.ts).

import { authedFetch } from "@/lib/supabase/authed-fetch";

let fila: Promise<void> = Promise.resolve();
let audioAtual: HTMLAudioElement | null = null;

/** Põe a frase na fila. `aoComecar` dispara quando o som REALMENTE começa (prova de que tocou). */
export function falar(frase: string, aoComecar?: () => void): boolean {
  if (typeof window === "undefined" || !frase) return false;
  fila = fila.then(() => tocar(frase, aoComecar)).catch(() => { /* a fila nunca trava */ });
  return true;
}

/** Para o que está tocando e o que estava na fila (botão "Voz desligada"). */
export function calar(): void {
  fila = Promise.resolve();
  try { audioAtual?.pause(); } catch { /* ignore */ }
  audioAtual = null;
  try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

async function tocar(frase: string, aoComecar?: () => void): Promise<void> {
  if (await vozNatural(frase, aoComecar)) return;
  await vozDoNavegador(frase, aoComecar);
}

async function vozNatural(frase: string, aoComecar?: () => void): Promise<boolean> {
  let url: string | null = null;
  try {
    const r = await authedFetch("/api/avisos/audio", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: frase }),
    });
    if (r.status !== 200 || !(r.headers.get("content-type") ?? "").includes("audio")) return false;
    url = URL.createObjectURL(await r.blob());
    const audio = new Audio(url);
    audioAtual = audio;
    return await new Promise<boolean>((resolve) => {
      let comecou = false;
      const fim = (ok: boolean) => { if (url) URL.revokeObjectURL(url); url = null; if (audioAtual === audio) audioAtual = null; resolve(ok); };
      audio.onplaying = () => { if (!comecou) { comecou = true; aoComecar?.(); } };
      audio.onended = () => fim(true);
      audio.onpause = () => { if (!audio.ended) fim(true); }; // calar() no meio
      audio.onerror = () => fim(comecou);
      audio.play().catch(() => fim(false)); // bloqueado pelo navegador → tenta a voz dele
    });
  } catch {
    if (url) URL.revokeObjectURL(url);
    return false;
  }
}

function vozPtBr(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices().filter((v) => /^pt(-|_)?BR/i.test(v.lang) || /portugu[eê]s do brasil/i.test(v.name));
  // A do Google (Chrome) soa mais natural que a do sistema; depois Luciana (Mac) e Maria (Windows).
  return vozes.find((v) => /google/i.test(v.name)) ?? vozes.find((v) => /luciana|francisca|maria/i.test(v.name)) ?? vozes[0] ?? null;
}

function vozDoNavegador(frase: string, aoComecar?: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = "pt-BR";
      const voz = vozPtBr();
      if (voz) u.voice = voz;
      u.rate = 1.02;
      if (aoComecar) u.onstart = () => { try { aoComecar(); } catch { /* ignore */ } };
      const seguro = setTimeout(resolve, 20000); // Chrome às vezes não dispara onend
      u.onend = () => { clearTimeout(seguro); resolve(); };
      u.onerror = () => { clearTimeout(seguro); resolve(); };
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}
