"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRole } from "@/lib/context/RoleContext";

const TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const WARNING_MS = 3.5 * 60 * 60 * 1000; // 3.5h — warn 30min before

export default function SessionTimeout() {
  const { isAuthenticated, logout } = useRole();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    if (!isAuthenticated) return;

    // Warning at 3.5h
    warningRef.current = setTimeout(() => {
      const remaining = Math.round((TIMEOUT_MS - (Date.now() - lastActivityRef.current)) / 60000);
      if (remaining > 0 && remaining <= 30) {
        // Show subtle warning (don't block workflow)
        console.log(`[Lone OS] Sessao expira em ${remaining} minutos por inatividade.`);
      }
    }, WARNING_MS);

    // Logout at 4h
    timerRef.current = setTimeout(() => {
      console.log("[Lone OS] Sessao expirada por inatividade (4h).");
      logout();
    }, TIMEOUT_MS);
  }, [isAuthenticated, logout]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Track user activity
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    const handler = () => resetTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [isAuthenticated, resetTimer]);

  return null; // invisible component
}
