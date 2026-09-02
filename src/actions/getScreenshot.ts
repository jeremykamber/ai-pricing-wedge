"use server";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";
import { screenshotStore } from "@/infrastructure/screenshotStore";

export async function storeScreenshot(runId: string, base64: string): Promise<void> {
  screenshotStore.set(runId, base64);
}

export async function getScreenshotAction(runId: string): Promise<{
  found: boolean;
  base64?: string;
}> {
  if (shouldRunLocally()) {
    const screenshot = screenshotStore.get(runId);
    if (!screenshot) return { found: false };
    return { found: true, base64: screenshot };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-screenshot?runId=${runId}`, {
    headers: { Authorization: `Bearer ${getVpsAuthToken()}` },
  });
  if (!res.ok) {
    console.error(`[SCREENSHOT_POLL] VPS returned ${res.status} for ${runId}`);
    return { found: false };
  }
  return res.json();
}
