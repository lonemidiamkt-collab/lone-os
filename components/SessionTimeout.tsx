"use client";

// components/SessionTimeout.tsx — saída por inatividade, contada ENTRE ABAS, com aviso visível.
//
// 25/10/2026 (onda 6 da auditoria de erro recuperável, item 8.3). Antes: cada aba contava a própria
// inatividade, o aviso de 30 min ia só para o console e o logout era global — uma aba esquecida
// derrubava a aba onde a pessoa estava digitando, as outras abas e os outros aparelhos, e o formulário
// aberto sumia. A regra agora (lib/auth/inatividade.ts):
//  · vale o último uso em QUALQUER aba deste navegador (localStorage + BroadcastChannel, ambos protegidos);
//  · a partir de 3h30 sem uso aparece este aviso, com "Continuar conectado";
//  · com 4 h sem uso em nenhuma aba, a sessão fecha só neste navegador e a página fica guardada por
//    baixo do pedido de senha (RoleContext.encerrarPorInatividade → components/ReentrarSessao).

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import {
  CANAL_ATIVIDADE, deveGravar, faseDaInatividade, gravarAtividadeCompartilhada, horaDaSaida, lerAtividadeCompartilhada, maisRecente,
} from "@/lib/auth/inatividade";

const EVENTOS_DE_USO = ["mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
const CONFERIR_A_CADA_MS = 15 * 1000;

const armazem = () => (typeof window !== "undefined" ? window.localStorage : null);

export default function SessionTimeout() {
  const { isAuthenticated, encerrarPorInatividade } = useRole();
  const ultimoUsoRef = useRef(Date.now());       // desta aba
  const recebidoRef = useRef<number | null>(null); // das outras abas (BroadcastChannel)
  const gravadoRef = useRef(0);
  const canalRef = useRef<BroadcastChannel | null>(null);
  const encerrandoRef = useRef(false);
  const [aviso, setAviso] = useState<{ restanteMs: number } | null>(null);

  const ultimoConhecido = useCallback(() => {
    const agora = Date.now();
    return maisRecente(agora, ultimoUsoRef.current, recebidoRef.current, lerAtividadeCompartilhada(armazem));
  }, []);

  const conferir = useCallback(() => {
    if (!isAuthenticated || encerrandoRef.current) return;
    const agora = Date.now();
    const { fase, restanteMs } = faseDaInatividade(agora, ultimoConhecido());
    if (fase === "sair") {
      encerrandoRef.current = true;
      setAviso(null);
      void encerrarPorInatividade().finally(() => { encerrandoRef.current = false; });
      return;
    }
    setAviso(fase === "aviso" ? { restanteMs } : null);
  }, [isAuthenticated, encerrarPorInatividade, ultimoConhecido]);

  /** Uso nesta aba: vale para todas (grava no máximo a cada 15 s). */
  const registrarUso = useCallback(() => {
    const agora = Date.now();
    ultimoUsoRef.current = agora;
    if (deveGravar(gravadoRef.current, agora)) {
      gravadoRef.current = agora;
      gravarAtividadeCompartilhada(armazem, agora);
      try { canalRef.current?.postMessage(agora); } catch { /* canal fechado */ }
    }
    setAviso((a) => (a ? null : a));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setAviso(null); return; }
    // Entrou (ou voltou a entrar): o relógio recomeça agora, para esta aba e para as outras.
    ultimoUsoRef.current = Date.now();
    gravadoRef.current = 0;
    try {
      canalRef.current = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CANAL_ATIVIDADE) : null;
      if (canalRef.current) {
        canalRef.current.onmessage = (e: MessageEvent) => {
          const t = Number(e.data);
          if (Number.isFinite(t)) { recebidoRef.current = Math.max(recebidoRef.current ?? 0, t); conferir(); }
        };
      }
    } catch { canalRef.current = null; }
    registrarUso();

    const handler = () => registrarUso();
    EVENTOS_DE_USO.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    // Outra aba gravou no localStorage (o evento "storage" só chega nas OUTRAS abas).
    const onStorage = () => conferir();
    window.addEventListener("storage", onStorage);
    // Aba em segundo plano tem timer afrouxado; ao voltar (ou acordar o computador), confere na hora.
    const onVisivel = () => { if (document.visibilityState === "visible") conferir(); };
    document.addEventListener("visibilitychange", onVisivel);
    window.addEventListener("focus", onVisivel);
    const intervalo = setInterval(conferir, CONFERIR_A_CADA_MS);

    return () => {
      EVENTOS_DE_USO.forEach((ev) => window.removeEventListener(ev, handler));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisivel);
      window.removeEventListener("focus", onVisivel);
      clearInterval(intervalo);
      try { canalRef.current?.close(); } catch { /* já fechado */ }
      canalRef.current = null;
    };
  }, [isAuthenticated, registrarUso, conferir]);

  if (!aviso) return null;
  const minutos = Math.max(1, Math.ceil(aviso.restanteMs / 60000));
  return (
    <div role="alert" aria-live="assertive"
      className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[150] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 shadow-lg lg:bottom-6">
      <Clock size={16} className="shrink-0 text-lone-warning" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        Ninguém usa o Lone OS neste navegador há um tempo. Por segurança, a sessão fecha aqui em {minutos} min
        (às {horaDaSaida(Date.now(), aviso.restanteMs)}). A página fica guardada — depois é só digitar a senha.
      </p>
      <button type="button" onClick={registrarUso}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
        Continuar conectado
      </button>
    </div>
  );
}
