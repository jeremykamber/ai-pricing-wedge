"use server";

import { cancellationManager } from "@/infrastructure/RequestCancellationManager";
import { shouldRunLocally } from "@/infrastructure/config";
import { vpsPost, vpsGet } from "./vpsClient";

export async function cancelRequestAction(requestId: string): Promise<{ success: boolean; message: string }> {
  if (shouldRunLocally()) {
    const cancelled = cancellationManager.cancelRequest(requestId);
    return cancelled
      ? { success: true, message: `Request ${requestId} has been cancelled.` }
      : { success: false, message: `No active request found with ID ${requestId}.` };
  }

  return vpsPost("requests", { requestId });
}

export async function getActiveRequestsAction(): Promise<{ requestIds: string[] }> {
  if (shouldRunLocally()) {
    return { requestIds: cancellationManager.getActiveRequestIds() };
  }

  return vpsGet("requests");
}
