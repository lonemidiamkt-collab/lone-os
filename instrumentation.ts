import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Antes de qualquer chamada para fora: o container não tem IPv6 (ver lib/rede/so-ipv4.ts).
    const { usarSoIpv4 } = await import("./lib/rede/so-ipv4");
    usarSoIpv4();
    await import("./sentry.server.config");
    // Fila (pg-boss + relay do outbox) dentro do próprio servidor — Fase 0B. Liga só com
    // WORKER_ENABLED=true e DATABASE_URL; sem eles, nada muda. Ver lib/fila/worker.ts.
    if (process.env.WORKER_ENABLED === "true") {
      const { iniciarWorker } = await import("./lib/fila/worker");
      void iniciarWorker();
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captura automaticamente todos os erros de request não tratados (≥8.28.0)
export const onRequestError = Sentry.captureRequestError;
