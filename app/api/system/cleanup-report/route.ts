import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { requireCronOrUser } from "@/lib/api/cron-guard";

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
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
