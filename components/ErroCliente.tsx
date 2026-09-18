"use client";

import { useEffect } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// Registra erro JS e promessa rejeitada da tela no servidor (ver /api/system/erro-cliente).
// Sem UI. Limita a 20 por sessão para não virar tempestade.
export default function ErroCliente() {
  useEffect(() => {
    let enviados = 0;
    const mandar = (msg: string, stack?: string, acao?: string) => {
      if (enviados >= 20 || !msg || /ResizeObserver loop|Script error\.?$/.test(msg)) return;
      enviados++;
      authedFetch("/api/system/erro-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg, stack, url: location.pathname, acao }) }).catch(() => {});
    };
    const onErro = (e: ErrorEvent) => mandar(e.message, e.error?.stack, "window.error");
    const onRejeicao = (e: PromiseRejectionEvent) => { const r = e.reason; mandar(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined, "unhandledrejection"); };
    // Sessão recusada mesmo depois de renovar: dizer, em vez de deixar o botão mudo (1 aviso/min).
    let ultimoAviso = 0;
    const onSessao = () => {
      if (Date.now() - ultimoAviso < 60_000) return;
      ultimoAviso = Date.now();
      mandar("sessao-expirada: servidor recusou depois de renovar", undefined, "sessao");
      import("sonner").then(({ toast }) => toast.error("Sua sessão expirou. Recarregue a página e entre de novo — o que você acabou de fazer não foi salvo.", { duration: 12000, action: { label: "Recarregar", onClick: () => location.reload() } })).catch(() => {});
    };
    window.addEventListener("error", onErro);
    window.addEventListener("unhandledrejection", onRejeicao);
    window.addEventListener("lone:sessao-expirada", onSessao);
    return () => { window.removeEventListener("error", onErro); window.removeEventListener("unhandledrejection", onRejeicao); window.removeEventListener("lone:sessao-expirada", onSessao); };
  }, []);
  return null;
}
