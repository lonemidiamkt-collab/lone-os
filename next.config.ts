import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const SUPABASE_INTERNAL = process.env.SUPABASE_INTERNAL_URL ?? "http://supabase-kong-1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // @react-pdf/renderer tem o próprio reconciler React. Se o webpack do Next o
  // empacotar, os elementos JSX ficam com shape incompatível e o render quebra com
  // "Minified React error #31" (mesmo em PDFs triviais). Externalizando, ele é
  // carregado como módulo node em runtime, com uma instância de React consistente.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Permite bodies até 51MB em route handlers (5 artes × 10MB + 1MB overhead multipart).
  // Sem isso, Next.js 15 trunca bodies >10MB e req.formData() falha com erro opaco.
  // A validação real por arquivo (10MB card / 25MB misc) é feita em upload-art/route.ts.
  experimental: {
    middlewareClientMaxBodySize: "51mb",
  },
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
  org: process.env.SENTRY_ORG ?? "lone-midia",
  project: process.env.SENTRY_PROJECT ?? "lone-os-portal",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps mais abrangente para stack traces legíveis
  widenClientFileUpload: true,

  // Tunnel route: evita bloqueio por ad-blockers
  tunnelRoute: "/monitoring",

  silent: !process.env.CI,
  telemetry: false,
});
