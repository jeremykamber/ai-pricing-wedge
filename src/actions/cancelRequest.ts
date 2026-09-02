"use server";

import { cancellationManager } from "@/infrastructure/RequestCancellationManager";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

export async function cancelRequestAction(requestId: string): Promise<{ success: boolean; message: string }> {
  if (shouldRunLocally()) {
    const cancelled = cancellationManager.cancelRequest(requestId);
    return cancelled
      ? { success: true, message: `Request ${requestId} has been cancelled.` }
      : { success: false, message: `No active request found with ID ${requestId}.` };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getVpsAuthToken()}`,
    },
    body: JSON.stringify({ requestId }),
  });
  return res.json();
}

export async function getActiveRequestsAction(): Promise<{ requestIds: string[] }> {
  if (shouldRunLocally()) {
    return { requestIds: cancellationManager.getActiveRequestIds() };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/requests`, {
    headers: { Authorization: `Bearer ${getVpsAuthToken()}` },
  });
  return res.json();
}
