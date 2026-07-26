"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** Largura da barra principal em cada estado — quem posiciona algo à direita dela usa isto. */
export const SIDEBAR_W = 72;
export const SIDEBAR_W_EXPANDED = 200;

interface NavContextValue {
  secondaryOpen: boolean;
  setSecondaryOpen: (v: boolean) => void;
  /** Menu principal com os nomes à mostra (200px) em vez de só ícones (72px). */
  sidebarExpanded: boolean;
  setSidebarExpanded: (v: boolean) => void;
  /** Tab to navigate to on the next page render — consumed by the page */
  pendingTab: string;
  setPendingTab: (v: string) => void;
  /** Currently active tab — set by the page, read by the sidebar to highlight active item */
  currentTab: string;
  setCurrentTab: (v: string) => void;
  /** Mobile sidebar visibility */
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const NavContext = createContext<NavContextValue>({
  secondaryOpen: false,
  setSecondaryOpen: () => {},
  sidebarExpanded: false,
  setSidebarExpanded: () => {},
  pendingTab: "",
  setPendingTab: () => {},
  currentTab: "",
  setCurrentTab: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState("");
  const [currentTab, setCurrentTab] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Começa fechado nos dois lados (servidor e cliente) e só então lê a preferência — ler o
  // localStorage direto no useState quebraria a hidratação do Next.
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("lone:sidebar-expanded") === "1") setSidebarExpanded(true); } catch { /* modo privado */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("lone:sidebar-expanded", sidebarExpanded ? "1" : "0"); } catch { /* modo privado */ }
  }, [sidebarExpanded]);

  return (
    <NavContext.Provider value={{ secondaryOpen, setSecondaryOpen, sidebarExpanded, setSidebarExpanded, pendingTab, setPendingTab, currentTab, setCurrentTab, mobileOpen, setMobileOpen }}>
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
