import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  sendDefaultPii: true,
  includeLocalVariables: true,
  enableLogs: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  beforeSend(event) {
    // LGPD: remover campos sensíveis
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      const PII_FIELDS = [
        "cpf_cnpj", "password", "facebook_password", "facebook_login",
        "token", "access_token", "meta_token", "service_role_key",
      ];
      for (const field of PII_FIELDS) delete data[field];
    }
    // Remover Authorization header de logs
    if (event.request?.headers) {
      delete (event.request.headers as Record<string, unknown>)["authorization"];
      delete (event.request.headers as Record<string, unknown>)["Authorization"];
    }
    // Ignorar rate-limit warnings da Meta (esperado, não é bug)
    const msg = event.exception?.values?.[0]?.value ?? "";
    if (msg.includes("User request limit reached") || msg.includes("rate limit")) return null;
    return event;
  },
});
