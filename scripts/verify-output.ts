/**
 * Verify Kynd's real output pipelines (persona generation, artifact analysis)
 * and save the raw output to disk for AI judging.
 *
 * This is a harness, not a judge: it runs the real LLM pipeline and checks
 * structure (fields present, counts, stage order). Semantic judging — "does
 * the output satisfy the requirements" — is done by the agent applying the
 * verify-kynd skill rubric to the saved JSON.
 *
 * Usage (requires .env with OPENROUTER_API_KEY; PLAYWRIGHT_WS_ENDPOINT only
 * for URL-based artifact runs):
 *
 *   bun scripts/verify-output.ts persona --description "B2B SaaS founders" --count 3
 *   bun scripts/verify-output.ts artifact --url https://example.com --description "..." --count 3
 *   bun scripts/verify-output.ts artifact --url https://example.com --personas-file ./personas.json
 *   bun scripts/verify-output.ts artifact --image ./screenshot.png --description "..." --count 3
 *
 * Persona mode defaults to `strategy` (single LLM call, fast). Use
 * `--mode legacy` to run the app's default multi-call pipeline, or
 * `--mode research` for research-mode personas.
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Personas/responses come from the live LLM and are validated at runtime;
 * the structural checks here intentionally probe for missing fields, so
 * loose typing is the point. */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve(process.cwd(), '.sisyphus', 'verify');

const REQUIRED_PERSONA_FIELDS = [
  'id', 'name', 'age', 'occupation', 'educationLevel', 'interests', 'goals',
  'conscientiousness', 'neuroticism', 'openness', 'extraversion', 'agreeableness',
  'values', 'fears', 'communicationStyle', 'decisionStyle', 'backstory',
];

const BIG_FIVE = ['conscientiousness', 'neuroticism', 'openness', 'extraversion', 'agreeableness'] as const;

const COGNITIVE_STAGES = ['interpretation', 'understanding', 'belief', 'motivation', 'action'];

// ── CLI parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = { _: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      (args._ as string[]).push(a);
    }
  }
  return args;
}

function fail(msg: string): never {
  console.error(`[verify-output] ${msg}`);
  process.exit(1);
}

// ── Structural checks ───────────────────────────────────────────────────────

function checkPersonas(personas: any[]): { pass: string[]; fail: string[] } {
  const pass: string[] = [];
  const fail: string[] = [];

  pass.push(`count: ${personas.length}`);
  if (personas.length === 0) {
    fail.push('no personas returned');
    return { pass, fail };
  }

  const names = personas.map((p) => p?.name).filter(Boolean);
  pass.push(`names: ${names.join(', ')}`);

  const missingByPersona = personas.map((p, i) => {
    const missing = REQUIRED_PERSONA_FIELDS.filter((f) => {
      const v = p?.[f];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    return { index: i, name: p?.name ?? `#${i}`, missing };
  });

  const allMissing = missingByPersona.flatMap((m) => m.missing);
  if (allMissing.length === 0) {
    pass.push('required fields: all present');
  } else {
    for (const m of missingByPersona) {
      if (m.missing.length > 0) {
        fail.push(`${m.name}: missing ${m.missing.join(', ')}`);
      }
    }
  }

  const outOfRange = personas.flatMap((p, i) =>
    BIG_FIVE.filter((trait) => {
      const v = p?.[trait];
      return typeof v !== 'number' || v < 0 || v > 100;
    }).map((trait) => `persona #${i + 1} ${trait}=${p?.[trait]}`)
  );
  if (outOfRange.length === 0) {
    pass.push('big five: all in 0-100 range');
  } else {
    fail.push(`big five out of range: ${outOfRange.join('; ')}`);
  }

  const duplicateNames = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicateNames.length === 0) {
    pass.push('names: all distinct');
  } else {
    fail.push(`duplicate names: ${duplicateNames.join(', ')}`);
  }

  return { pass, fail };
}

function checkResponses(responses: any[]): { pass: string[]; fail: string[] } {
  const pass: string[] = [];
  const fail: string[] = [];

  pass.push(`responses: ${responses.length}`);
  if (responses.length === 0) {
    fail.push('no responses returned');
    return { pass, fail };
  }

  const completed = responses.filter((r) => r?.overview && r?.customerJourney?.length > 0).length;
  const failed = responses.length - completed;
  pass.push(`completed: ${completed} / failed: ${failed}`);

  for (const [i, r] of responses.entries()) {
    const journey = r?.customerJourney ?? [];
    const stages = journey.map((s: any) => s?.stage);
    const ordered = COGNITIVE_STAGES.every((s, idx) => stages[idx] === s);
    const hasAllFields = journey.every(
      (s: any) => s?.description && s?.sentiment && s?.outcome
    );
    const personaName = r?.personaProfile?.name ?? `#${i + 1}`;
    if (ordered && hasAllFields && journey.length === COGNITIVE_STAGES.length) {
      pass.push(`${personaName}: 5/5 stages in order, all fields present`);
    } else {
      fail.push(
        `${personaName}: stages=${journey.length} ordered=${ordered} completeFields=${hasAllFields}`
      );
    }

    const requiredResponseFields = [
      'overview', 'researchQuestionAnswer', 'majorFindings', 'pointsOfFriction',
      'unansweredQuestions', 'screenshotBase64', 'rawAnalysis',
    ];
    const missing = requiredResponseFields.filter((f) => {
      const v = r?.[f];
      return v === undefined || v === null || (Array.isArray(v) && v.length === 0);
    });
    if (missing.length === 0) {
      pass.push(`${personaName}: all response fields present`);
    } else {
      fail.push(`${personaName}: missing ${missing.join(', ')}`);
    }
  }

  return { pass, fail };
}

function checkSynthesis(synthesis: any, totalPersonaCount: number): { pass: string[]; fail: string[] } {
  const pass: string[] = [];
  const fail: string[] = [];

  if (!synthesis) {
    fail.push('synthesis missing');
    return { pass, fail };
  }
  pass.push(`completedCount: ${synthesis.completedCount}/${totalPersonaCount}`);

  if (synthesis.researchQuestionAnswer) pass.push('researchQuestionAnswer present');
  else fail.push('researchQuestionAnswer missing');

  if (Array.isArray(synthesis.topFindings) && synthesis.topFindings.length > 0)
    pass.push(`topFindings: ${synthesis.topFindings.length}`);
  else fail.push('topFindings missing/empty');

  if (Array.isArray(synthesis.disagreements) && synthesis.disagreements.length > 0)
    pass.push(`disagreements: ${synthesis.disagreements.length}`);
  else fail.push('disagreements missing/empty');

  if (Array.isArray(synthesis.biggestFrictions) && synthesis.biggestFrictions.length > 0)
    pass.push(`biggestFrictions: ${synthesis.biggestFrictions.length}`);
  else fail.push('biggestFrictions missing/empty');

  return { pass, fail };
}

function report(label: string, checks: { pass: string[]; fail: string[] }): void {
  console.log(`\n[${label}]`);
  for (const line of checks.pass) console.log(`  PASS  ${line}`);
  for (const line of checks.fail) console.log(`  FAIL  ${line}`);
}

// ── Modes ───────────────────────────────────────────────────────────────────

async function generatePersonas(description: string, count: number, modeArg: string | undefined) {
  const { GeneratePersonasUseCase } = await import('@/application/usecases/GeneratePersonasUseCase');
  const { LlmServiceImpl } = await import('@/infrastructure/adapters/LlmServiceImpl');

  const mode = modeArg === 'research' || modeArg === 'legacy' ? modeArg : 'strategy';
  const llm = LlmServiceImpl.createFromEnv('openrouter');
  const useCase = new GeneratePersonasUseCase(llm);
  return useCase.execute(
    description,
    (p) => {
      if (p.step) console.log(`  [progress] ${p.step}${p.personaName ? ` — ${p.personaName}` : ''}`);
    },
    count,
    undefined,
    mode === 'legacy' ? undefined : (mode as 'research' | 'strategy'),
  );
}

async function runPersonaMode(args: Record<string, unknown>): Promise<void> {
  const description = args.description as string | undefined;
  if (!description) fail('persona mode requires --description "<audience description>"');
  const count = Math.min(20, Math.max(1, parseInt(String(args.count ?? '3'), 10) || 3));

  const personas = await generatePersonas(description, count, args.mode as string | undefined);

  const checks = checkPersonas(personas);
  report('persona', checks);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.resolve(args.out as string ?? path.join(OUT_DIR, `${timestamp}-persona.json`));
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(
    outPath,
    JSON.stringify({ mode: 'persona', createdAt: new Date().toISOString(), description, personas }, null, 2)
  );
  console.log(`\nsaved: ${outPath}`);
}

async function runArtifactMode(args: Record<string, unknown>): Promise<void> {
  const url = args.url as string | undefined;
  const image = args.image as string | undefined;
  if (!url && !image) fail('artifact mode requires --url <url> or --image <path>');
  if (url && image) fail('provide only one of --url or --image');

  const businessGoal = String(args['business-goal'] ?? 'Understand how this artifact persuades its audience.');
  const researchQuestion = String(args['research-question'] ?? 'What prevents visitors from taking the desired action?');

  // Personas: from file, or generated inline from a description.
  let personas: any[];
  if (args['personas-file']) {
    const raw = await fs.promises.readFile(String(args['personas-file']), 'utf-8');
    personas = JSON.parse(raw);
    if (!Array.isArray(personas)) fail('--personas-file must contain a JSON array of personas');
  } else {
    const description = args.description as string | undefined;
    if (!description) fail('artifact mode requires --description or --personas-file');
    const count = Math.min(20, Math.max(1, parseInt(String(args.count ?? '3'), 10) || 3));

    personas = await generatePersonas(description, count, args.mode as string | undefined);

    const personaChecks = checkPersonas(personas);
    report('persona', personaChecks);
  }

  const input = image
    ? { type: 'screenshot' as const, imageBase64: (await fs.promises.readFile(path.resolve(String(image)))).toString('base64'), url: path.basename(String(image)) }
    : { type: 'url' as const, url: String(url) };

  const { AnalyzeArtifactUseCase } = await import('@/application/usecases/AnalyzeArtifactUseCase');
  const { ArtifactIntakeAdapter } = await import('@/infrastructure/adapters/ArtifactIntakeAdapter');
  const { RemotePlaywrightAdapter } = await import('@/infrastructure/adapters/RemotePlaywrightAdapter');
  const { LlmServiceImpl } = await import('@/infrastructure/adapters/LlmServiceImpl');
  const { SynthesizeArtifactResultsUseCase } = await import('@/application/usecases/synthesizeArtifactResults');

  const llm = LlmServiceImpl.createFromEnv('openrouter');
  const browserService = RemotePlaywrightAdapter.createFromEnv();
  const intakeAdapter = new ArtifactIntakeAdapter(browserService, llm);
  const useCase = new AnalyzeArtifactUseCase(intakeAdapter, llm);

  const runId = `verify-${Date.now()}`;
  console.log(`\n[artifact] analyzing ${input.type} (${image ? path.basename(String(image)) : url}) with ${personas.length} personas...`);

  const responses = await useCase.execute(
    input,
    personas,
    businessGoal,
    researchQuestion,
    (p) => {
      if (p.personaName) console.log(`  [progress] ${p.personaName}`);
    },
    undefined,
    { runId },
  );

  const completed = responses.filter((r) => r.overview && r.customerJourney.length > 0 && !r.overview.startsWith("Analysis could not be completed."));
  const synthesis = completed.length > 0 ? await new SynthesizeArtifactResultsUseCase(llm).execute(completed, researchQuestion, { runId }) : null;


  report('artifact', checkResponses(responses));
  report('synthesis', checkSynthesis(synthesis, responses.length));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.resolve(args.out as string ?? path.join(OUT_DIR, `${timestamp}-artifact.json`));
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(
    outPath,
    JSON.stringify({
      mode: 'artifact',
      createdAt: new Date().toISOString(),
      runId,
      input: { type: input.type, url: input.url },
      businessGoal,
      researchQuestion,
      personas: { count: personas.length, names: personas.map((p) => p.name) },
      responses,
      synthesis,
    }, null, 2)
  );
  console.log(`\nsaved: ${outPath}`);
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = (args._ as string[])[0];

  console.log(`[verify-output] mode=${mode} pid=${process.pid}`);

  switch (mode) {
    case 'persona':
      await runPersonaMode(args);
      break;
    case 'artifact':
      await runArtifactMode(args);
      break;
    default:
      fail('usage: verify-output.ts <persona|artifact> [--description "..."] [--count N] [--url <url> | --image <path>] [--personas-file <path>] [--out <path>]');
  }
}

main().catch((err) => {
  console.error(`[verify-output] error:`, err instanceof Error ? err.message : err);
  process.exit(1);
});
