/**
 * Autoresearch benchmark runner for the artifact-analysis pipeline.
 *
 * Measures end-to-end wall time of AnalyzeArtifactUseCase + cohort synthesis
 * for a FIXED workload (jobright.ai, 3 fixed personas), using the real VPS
 * Playwright endpoint for intake and the real OpenRouter models. Deterministic
 * in workload; LLM latency is the thing being measured.
 *
 * Emits METRIC lines consumed by autoresearch.sh.
 *
 * Usage: bun scripts/autoresearch-bench.ts
 */
import "dotenv/config";
import { AnalyzeArtifactUseCase, type AnalysisProgress } from "../src/application/usecases/AnalyzeArtifactUseCase";
import { RemotePlaywrightAdapter } from "../src/infrastructure/adapters/RemotePlaywrightAdapter";
import { LlmServiceImpl } from "../src/infrastructure/adapters/LlmServiceImpl";
import { ArtifactIntakeAdapter, type ArtifactInput } from "../src/infrastructure/adapters/ArtifactIntakeAdapter";
import { SynthesizeArtifactResultsUseCase } from "../src/application/usecases/synthesizeArtifactResults";
import { AnalysisLogger } from "../src/infrastructure/AnalysisLogger";
import type { Persona } from "../src/domain/entities/Persona";

const INPUT: ArtifactInput = { type: "url", url: "https://jobright.ai" };
const BUSINESS_GOAL =
  "Convince hiring managers and small business owners to sign up for the free AI recruiting assistant.";
const RESEARCH_QUESTION = "Why doesn't the user get the free version?";

function persona(
  name: string,
  occupation: string,
  backstory: string,
  traits: { c: number; n: number; o: number; e: number; a: number },
): Persona {
  return {
    id: `bench-${name.toLowerCase()}`,
    name,
    occupation,
    backstory,
    goals: ["Evaluate whether this product helps my business today"],
    conscientiousness: traits.c,
    neuroticism: traits.n,
    openness: traits.o,
    extraversion: traits.e,
    agreeableness: traits.a,
    values: ["time savings", "clear pricing"],
    fears: ["wasting money", "losing control of my data"],
    communicationStyle: "direct, skeptical",
    decisionStyle: "fast, practical",
  } as Persona;
}

/** Fixed 3-persona cohort — mirrors the user's failed jobright test run. */
const PERSONAS: Persona[] = [
  persona(
    "Sky",
    "Owner of a boutique landscaping company",
    "Sky runs a 4-crew landscaping company and does all quoting and invoicing himself. He is time-poor and allergic to subscription software that overpromises.",
    { c: 70, n: 40, o: 55, e: 60, a: 50 },
  ),
  persona(
    "Casey",
    "Co-founder of a small e-commerce retail business",
    "Casey co-founded a 6-person e-commerce retail shop. She has hired once via Upwork, found it slow, and is open to AI tools if the value is obvious in under a minute.",
    { c: 65, n: 55, o: 70, e: 65, a: 55 },
  ),
  persona(
    "Remy",
    "Owner of a family-run catering business",
    "Remy runs a family catering business with 9 staff. He distrusts anything that asks for a credit card upfront and prefers tools his nephew can explain to him.",
    { c: 60, n: 65, o: 45, e: 50, a: 65 },
  ),
];

/**
 * Progress events with wall-clock timestamps. The use case fires
 * { personaName, completedCount } when a persona finishes, so the delta
 * between consecutive completions gives per-persona wall time.
 */
interface ProgressEvent {
  at: number;
  progress: AnalysisProgress;
}

async function main(): Promise<void> {
  const runId = `bench-${Date.now()}`;
  const log = AnalysisLogger.forRun(runId);
  await log.init();

  const t0 = Date.now();

  const browserService = RemotePlaywrightAdapter.createFromEnv();
  const llmService = LlmServiceImpl.createFromEnv("openrouter");
  const intakeAdapter = new ArtifactIntakeAdapter(browserService, llmService);
  const useCase = new AnalyzeArtifactUseCase(intakeAdapter, llmService);

  const intakeStart = Date.now();
  const intake = await intakeAdapter.intake(INPUT, undefined, runId);
  const intakeMs = Date.now() - intakeStart;

  const events: ProgressEvent[] = [];
  const onProgress = (progress: AnalysisProgress): void => {
    events.push({ at: Date.now(), progress });
  };

  const personasStart = Date.now();
  const responses = await useCase.execute(
    { type: "screenshot", imageBase64: intake.screenshotBase64, url: intake.url },
    PERSONAS,
    BUSINESS_GOAL,
    RESEARCH_QUESTION,
    onProgress,
    undefined,
    { tokenLimit: 2000, runId },
  );
  const personasMs = Date.now() - personasStart;

  // Per-persona wall time: completions arrive in finish order; the first
  // completion is measured from the start of the persona phase.
  const completions = events.filter((e) => e.progress.completedCount !== undefined);
  let prev = personasStart;
  const personaDurations: Array<{ name: string; ms: number }> = [];
  for (const e of completions) {
    personaDurations.push({ name: e.progress.personaName ?? "?", ms: e.at - prev });
    prev = e.at;
  }
  const slowest = personaDurations.reduce<{ name: string; ms: number } | null>(
    (acc, d) => (!acc || d.ms > acc.ms ? d : acc),
    null,
  );

  const completed = responses.filter(
    (r) => r.overview && r.customerJourney.length > 0 && !r.overview.startsWith("Analysis could not be completed."),
  );

  const synthesisStart = Date.now();
  let synthesisOk = false;
  if (completed.length > 0) {
    try {
      await new SynthesizeArtifactResultsUseCase(llmService).execute(completed, RESEARCH_QUESTION, {
        runId,
        failedCount: responses.length - completed.length,
        totalPersonaCount: responses.length,
      });
      synthesisOk = true;
    } catch (err) {
      console.error(`[bench] synthesis failed: ${String(err)}`);
    }
  }
  const synthesisMs = Date.now() - synthesisStart;

  const totalMs = Date.now() - t0;

  await log.close();
  AnalysisLogger.removeRun(runId);

  console.log("\n=== BENCH RESULTS ===");
  console.log(`intake: ${intakeMs}ms`);
  for (const d of personaDurations) console.log(`persona ${d.name}: ${d.ms}ms`);
  console.log(`personas phase: ${personasMs}ms (slowest: ${slowest?.name ?? "?"} ${slowest?.ms ?? "?"}ms)`);
  console.log(`synthesis: ${synthesisMs}ms ok=${synthesisOk}`);
  console.log(`responses: ${completed.length}/${PERSONAS.length} valid`);
  console.log(`TOTAL: ${totalMs}ms`);

  console.log(`METRIC total_wall_ms=${totalMs}`);
  console.log(`METRIC intake_ms=${intakeMs}`);
  console.log(`METRIC personas_ms=${personasMs}`);
  console.log(`METRIC synthesis_ms=${synthesisMs}`);
  if (slowest) console.log(`METRIC slowest_persona_ms=${slowest.ms}`);
  console.log(`METRIC completed_count=${completed.length}`);
  console.log(`METRIC synthesis_ok=${synthesisOk ? 1 : 0}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(`[bench] FATAL: ${err?.stack ?? err}`);
  process.exit(1);
});
