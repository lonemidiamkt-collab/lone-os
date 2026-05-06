import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const reportPath = join(process.cwd(), "public", "cleanup-report.json");
    const data = readFileSync(reportPath, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({
      lastCleanup: null,
      freedBytes: 0,
      freedHuman: "0B",
      dockerReclaimed: "0B",
      disk: { total: 0, used: 0, free: 0, usedPercent: "0%" },
      message: "Nenhuma limpeza executada ainda",
    });
  }
}
