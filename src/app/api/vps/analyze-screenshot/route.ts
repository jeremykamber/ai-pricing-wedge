// ─── GET /api/vps/analyze-screenshot ────────────────────────────────────────
// Poll the latest screenshot from a running artifact analysis.
// Screenshots are large base64 strings delivered via a side-channel store
// rather than the initial response body.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { screenshotStore } from "@/infrastructure/screenshotStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const screenshot = screenshotStore.get(runId);
  if (!screenshot) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, base64: screenshot });
}
