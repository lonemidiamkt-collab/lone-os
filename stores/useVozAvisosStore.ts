// stores/useVozAvisosStore.ts — a voz dos avisos está ligada pra mim? (lib/avisos/fala.ts)
//
// A preferência mora no servidor (team_members.ouvir_avisos), não no navegador: é ela que decide
// se o sócio RECEBE os avisos de tráfego, e vale em qualquer computador. Padrão: quem cuida de conta
// ouve; sócio não (lib/avisos/regras.ts → vozPadraoDoPapel).

import { create } from "zustand";
import { chamar } from "@/lib/api/chamar";

interface EstadoVoz {
  carregado: boolean;
  ligada: boolean;
  lidoEm: number;
  /** `forcar` relê do servidor mesmo já carregado — a aba aberta obedece quem desligou sem F5. */
  carregar: (forcar?: boolean) => Promise<void>;
  /** Devolve a frase de erro (ou null quando gravou). */
  alternar: (ligada: boolean) => Promise<string | null>;
}

export const useVozAvisosStore = create<EstadoVoz>((set, get) => ({
  carregado: false,
  ligada: false,
  lidoEm: 0,
  carregar: async (forcar = false) => {
    if (get().carregado && !forcar) return;
    const r = await chamar<{ ligada: boolean }>("/api/avisos/voz");
    if (r.ok && r.data) set({ carregado: true, ligada: !!r.data.ligada, lidoEm: Date.now() });
  },
  alternar: async (ligada) => {
    const antes = get().ligada;
    set({ ligada }); // otimista: o botão responde na hora
    const r = await chamar("/api/avisos/voz", { ligada });
    if (!r.ok) { set({ ligada: antes }); return r.erro; }
    return null;
  },
}));
