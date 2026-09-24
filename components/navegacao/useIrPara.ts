"use client";

// Ir para uma tela do menu — com ou sem aba interna. Usado pela barra lateral e pela busca ⌘K.
//
// A aba é entregue via NavContext.pendingTab, que a página consome. O cuidado está na ORDEM: se a aba
// for marcada antes de trocar de página, a página que está saindo pode consumir (e apagar) o pedido
// antes de a nova montar — /social e /crm limpam qualquer pendingTab que não reconhecem. Por isso,
// indo para OUTRA página, a aba só é marcada depois que o endereço já mudou.

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNav } from "@/lib/context/NavContext";

export interface Destino {
  href: string;
  aba?: string;
}

export function useIrPara() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { setPendingTab } = useNav();
  const abaAposNavegar = useRef<{ path: string; aba: string } | null>(null);

  useEffect(() => {
    const pendente = abaAposNavegar.current;
    if (pendente && pendente.path === pathname) {
      abaAposNavegar.current = null;
      setPendingTab(pendente.aba);
    }
  }, [pathname, setPendingTab]);

  return useCallback((destino: Destino) => {
    const path = destino.href.split("?")[0];
    if (destino.aba) {
      if (pathname === path) {
        setPendingTab(destino.aba);
        return;
      }
      abaAposNavegar.current = { path, aba: destino.aba };
    }
    router.push(destino.href);
  }, [pathname, router, setPendingTab]);
}
