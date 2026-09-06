"use server";

import { shouldRunLocally } from "@/infrastructure/config";
import { screenshotStore } from "@/infrastructure/screenshotStore";
import { vpsGet } from "./vpsClient";

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

  try {
    return await vpsGet("analyze-screenshot", { runId });
  } catch {
    console.error(`[SCREENSHOT_POLL] VPS returned error for ${runId}`);
    return { found: false };
  }
}
