// ─── GET /api/vps/persona-result ─────────────────────────────────────────────
// Poll the final results (or error) of a completed persona generation.
// The background runner writes results to PersonaGenerationStore;
// this endpoint reads from that store.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = personaGenerationStore.get(runId);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    personas: result.personas,
    error: result.error,
    completedAt: result.completedAt,
  });
}
