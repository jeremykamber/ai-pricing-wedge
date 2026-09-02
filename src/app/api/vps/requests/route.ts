// ─── POST /api/vps/requests (cancel) + GET (list active) ───────────────────
// Manages active analysis/debate/chat request lifecycle.
//   POST: Cancel a running request by requestId.
//   GET : List all currently active/in-flight request IDs.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { cancellationManager } from "@/infrastructure/RequestCancellationManager";

// ─── Cancel a running request ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { requestId } = await req.json();

  if (!requestId || typeof requestId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'requestId' in body" },
      { status: 400 },
    );
  }

  const cancelled = cancellationManager.cancelRequest(requestId);

  if (cancelled) {
    return NextResponse.json({
      success: true,
      message: `Request ${requestId} has been cancelled.`,
    });
  }

  return NextResponse.json({
    success: false,
    message: `No active request found with ID ${requestId}.`,
  });
}

// ─── List active request IDs ────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    requestIds: cancellationManager.getActiveRequestIds(),
  });
}
