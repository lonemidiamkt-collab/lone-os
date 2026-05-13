// Sentry tunnel route — proxy que encaminha eventos do SDK para sentry.io,
// evitando bloqueio por ad-blockers (uBlock Origin, Brave, etc.).
// Rota pública (sem autenticação) — listada em PUBLIC_PATHS no middleware.

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

const SENTRY_HOST = "o4511383115071488.ingest.us.sentry.io";
const SENTRY_PROJECT_IDS = ["4511383116251136"];

export async function POST(req: NextRequest) {
  try {
    const envelope = await req.text();
    const pieces = envelope.split("\n");
    const header = JSON.parse(pieces[0]) as { dsn?: string };

    const dsn = new URL(header.dsn ?? "");
    const projectId = dsn.pathname.replace("/", "");

    if (dsn.hostname !== SENTRY_HOST || !SENTRY_PROJECT_IDS.includes(projectId)) {
      return NextResponse.json({ error: "Projeto não autorizado" }, { status: 422 });
    }

    const sentryUrl = `https://${SENTRY_HOST}/api/${projectId}/envelope/`;
    const res = await fetch(sentryUrl, {
      method: "POST",
      body: envelope,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    });

    return new NextResponse(res.body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "text/plain" },
    });
  } catch {
    return NextResponse.json({ error: "Tunnel error" }, { status: 500 });
  }
}
