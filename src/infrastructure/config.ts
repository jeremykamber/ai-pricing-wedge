/**
 * Shared configuration for execution environment.
 * Controls whether server actions run locally or delegate to the VPS.
 *
 * Safety: In production (Netlify) FORCE_LOCAL is never set — the function
 * falls through to the hardcoded return false, matching the original
 * behaviour. The env-var override exists solely for e2e tests that need
 * the full pipeline (LLM calls, browser) to run in-process.
 */
export function shouldRunLocally(): boolean {
    if (process.env.FORCE_LOCAL === "true") return true;
    return false;
}

export const VPS_BACKEND_URL: string = process.env.VPS_BACKEND_URL || "http://localhost:8080";

export function getVpsAuthToken(): string {
    return process.env.VPS_AUTH_TOKEN || "";
}
