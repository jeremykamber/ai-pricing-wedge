// @vitest-environment node
// Dashboard navigation smoke tests against the CURRENT UI (survey form default,
// freeform textarea toggle, demo batch, sidebar nav). Seeded with fresh state —
// no live LLM calls.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import type { ChildProcess } from 'child_process';
import { findOrStartServer, SCREENSHOT_DIR, ensureScreenshotDir, SERVER_TIMEOUT } from './helpers/server';
import path from 'path';

const TEST_TIMEOUT = 30_000;

let BASE_URL = '';
let browser: Browser;
let page: Page;
let serverProcess: ChildProcess | null = null;

beforeAll(async () => {
  const result = await findOrStartServer({ preferredPort: 3211 });
  BASE_URL = result.url;
  serverProcess = result.process;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await ensureScreenshotDir();
}, SERVER_TIMEOUT + 30_000);

afterAll(async () => {
  await browser?.close();
  if (serverProcess) serverProcess.kill('SIGTERM');
});

async function isVisible(selector: string, timeoutMs = 10_000): Promise<boolean> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

describe('Dashboard Navigation — E2E', { timeout: TEST_TIMEOUT }, () => {
  it('loads the marketing landing page', async () => {
    const response = await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });
    expect(response?.ok()).toBe(true);
  });

  it('shows the setup view with survey form for a fresh user', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    expect(await isVisible('h1:has-text("Define your target market")')).toBe(true);
    // Survey form is the default input path
    expect(await isVisible('input[placeholder*="Small business owners"]')).toBe(true);
  });

  it('shows Generate Personas disabled until the survey is complete', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    const generateBtn = page.locator('button:has-text("Generate Personas")').first();
    await generateBtn.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await generateBtn.isDisabled()).toBe(true);
  });

  it('switches to freeform mode and shows the audience textarea', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Use freeform description instead")').first().click();
    expect(await isVisible('textarea[placeholder*="B2B SaaS"]')).toBe(true);
  });

  it('disables Generate Personas in freeform mode when textarea is empty', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Use freeform description instead")').first().click();
    const generateBtn = page.locator('button:has-text("Generate Personas")').first();
    await generateBtn.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await generateBtn.isDisabled()).toBe(true);
  });

  it('enables Generate Personas in freeform mode when textarea has content', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Use freeform description instead")').first().click();
    const textarea = page.locator('textarea[placeholder*="B2B SaaS"]').first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('B2B SaaS founders dealing with high churn');

    const generateBtn = page.locator('button:has-text("Generate Personas")').first();
    expect(await generateBtn.isEnabled()).toBe(true);
  });

  it('shows the persona count input with a 1-20 range', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    const countInput = page.locator('#persona-count');
    await countInput.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await countInput.getAttribute('min')).toBe('1');
    expect(await countInput.getAttribute('max')).toBe('20');
  });

  it('navigates to interviews from the setup view link', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    await page.locator('button:has-text("Use freeform description instead")').first().click();
    await page.locator('a:has-text("Generate from interviews")').first().click();
    await page.waitForURL('**/dashboard/interviews', { timeout: 10_000 });
  });

  it('navigates between sidebar sections', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    // Personas → Interviews
    await page.locator('a[href="/dashboard/interviews"]').first().click();
    await page.waitForURL('**/dashboard/interviews', { timeout: 10_000 });

    // Interviews → Simulations
    await page.locator('a[href="/dashboard/simulations"]').first().click();
    await page.waitForURL('**/dashboard/simulations', { timeout: 10_000 });

    // Simulations → back to Personas via sidebar button
    await page.locator('nav button:has-text("Personas")').click();
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
  });

  it('loads the demo persona batch into the sidebar', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: TEST_TIMEOUT });

    const demoBtn = page.locator('button:has-text("Load Demo Persona Batch")').first();
    await demoBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await demoBtn.click();

    // Batch appears in the sidebar's Recent Batches section
    expect(await isVisible('aside:has-text("B2B SaaS Founders & Developers")')).toBe(true);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dashboard-demo-batch.png'),
      fullPage: true,
    });
  });
});
