// lib/avisos/lider.ts — UMA aba fala. Com o painel aberto em 3 abas, cada uma busca os avisos e cada
// uma falaria a mesma frase (a v1 fazia isso).
//
// Eleição pelo Web Locks (navigator.locks): a primeira aba que pede a trava fica com ela enquanto
// estiver aberta; as outras esperam na fila e a próxima assume sozinha quando a falante fecha.
//
// Só entra na disputa a aba em que a pessoa JÁ CLICOU: o Chrome só deixa falar a página que teve
// interação do usuário. Se a falante fosse uma aba nunca clicada, ninguém ouviria nada.
//
// Navegador sem Web Locks (raro): cai numa trava por aviso no localStorage — a primeira aba que vê
// o aviso marca e fala; as outras veem a marca e ficam quietas.

const TRAVA = "lone:avisos-falados:lider";

export interface Candidatura {
  /** Esta aba é a que fala agora. */
  souLider: () => boolean;
  /** Fecha a candidatura (desmontou o componente). */
  encerrar: () => void;
}

export function candidatarSe(): Candidatura {
  let lider = false;
  let soltar: (() => void) | null = null;
  let encerrado = false;
  const temLocks = typeof navigator !== "undefined" && "locks" in navigator && !!navigator.locks?.request;

  const disputar = () => {
    if (encerrado || !temLocks) return;
    navigator.locks.request(TRAVA, () => new Promise<void>((resolve) => {
      if (encerrado) { resolve(); return; }
      lider = true;
      soltar = () => { lider = false; resolve(); };
    })).catch(() => { /* aba fechando */ });
  };

  const jaClicou = typeof navigator !== "undefined" && (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
  const aoInteragir = () => { window.removeEventListener("pointerdown", aoInteragir); window.removeEventListener("keydown", aoInteragir); disputar(); };
  if (jaClicou) disputar();
  else if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", aoInteragir);
    window.addEventListener("keydown", aoInteragir);
  }

  return {
    souLider: () => (temLocks ? lider : true),
    encerrar: () => {
      encerrado = true;
      if (typeof window !== "undefined") { window.removeEventListener("pointerdown", aoInteragir); window.removeEventListener("keydown", aoInteragir); }
      soltar?.();
    },
  };
}

/** Sem Web Locks: a primeira aba que marcar o aviso fala; as outras pulam. Com Web Locks, sempre true. */
export function reservarAviso(id: string): boolean {
  if (typeof navigator !== "undefined" && "locks" in navigator) return true;
  try {
    const chave = `lone:falado:${id}`;
    if (localStorage.getItem(chave)) return false;
    localStorage.setItem(chave, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}
