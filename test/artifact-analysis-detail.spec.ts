// @vitest-environment node
// Completed artifact-analysis rendering, verified by seeding the simulation
// store (IndexedDB) with a full completed run. No live LLM calls — deterministic.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { ChildProcess } from 'child_process';
import { findOrStartServer, SERVER_TIMEOUT } from './helpers/server';

const TEST_TIMEOUT = 30_000;
let BASE_URL = '';
let browser: Browser;
let serverProcess: ChildProcess | null = null;

const SIM_ID = 'seeded-sim-1';
const SIM_NAME = 'Pricing page — example.com';
const STAGES = ['interpretation', 'understanding', 'belief', 'motivation', 'action'] as const;

function buildStage(stage: string, i: number) {
  return {
    stage,
    description: `Stage ${i + 1} (${stage}): what this persona experienced.`,
    sentiment: 'neutral' as const,
    outcome: 'succeeded' as const,
    transition: `Transitioned because of signal ${i + 1}.`,
  };
}

function buildPersonaResponse(id: string, name: string, occupation: string) {
  return {
    id,
    screenshotBase64: 'data:image/png;base64,AAAA',
    rawAnalysis: `Raw cognitive stream for ${name}.`,
    overview: `${name} found the page clear but hesitated on price transparency.`,
    customerJourney: STAGES.map(buildStage),
    researchQuestionAnswer: `${name} would continue but wants pricing upfront.`,
    majorFindings: [
      { observation: 'Pricing was unclear', evidence: `${name} paused at the pricing section.`, impact: 'Reduced trust in the offer.' },
    ],
    pointsOfFriction: ['Pricing is unclear'],
    unansweredQuestions: ['What does it cost per seat?'],
    personaProfile: {
      name,
      occupation,
      bigFive: {
        conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60,
      },
      values: ['Transparency', 'Efficiency'],
      fears: ['Hidden costs'],
      communicationStyle: 'direct',
      decisionStyle: 'data-driven',
    },
  };
}

function buildSynthesis() {
  return {
    overview: 'Both personas reached the motivation stage but flagged pricing clarity.',
    researchQuestionAnswer: 'The page persuades, but pricing opacity holds personas back from action.',
    topFindings: [
      {
        observation: 'Pricing opacity blocks action',
        evidence: 'Both personas asked about cost before deciding.',
        impact: 'Users stop short of conversion.',
        confidence: 'strongly supported' as const,
        affectedPersonaCount: 2,
        totalPersonaCount: 2,
      },
    ],
    disagreements: [
      { topic: 'Would they return?', split: [{ view: 'Yes', personaCount: 1 }, { view: 'Only if prices are listed', personaCount: 1 }], significance: 'Medium' as const },
    ],
    biggestFrictions: ['Pricing is hidden behind a demo request.'],
    completedCount: 2,
    failedCount: 0,
    totalPersonaCount: 2,
  };
}

function buildPersistedState() {
  return JSON.stringify({
    state: {
      simulations: [
        {
          id: SIM_ID,
          name: SIM_NAME,
          url: 'https://example.com/pricing',
          status: 'COMPLETED',
          personaCount: 2,
          personaNames: ['Sarah Chen', 'Marcus Lee'],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          completedAnalyses: 2,
          analyses: [buildPersonaResponse('r-1', 'Sarah Chen', 'Senior Engineer'), buildPersonaResponse('r-2', 'Marcus Lee', 'Product Manager')],
          synthesis: buildSynthesis(),
        },
      ],
      dismissedSimulationIds: [],
    },
    version: 2,
  });
}

// idb-keyval default store: DB "keyval-store", store "keyval", key = storage name.
async function seedSimulationStore(page: Page) {
  await page.addInitScript((seed) => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open('keyval-store');
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('keyval')) {
          req.result.createObjectStore('keyval');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(seed, 'simulation-storage');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }, buildPersistedState());
}

async function isVisible(page: Page, selector: string, timeoutMs = 10_000): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  const result = await findOrStartServer({ preferredPort: 3212 });
  BASE_URL = result.url;
  serverProcess = result.process;
  browser = await chromium.launch({ headless: true });
}, SERVER_TIMEOUT + 30_000);

afterAll(async () => {
  await browser?.close();
  if (serverProcess) serverProcess.kill('SIGTERM');
});

describe('Artifact Analysis Detail — E2E', { timeout: TEST_TIMEOUT }, () => {
  it('shows the empty state on the simulations list for a fresh user', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${BASE_URL}/dashboard/simulations`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });
    expect(await isVisible(page, 'text=No analyses yet')).toBe(true);
    await page.close();
  });

  it('lists a completed simulation from the seeded store', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSimulationStore(page);
    await page.goto(`${BASE_URL}/dashboard/simulations`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    expect(await isVisible(page, `text=${SIM_NAME}`)).toBe(true);
    await page.close();
  });

  it('renders the completed analysis with synthesis and per-persona reports', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSimulationStore(page);
    await page.goto(`${BASE_URL}/dashboard/simulations/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    // Executive synthesis
    expect(await isVisible(page, 'text=Completed: 2/2')).toBe(true);
    expect(await isVisible(page, 'text=Research Question')).toBe(true);
    expect(await isVisible(page, 'text=Top Findings')).toBe(true);
    expect(await isVisible(page, 'text=Disagreements — Where Personas Split')).toBe(true);
    expect(await isVisible(page, 'text=Biggest Friction Points')).toBe(true);

    // Per-persona reports
    expect(await isVisible(page, 'text=Individual Persona Reports')).toBe(true);
    expect(await isVisible(page, 'text=Sarah Chen')).toBe(true);
    expect(await isVisible(page, 'text=Marcus Lee')).toBe(true);

    // Chat-after-simulation affordances
    expect(await isVisible(page, 'text=Ask the whole audience')).toBe(true);
    await page.close();
  });

  it('opens the panel chat and offers suggested questions', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSimulationStore(page);
    await page.goto(`${BASE_URL}/dashboard/simulations/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Ask the whole audience")').first().click();
    expect(await isVisible(page, 'text=Ask the simulated users')).toBe(true);
    expect(await isVisible(page, 'text=Show me the dissenting opinions.')).toBe(true);
    expect(await isVisible(page, 'text=Findings describe simulated users — hypotheses to test, not proof about real users.')).toBe(true);
    await page.close();
  });

  it('expands a persona report and renders its overview', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSimulationStore(page);
    await page.goto(`${BASE_URL}/dashboard/simulations/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Sarah Chen")').first().click();
    expect(await isVisible(page, 'text=Sarah Chen found the page clear but hesitated on price transparency.')).toBe(true);
    expect(await isVisible(page, 'text=Ask Sarah Chen about what they saw')).toBe(true);
    await page.close();
  });

  it('renders the completed analysis on a mobile viewport without crashing', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await seedSimulationStore(page);
    await page.goto(`${BASE_URL}/dashboard/simulations/${SIM_ID}`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('Hydration failed')) pageErrors.push(err.message);
    });

    expect(await isVisible(page, 'text=Completed: 2/2')).toBe(true);
    expect(await isVisible(page, 'text=Sarah Chen')).toBe(true);
    expect(pageErrors).toHaveLength(0);
    await page.close();
  });
});
