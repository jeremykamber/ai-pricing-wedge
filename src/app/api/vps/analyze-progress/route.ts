// ─── GET /api/vps/analyze-progress ──────────────────────────────────────────
// Poll the progress state of a running person a generation or analysis.
// The background runner writes progress updates to the in-memory progress map;
// this endpoint reads from that map directly. VPS-only — never call server
// actions here (they self-reference in VPS mode).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { progressMap } from "@/infrastructure/progressStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const progress = progressMap.get(runId);
  if (!progress) {
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({
    found: true,
    progress,
  });
}
