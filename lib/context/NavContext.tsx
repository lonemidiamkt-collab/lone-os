"use client";

import { createContext, useContext, useState } from "react";

interface NavContextValue {
  secondaryOpen: boolean;
  setSecondaryOpen: (v: boolean) => void;
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

  return (
    <NavContext.Provider value={{ secondaryOpen, setSecondaryOpen, pendingTab, setPendingTab, currentTab, setCurrentTab, mobileOpen, setMobileOpen }}>
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
