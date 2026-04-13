import type { NextConfig } from "next";

const SUPABASE_INTERNAL = process.env.SUPABASE_INTERNAL_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // Proxy /supabase/* to internal Kong API gateway
      { source: "/supabase/rest/:path*", destination: `${SUPABASE_INTERNAL}/rest/:path*` },
      { source: "/supabase/auth/:path*", destination: `${SUPABASE_INTERNAL}/auth/:path*` },
      { source: "/supabase/storage/:path*", destination: `${SUPABASE_INTERNAL}/storage/:path*` },
    ];
  },
};

export default nextConfig;
