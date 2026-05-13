import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const SUPABASE_INTERNAL = process.env.SUPABASE_INTERNAL_URL ?? "http://supabase-kong-1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Force Next.js build tracer to bundle contract-templates/*.docx into standalone output.
  // `app/api/contracts/download-docx/route.ts` reads these via fs at runtime — without this,
  // the tracer can't detect them (they're loaded from `process.cwd()`) and they'd be missing
  // from the Docker production image, causing 500 "Template não encontrado" errors.
  outputFileTracingIncludes: {
    "/api/contracts/download-docx": ["./contract-templates/*.docx"],
  },
  async rewrites() {
    return [
      // Proxy /supabase/* to internal Kong API gateway
      { source: "/supabase/rest/:path*", destination: `${SUPABASE_INTERNAL}/rest/:path*` },
      { source: "/supabase/auth/:path*", destination: `${SUPABASE_INTERNAL}/auth/:path*` },
      { source: "/supabase/storage/:path*", destination: `${SUPABASE_INTERNAL}/storage/:path*` },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "lone-midia",
  project: "lone-os-portal",
  silent: true,
  disableLogger: true,
  // Não bloqueia build se Sentry não estiver configurado
  telemetry: false,
});
