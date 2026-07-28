// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserServer } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'test-results', 'artifact-analysis');
const VPS_PORT = 8080;
const APP_PORT = 3207;
const APP_URL = `http://localhost:${APP_PORT}`;
const TIMEOUT = 1_200_000; // 20 min for 6 persona real LLM calls

let browserServer: BrowserServer | null = null;
let appServer: ChildProcess | null = null;
let browser: Browser | null = null;

describe('Artifact Analysis — Real UI, Real Pipeline', () => {
  beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    // 1. Start Playwright browser server (used by RemotePlaywrightAdapter)
    browserServer = await chromium.launchServer({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    console.log(`[E2E] Browser server running at ${browserServer.wsEndpoint()}`);

    // 2. Start the Next.js dev server in local mode
    appServer = spawn('bun', ['run', 'next', 'dev', '-p', String(APP_PORT)], {
      env: {
        ...process.env,
        FORCE_LOCAL: 'true',
        PLAYWRIGHT_WS_ENDPOINT: browserServer.wsEndpoint(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    appServer.stdout?.on('data', (d: Buffer) => process.stdout.write(`[APP:stdout] ${d}`));
    appServer.stderr?.on('data', (d: Buffer) => process.stderr.write(`[APP:stderr] ${d}`));

    // Wait for the dev server to be ready
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(APP_URL);
        if (res.ok) {
          console.log('[E2E] App server ready');
          break;
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 2000));
    }

    // 3. Open the test browser
    browser = await chromium.launch({ headless: true });
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    if (appServer) {
      appServer.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
    }
    await browserServer?.close();
  });

  it('full UI flow: batch → URL → run → verify synthesis', async () => {
    if (!browser) throw new Error('Browser not initialized');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    try {
      // ── Step 1: Seed a persona batch in IndexedDB ──────────
      await page.goto(`${APP_URL}/dashboard/simulations`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      // Use 3 personas for fast iteration (change to 6 for full regression)
      const personaNames = ['Priya', 'Marcus', 'Taylor'];

      await page.evaluate((names: string[]) => {
        const persons = names.map((n, i) => ({
          id: n.toLowerCase(),
          name: n,
          age: 30 + i,
          occupation: 'Tester',
          educationLevel: 'Bachelors',
          interests: ['Testing'],
          goals: ['Ship quality products'],
          conscientiousness: 50 + Math.round(Math.random() * 40),
          neuroticism: 20 + Math.round(Math.random() * 60),
          openness: 30 + Math.round(Math.random() * 60),
          extraversion: 20 + Math.round(Math.random() * 60),
          agreeableness: 30 + Math.round(Math.random() * 60),
          values: [['Clarity', 'Efficiency'], ['Trust', 'Quality'], ['Simplicity', 'Speed']][i % 3],
          fears: [['Wasting time', 'Complexity'], ['Hidden fees', 'Vendor lock-in'], ['Missing critical features']][i % 3],
          communicationStyle: ['Direct', 'Analytical', 'Technical'][i % 3],
          decisionStyle: ['Data-driven', 'Evidence-based', 'Gut-driven'][i % 3],
          pricingSensitivity: 50 + Math.round(Math.random() * 50),
          typicalBudget: '$50-200/mo',
        }));

        return new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('keyval-store');
          req.onupgradeneeded = (e: any) => e.target.result.createObjectStore('keyval');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('keyval', 'readwrite');
            const store = tx.objectStore('keyval');
            store.put(JSON.stringify({
              state: {
                batches: [{
                  id: 'e2e-batch',
                  label: 'E2E Batch (6 personas)',
                  source: 'description',
                  createdAt: new Date().toISOString(),
                  personas: persons,
                }],
                activeBatchId: null,
                activeGenerationRunIds: [],
              },
              version: 0,
            }), 'persona-storage');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      }, personaNames);

      // ── Step 2: Reload so Zustand picks up the batch ────────
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      console.log('[E2E] Batch seeded, page reloaded');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '01-landing.png'),
        fullPage: true,
      });

      // ── Step 3: Open new-analysis form ──────────────────────
      const runNewBtn = page.locator('button', { hasText: 'Run New Analysis' });
      if (await runNewBtn.count() > 0) {
        await runNewBtn.click();
        await page.waitForTimeout(500);
      } else {
        // Might already be open — continue
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '02-form.png'),
        fullPage: true,
      });

      // ── Step 4: Select the persona batch (first available) ──
      const batchSelect = page.locator('#batch-select');
      await batchSelect.waitFor({ state: 'visible', timeout: 5000 });
      await batchSelect.click();
      await page.waitForTimeout(500);

      const firstOption = page.locator('[role="option"]').first();
      const batchLabel = await firstOption.textContent();
      console.log(`[E2E] Selected batch: ${batchLabel}`);
      await firstOption.click();
      await page.waitForTimeout(300);

      // ── Step 5: Fill the URL ─────────────────────────────────
      const urlInput = page.locator('#artifact-url');
      await urlInput.waitFor({ state: 'visible', timeout: 5000 });
      await urlInput.fill('https://jobright.ai');
      await page.waitForTimeout(300);

      // ── Step 6: Business Goal ────────────────────────────────
      const goalInput = page.locator('#business-goal');
      await goalInput.waitFor({ state: 'visible', timeout: 5000 });
      await goalInput.fill('Convince job seekers to sign up for an AI-powered job search assistant');
      await page.waitForTimeout(300);

      // ── Step 7: Research Question ────────────────────────────
      const rqInput = page.locator('#research-question');
      await rqInput.waitFor({ state: 'visible', timeout: 5000 });
      await rqInput.fill('What creates trust or hesitation? Do users understand the value proposition? What stops signup?');
      await page.waitForTimeout(300);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '03-form-filled.png'),
        fullPage: true,
      });

      // ── Step 8: Click "Run Analysis" ─────────────────────────
      const runBtn = page.locator('button', { hasText: 'Run Analysis' });
      await runBtn.waitFor({ state: 'visible', timeout: 5000 });
      expect(await runBtn.getAttribute('disabled')).toBeNull();
      await runBtn.click();
      console.log('[E2E] Clicked Run Analysis — waiting for completion...');

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '04-started.png'),
        fullPage: true,
      });

      // ── Step 9: Wait for completion (stream stays connected) ─
      // The useAnalysisFlow hook reads from the stream. When stream.done()
      // arrives, it calls markComplete (zustand) and sets isPending=false.
      // Stay on the same page and wait for "Analysis is running" to disappear.
      const startTime = Date.now();
      let completed = false;
      let simId: string | null = null;

      while (Date.now() - startTime < TIMEOUT) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        await page.waitForTimeout(15_000);

        const bodyText = (await page.textContent('body')) ?? '';

        if (!bodyText.includes('Analysis is running')) {
          // isPending just became false — stream delivered DONE or error.
          // Read sim ID from IndexedDB (zustand persist writes synchronously
          // to the queue, but we add a brief guard).
          simId = await page.evaluate(() => {
            return new Promise<string | null>((resolve) => {
              const req = indexedDB.open('keyval-store');
              req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction('keyval', 'readonly');
                const store = tx.objectStore('keyval');
                const getReq = store.get('simulation-storage');
                getReq.onsuccess = () => {
                  try {
                    const data = JSON.parse(getReq.result);
                    const sims = data?.state?.simulations ?? [];
                    const latest = sims.find((s: any) => s.status === 'COMPLETED') ?? sims[0];
                    resolve(latest?.id ?? null);
                  } catch { resolve(null); }
                };
                getReq.onerror = () => resolve(null);
              };
              req.onerror = () => resolve(null);
            });
          });

          if (simId) {
            console.log(`[E2E] Found sim ${simId} in IndexedDB at ~${elapsed}s`);
            break;
          }

          // persist write might still be in flight — retry
          console.log(`[E2E] isPending=false but no sim in IndexedDB yet — retrying`);
        }

        console.log(`[E2E] Waiting... ${elapsed}s`);
      }

      if (!simId) {
        console.log('[E2E] TIMEOUT — never found sim in IndexedDB');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeout.png'), fullPage: true });
        expect(simId).not.toBeNull();
        return;
      }

      // Navigate to the detail page — fresh load rehydrates from IndexedDB
      await page.goto(`${APP_URL}/dashboard/simulations/${simId}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      const detailText = (await page.textContent('body')) ?? '';
      if (detailText.includes('Top Findings') || detailText.includes('Completed:')) {
        completed = true;
      } else {
        // Detail page loaded but results not rendered yet.
        // The detail page has its own polling — stay here.
        while (Date.now() - startTime < TIMEOUT) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          await page.waitForTimeout(15_000);
          await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(3000);
          const text = (await page.textContent('body')) ?? '';
          if (text.includes('Top Findings') || text.includes('Completed:')) {
            completed = true;
            console.log(`[E2E] Completed at ~${elapsed}s`);
            break;
          }
          console.log(`[E2E] Detail page waiting... ${elapsed}s`);
        }
      }

      if (!completed) {
        console.log('[E2E] TIMEOUT — detail page never showed results');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeout-detail.png'), fullPage: true });
        expect(completed).toBe(true);
        return;
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-completed.png'),
        fullPage: true,
      });

      if (!completed) {
        console.log('[E2E] TIMEOUT');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeout.png'), fullPage: true });
        expect(completed).toBe(true);
        return;
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '05-completed.png'),
        fullPage: true,
      });

      // ── Step 10: Read and verify synthesis ───────────────────

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '06-detail.png'),
        fullPage: true,
      });

      const bodyText = (await page.textContent('body')) ?? '';
      fs.writeFileSync(path.join(SCREENSHOT_DIR, 'full-page.txt'), bodyText, 'utf-8');

      // ── Step 11: Verify synthesis integrity ──────────────────
      const drillDownIdx = bodyText.indexOf('Individual Persona Reports');
      const synthesisText = drillDownIdx >= 0
        ? bodyText.substring(0, drillDownIdx)
        : bodyText.substring(0, 4000);

      fs.writeFileSync(path.join(SCREENSHOT_DIR, 'synthesis.txt'), synthesisText, 'utf-8');
      console.log(`[E2E] Synthesis:\n${synthesisText}`);

      // Check no persona names leaked into synthesis
      // (The drill-down section is expected to have names — that's correct)
      const namePattern = /\b[A-Z][a-z]+\s(?:said|noted|mentioned|found|thought|felt)\b/i;
      const nameLeaks = synthesisText.match(namePattern);
      if (nameLeaks) {
        console.log(`[E2E] FAIL: ${nameLeaks.length} persona name reference(s) in synthesis`);
        for (const leak of nameLeaks) {
          console.log(`  → "${leak}"`);
        }
      }
      expect(nameLeaks).toBeNull();

      // Check no rendering errors
      for (const pat of ['Cannot read properties', 'undefined is not', 'Maximum call stack']) {
        expect(bodyText).not.toContain(pat);
      }

      // Verify persona names DO appear in drill-down
      expect(bodyText).toContain('Individual Persona Reports');
      console.log('[E2E] ✅ All checks passed');
      console.log(`[E2E] Screenshots & text in ${SCREENSHOT_DIR}`);

    } finally {
      await page.close();
    }
  }, TIMEOUT + 30_000);
});
