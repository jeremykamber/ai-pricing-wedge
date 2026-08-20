// ─── GET /api/vps/analyze-result ───────────────────────────────────────────
// Poll the final results (or error) of a completed artifact analysis.
// The background analysis runner writes results to the AnalysisResultStore;
// this endpoint reads from that store.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { analysisResultStore } from "@/infrastructure/AnalysisResultStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = analysisResultStore.get(runId);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    analyses: result.analyses,
    error: result.error,
    completedAt: result.completedAt,
  });
}
