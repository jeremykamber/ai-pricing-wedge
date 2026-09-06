/**
 * Shared rate limiter configuration for server actions.
 *
 * Extracted from analyzeArtifactAction, generatePersonas, and
 * generatePersonasFromInterviews which all duplicated the same
 * env-var parsing and RateLimiterMemory construction.
 *
 * Ousterhout red flag addressed: Repetition.
 */

import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const RATE_LIMIT_WINDOW_S = Math.floor(
  parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000') / 1000,
);

export function createRateLimiter(keyPrefix: string): RateLimiterMemory {
  return new RateLimiterMemory({
    keyPrefix,
    points: RATE_LIMIT_MAX,
    duration: RATE_LIMIT_WINDOW_S,
  });
}

interface RateLimitRejection {
  msBeforeNext?: number;
}

export async function checkRateLimit(
  limiter: RateLimiterMemory,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  let clientIP = 'unknown';
  try {
    const headersList = await headers();
    clientIP = headersList.get('x-forwarded-for')?.split(',')[0]
      || headersList.get('x-real-ip')
      || 'unknown';
  } catch { /* non-critical in some contexts */ }

  try {
    await limiter.consume(clientIP);
    return { allowed: true };
  } catch (rejRes) {
    const rejection = rejRes as RateLimitRejection;
    return { allowed: false, retryAfterSeconds: Math.round((rejection.msBeforeNext ?? 60000) / 1000) };
  }
}
