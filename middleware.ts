import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that don't require authentication
const PUBLIC_PATHS = ["/api/auth", "/api/meta", "/api/ai", "/api/system", "/api/sync", "/api/onboarding", "/api/emails", "/api/broadcasts", "/api/platform-updates", "/api/holidays", "/api/portal", "/onboarding", "/portal", "/monitoring", "/_next", "/favicon.ico", "/logo.png", "/icon-192.png", "/icon-512.png", "/manifest.json", "/sw.js", "/public"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public assets and API routes
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const res = NextResponse.next();
    // Portal público — não indexar
    if (pathname.startsWith("/portal")) {
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return res;
  }

  // Auth gate pra /api/*: aceita 3 fontes (sincronizado com lib/supabase/auth-server.ts).
  // Validação fina (whitelist de email, decodificação de token) é feita no
  // route handler via getServerUser — middleware só bloqueia request claramente
  // sem credencial alguma.
  if (pathname.startsWith("/api/")) {
    const hasCookieSession = request.cookies.getAll().some(
      (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
    );
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const hasAuthHeader = /^(bearer|localsession)\s+\S/i.test(authHeader);

    if (!hasCookieSession && !hasAuthHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
