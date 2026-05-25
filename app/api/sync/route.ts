import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_FILE = join(process.cwd(), "data", "state.json");
const DATA_DIR = join(process.cwd(), "data");

// GET — download shared state
export async function GET() {
  try {
    if (!existsSync(DATA_FILE)) {
      return NextResponse.json({ state: null, lastSync: null });
    }
    const raw = readFileSync(DATA_FILE, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ state: null, lastSync: null });
  }
}

// POST — upload state (admin only saves, everyone reads)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.state) {
      return NextResponse.json({ error: "No state provided" }, { status: 400 });
    }

    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      const { mkdirSync } = await import("fs");
      mkdirSync(DATA_DIR, { recursive: true });
    }

    const payload = {
      state: body.state,
      lastSync: new Date().toISOString(),
      syncedBy: body.syncedBy ?? "unknown",
    };

    writeFileSync(DATA_FILE, JSON.stringify(payload));

    return NextResponse.json({ success: true, lastSync: payload.lastSync });
  } catch (err) {
    console.error("[Sync] Error saving state:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
