import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  sendDefaultPii: true,

  // 100% em dev, 10% em prod (limite free tier)
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Replay: 5% sessões normais, 100% sessões com erro
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],

  beforeSend(event) {
    // LGPD: remover campos sensíveis de qualquer payload
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      const PII_FIELDS = ["cpf_cnpj", "password", "facebook_password", "facebook_login", "token", "access_token"];
      for (const field of PII_FIELDS) delete data[field];
    }
    // Não capturar erros de extensões de browser
    if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
      (f) => f.filename?.includes("chrome-extension") || f.filename?.includes("moz-extension")
    )) return null;
    return event;
  },
});

// App Router: captura transições de navegação como spans
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
