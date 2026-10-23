// tests/fixtures/relogio-falso.ts — roda uma rota que pausa entre um envio e outro (2–2,5 s, pra
// não estourar a fila da Evolution) sem esperar de verdade.
//
// Por que existe (23/10/2026): com o relógio real, os testes de rota dependiam da velocidade da
// máquina — com o Mac em swap, cada teste levou ~1000 s e estourou o limite. Aqui só o setTimeout e
// o Date são falsos; o setImmediate continua real, pra o import dinâmico e as promessas andarem.

import { vi } from "vitest";

export function ligarRelogioFalso(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

/** Espera a promessa adiantando o relógio falso: cada volta passa 5 s e devolve a vez ao event loop real. */
export async function esperarComRelogioFalso<T>(p: Promise<T>): Promise<T> {
  let pronto = false;
  p.then(() => { pronto = true; }, () => { pronto = true; });
  while (!pronto) {
    await vi.advanceTimersByTimeAsync(5_000);
    await new Promise((r) => setImmediate(r));
  }
  return p;
}
