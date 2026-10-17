"use client";

import { useSyncExternalStore } from "react";
import { ehHostComercial } from "@/lib/navegacao/casco";

const nada = () => () => {};

/** Está no endereço do comercial (comercial.lonemidia.com)? No servidor é sempre false; o React troca na hidratação. */
export function useCascoComercial(): boolean {
  return useSyncExternalStore(nada, () => ehHostComercial(window.location.hostname), () => false);
}
