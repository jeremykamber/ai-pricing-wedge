import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "Use a specific endpoint",
      available: [
        "GET  /api/vps/analyze-progress?runId=xxx",
        "GET  /api/vps/analyze-screenshot?runId=xxx",
        "GET  /api/vps/analyze-result?runId=xxx",
        "GET  /api/vps/requests (lists active)",
        "POST /api/vps/analyze",
        "POST /api/vps/debate",
        "POST /api/vps/chat-with-persona",
        "POST /api/vps/generate-personas",
        "POST /api/vps/generate-personas-from-interviews",
        "POST /api/vps/generate-similar-personas",
        "POST /api/vps/record-step",
        "POST /api/vps/requests (cancel)",
      ],
    },
    { status: 404 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Use a specific sub-path. See GET /api/vps for available endpoints." },
    { status: 404 },
  );
}
