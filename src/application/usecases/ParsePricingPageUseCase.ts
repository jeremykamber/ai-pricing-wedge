import { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis, validatePricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export type PricingAnalysisProgressStep =
  | 'STARTING'
  | 'OPENING_PAGE'
  | 'FINDING_PRICING'
  | 'THINKING';

export interface PricingAnalysisProgress {
  step: PricingAnalysisProgressStep;
  screenshot?: string;
  personaName?: string;
  completedCount?: number;
  totalCount?: number;
  analysisToken?: string;
}

export class ParsePricingPageUseCase {
  private tempDir: string | null = null;
  private lastTempScreenshotPath: string | null = null;

  constructor(
    private readonly browserService: BrowserServicePort,
    private readonly llmService: LlmServicePort
  ) { }

  async execute(
    url: string,
    personas: Persona[],
    onProgress?: (progress: PricingAnalysisProgress) => void,
    abortSignal?: AbortSignal,
    options: {
      imageBase64?: string;
      tokenLimit?: number;
      runId?: string;
    } = {}
  ): Promise<PricingAnalysis[]> {
    const DEFAULT_TOKEN_LIMIT = 2000;
    const tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
    const runId = options.runId || 'unknown';
    const log = AnalysisLogger.forRun(runId);
    const overallStartTime = Date.now();

    log.info("ParsePricingPageUseCase", "=== USE CASE EXECUTE START ===", {
      url,
      personaCount: personas.length,
      tokenLimit,
      hasImageBase64: !!options.imageBase64,
    });

    // 1. Capture screenshot of the pricing page with adaptive scouting
    log.info("ParsePricingPageUseCase", "Starting adaptive scouting phase", { url });

    let capturedScreenshot = '';
    let pageHtml = '';
    let lastScoutingViewport = '';
    let scoutingPhaseDuration = 0;

    if (options.imageBase64) {
      log.info("ParsePricingPageUseCase", "Skipping browser scouting, using provided image...");
      capturedScreenshot = options.imageBase64;
      lastScoutingViewport = options.imageBase64;
      onProgress?.({ step: 'THINKING' });
    } else {
      const scoutingStart = Date.now();
      try {
        // Initialize temp directory for live screenshots
        this.tempDir = path.join(os.tmpdir(), `pricing-live-${Date.now()}`);
        await fs.mkdir(this.tempDir, { recursive: true });
        log.info("ParsePricingPageUseCase", "Created temp dir for live screenshots", { tempDir: this.tempDir });

        // Check if already cancelled
        if (abortSignal?.aborted) {
          log.warn("ParsePricingPageUseCase", "Request cancelled before starting scouting");
          throw new Error('Request cancelled before starting');
        }

        log.info("ParsePricingPageUseCase", "Navigating to URL via browser service...");
        const navStart = Date.now();
        await this.browserService.navigateTo(
          url,
          (status) => {
            if (abortSignal?.aborted) return;
            log.trace("ParsePricingPageUseCase", "Navigation status update", { status });
            if (status === 'SETTING_UP') onProgress?.({ step: 'STARTING' });
            if (status === 'LOADING_WEBSITE') onProgress?.({ step: 'OPENING_PAGE' });
          },
          async (liveScreenshotBase64) => {
            if (abortSignal?.aborted) return;
            // Handle live screenshot: save to temp file and notify
            const screenshotPath = path.join(this.tempDir!, `live-${Date.now()}.jpg`);
            const buffer = Buffer.from(liveScreenshotBase64, 'base64');
            await fs.writeFile(screenshotPath, buffer);

            // Delete previous temp screenshot
            if (this.lastTempScreenshotPath) {
              await fs.unlink(this.lastTempScreenshotPath).catch(() => { });
            }

            this.lastTempScreenshotPath = screenshotPath;
            log.trace("ParsePricingPageUseCase", "Live screenshot captured during nav", {
              savedTo: screenshotPath,
              base64Length: liveScreenshotBase64.length,
            });
            onProgress?.({ step: 'OPENING_PAGE', screenshot: liveScreenshotBase64 });
          }
        );
        log.info("ParsePricingPageUseCase", `Navigation completed in ${Date.now() - navStart}ms`);

        // 1. Initial Viewport Capture (Baseline)
        log.info("ParsePricingPageUseCase", "Capturing initial viewport...");
        const viewportStart = Date.now();
        lastScoutingViewport = await this.browserService.captureViewport();
        log.info("ParsePricingPageUseCase", `Initial viewport captured (${lastScoutingViewport.length} base64 chars) in ${Date.now() - viewportStart}ms`);
        onProgress?.({ step: 'FINDING_PRICING', screenshot: lastScoutingViewport });

        // 2. Get cleaned HTML for "Locator" strategy
        log.info("ParsePricingPageUseCase", "Getting cleaned HTML...");
        const htmlStart = Date.now();
        pageHtml = await this.browserService.getCleanedHtml();
        log.info("ParsePricingPageUseCase", `Cleaned HTML obtained (${pageHtml.length} chars) in ${Date.now() - htmlStart}ms`);

        log.info("ParsePricingPageUseCase", "Starting parallel HTML analysis: isPricingVisibleInHtml + summarizeHtml");
        const pricingLocationPromise = (this.llmService as any).isPricingVisibleInHtml(pageHtml, runId);
        const compactHtmlPromise = (this.llmService as any).summarizeHtml(pageHtml, runId);

        const pricingLocationStart = Date.now();
        const pricingLocation = await pricingLocationPromise;
        log.info("ParsePricingPageUseCase", `isPricingVisibleInHtml resolved in ${Date.now() - pricingLocationStart}ms`, {
          found: pricingLocation.found,
          selector: pricingLocation.selector || null,
          anchorText: pricingLocation.anchorText || null,
          reasoning: pricingLocation.reasoning,
        });

        let foundViaVision = false;

        // --- STRATEGY A: GUIDED STRIKE ---
        if (pricingLocation.found && (pricingLocation.selector || pricingLocation.anchorText)) {
          log.info("ParsePricingPageUseCase", `TARGETED STRIKE: ${pricingLocation.reasoning}`);
          log.info("ParsePricingPageUseCase", `Aiming for selector="${pricingLocation.selector}" anchorText="${pricingLocation.anchorText}"`);

          // A. Targeted Jump
          const elemLocStart = Date.now();
          const targetY = await this.browserService.getElementLocation(pricingLocation.selector, pricingLocation.anchorText);
          log.info("ParsePricingPageUseCase", `getElementLocation resolved in ${Date.now() - elemLocStart}ms: targetY=${targetY}`);

          if (targetY !== null) {
            // B. The Buffer Jump (1000px above)
            const bufferY = Math.max(0, targetY - 1000);
            log.info("ParsePricingPageUseCase", `Buffer jump to Y=${bufferY} (target was ${targetY})`);
            await this.browserService.scrollTo(bufferY);

            // C. The Stroll (Trigger lazy loads)
            log.info("ParsePricingPageUseCase", "Strolling to trigger lazy content (2x 500px scroll)...");
            const strollStart = Date.now();
            await this.browserService.scrollDown(500);
            await this.browserService.scrollDown(500);
            log.info("ParsePricingPageUseCase", `Stroll completed in ${Date.now() - strollStart}ms`);

            // B. Add small offset to center the pricing roughly
            const CENTER_OFFSET = 160;
            log.info("ParsePricingPageUseCase", `Centering with offset ${CENTER_OFFSET}px...`);
            await this.browserService.scrollDown(CENTER_OFFSET);

            // D. Vision Verification
            const verifyStart = Date.now();
            const viewportShot = await this.browserService.captureViewport();
            lastScoutingViewport = viewportShot;

            // Send live update
            onProgress?.({ step: 'FINDING_PRICING', screenshot: viewportShot });

            const SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE = true;
            const isHighConfidence = pricingLocation.selector?.startsWith('#') ||
              pricingLocation.selector?.toLowerCase().includes('pricing') ||
              pricingLocation.anchorText?.toLowerCase().includes('pricing');

            if (isHighConfidence && SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE) {
              log.info("ParsePricingPageUseCase", "HIGH CONFIDENCE HTML target. Skipping vision verification.");
              foundViaVision = true;
            } else {
              const visionCheckStart = Date.now();
              foundViaVision = await (this.llmService as any).isPricingVisible(viewportShot, runId);
              log.info("ParsePricingPageUseCase", `Vision verification completed in ${Date.now() - visionCheckStart}ms: ${foundViaVision ? 'POSITIVE' : 'NEGATIVE'}`);
            }
            log.info("ParsePricingPageUseCase", `Targeted strike verification took ${Date.now() - verifyStart}ms`);
          } else {
            log.warn("ParsePricingPageUseCase", "Target element not found in DOM. Falling through to linear scan.");
          }
        } else {
          log.info("ParsePricingPageUseCase", "No specific target found in HTML analysis. Proceeding to linear scan fallback.");
        }

        // --- STRATEGY B: FALLBACK LINEAR SCAN ---
        if (!foundViaVision) {
          log.info("ParsePricingPageUseCase", "Starting LINEAR SCROLL SCAN (fallback strategy)");
          // Reset to top to start clean
          await this.browserService.scrollTo(0);

          const MAX_SCROLLS = 8;
          const SCROLL_AMOUNT = 800;
          const CENTER_OFFSET = 160;

          for (let i = 0; i < MAX_SCROLLS; i++) {
            log.info("ParsePricingPageUseCase", `Linear scan step ${i + 1}/${MAX_SCROLLS}: capturing viewport...`);
            const viewport = await this.browserService.captureViewport();
            lastScoutingViewport = viewport;
            onProgress?.({ step: 'FINDING_PRICING', screenshot: viewport });

            // Check vision
            const scanCheckStart = Date.now();
            const isVisible = await (this.llmService as any).isPricingVisible(viewport, runId);
            log.info("ParsePricingPageUseCase", `Linear scan step ${i + 1}: isPricingVisible=${isVisible} (took ${Date.now() - scanCheckStart}ms)`);

            if (isVisible) {
              foundViaVision = true;
              log.info("ParsePricingPageUseCase", `FOUND pricing via linear scan at step ${i + 1}`);

              // Scroll a bit more to center the pricing for the final analysis screenshot
              log.info("ParsePricingPageUseCase", "Centering pricing for final capture...");
              await this.browserService.scrollDown(CENTER_OFFSET);
              lastScoutingViewport = await this.browserService.captureViewport();
              onProgress?.({ step: 'FINDING_PRICING', screenshot: lastScoutingViewport });

              break;
            }

            // Scroll
            log.trace("ParsePricingPageUseCase", `Scrolling down ${SCROLL_AMOUNT}px...`);
            await this.browserService.scrollDown(SCROLL_AMOUNT);
          }

          if (!foundViaVision) {
            log.warn("ParsePricingPageUseCase", `Pricing NOT found after ${MAX_SCROLLS} linear scrolls. Using last viewport.`);
          }
        }

        // 4. Resolve HTML summarization that ran concurrently
        log.info("ParsePricingPageUseCase", "Awaiting concurrent HTML compaction...");
        const compactStart = Date.now();
        const compactedHtml = await compactHtmlPromise;
        log.info("ParsePricingPageUseCase", `HTML compaction resolved in ${Date.now() - compactStart}ms (${compactedHtml?.length || 0} chars)`);

        // Use the last targeted viewport instead of full page
        capturedScreenshot = lastScoutingViewport;
        pageHtml = compactedHtml;

        scoutingPhaseDuration = Date.now() - scoutingStart;
        log.info("ParsePricingPageUseCase", `SCOUTING PHASE COMPLETE (${scoutingPhaseDuration}ms)`, {
          foundViaVision,
          finalScreenshotLength: capturedScreenshot?.length || 0,
          compactedHtmlLength: compactedHtml?.length || 0,
          strategiesUsed: foundViaVision ? (pricingLocation.found ? 'targeted_strike' : 'linear_scan') : 'failed_both',
        });

      } finally {
        // Ensure browser is closed even if scouting fails
        await this.browserService.close();

        // Clean up temp directory
        if (this.tempDir) {
          await fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => { });
          log.trace("ParsePricingPageUseCase", "Cleaned up temp dir");
        }
      }
    }

    // Check if cancelled before persona analysis
    if (abortSignal?.aborted) {
      log.warn("ParsePricingPageUseCase", "Request cancelled before persona analysis phase");
      throw new Error('Request cancelled before persona analysis');
    }

    // 2. Analyze the pricing page from each persona's perspective (Parallelized queue)
    const personaPhaseStart = Date.now();
    log.info("ParsePricingPageUseCase", `=== PERSONA ANALYSIS PHASE START === (${personas.length} personas)`);

    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(5);

    let finishedCount = 0;
    const totalCount = personas.length;

    log.info("ParsePricingPageUseCase", `Scouting complete. Starting persona analysis with concurrency=5 for ${totalCount} personas.`);

    // Initial broadcast
    onProgress?.({
      step: 'THINKING',
      totalCount,
      completedCount: 0
    });

    const settledResults = await Promise.allSettled(
      personas.map((persona, index) => limit(async () => {
        const personaStartTime = Date.now();
        const personaIndex = index;

        // Check if cancelled before persona analysis
        if (abortSignal?.aborted) {
          log.warn("ParsePricingPageUseCase", `Persona ${personaIndex} cancelled before start`);
          throw new Error('Request cancelled during persona analysis');
        }

        // Progress & logging
        onProgress?.({
          step: 'THINKING',
          personaName: persona.name,
          totalCount,
          completedCount: finishedCount
        });

        log.info("ParsePricingPageUseCase", `[Persona ${personaIndex + 1}/${totalCount}] ENTERING analysis slot`, {
          name: persona.name,
          id: persona.id,
          occupation: persona.occupation,
          pricingSensitivity: persona.pricingSensitivity,
          typicalBudget: persona.typicalBudget,
          bigFive: {
            conscientiousness: persona.conscientiousness,
            neuroticism: persona.neuroticism,
            openness: persona.openness,
            extraversion: persona.extraversion,
            agreeableness: persona.agreeableness,
          },
          backstoryLength: persona.backstory?.length || 0,
        });

        log.info("ParsePricingPageUseCase", `[${persona.name}] Analyzing with compacted HTML (${pageHtml?.length || 0} chars) and viewport screenshot (${capturedScreenshot?.length || 0} base64 chars)`);

        let analysisObj: any;

        // --- TWO-STAGE PIPELINE ---
        // Stage 1: Stream of consciousness (natural first-person thinking)
        // Stage 2a: Formatter → PricingAnalysis JSON (parallel with 2b)
        // Stage 2b: Summarizer → bullet points (parallel with 2a)
        try {
          log.info("ParsePricingPageUseCase", `[${persona.name}] Starting two-stage pipeline...`);
          const pipelineStart = Date.now();

          // Stage 1: Generate stream of consciousness
          const streamStart = Date.now();
          const stream = await this.llmService.generateStreamOfConsciousness(
            persona, capturedScreenshot, pageHtml, { tokenLimit, runId }
          );
          const streamDuration = Date.now() - streamStart;
          log.info("ParsePricingPageUseCase", `[${persona.name}] Stream of consciousness completed in ${streamDuration}ms`, {
            textLength: stream.text.length,
          });

          if (abortSignal?.aborted) throw new Error('Request cancelled during formatting');

          // Stage 2a + 2b: Format and summarize in parallel
          const [formattedAnalysis, summaryBullets] = await Promise.all([
            this.llmService.formatStreamOfConsciousness(persona, stream, { tokenLimit, runId }),
            this.llmService.summarizeStreamOfConsciousness(persona, stream, { runId }),
          ]);

          analysisObj = formattedAnalysis;
          analysisObj.summary = summaryBullets;

          const pipelineDuration = Date.now() - pipelineStart;
          log.info("ParsePricingPageUseCase", `[${persona.name}] Two-stage pipeline completed in ${pipelineDuration}ms`, {
            streamDurationMs: streamDuration,
            formatAndSummarizeDurationMs: pipelineDuration - streamDuration,
            hasGutReaction: !!analysisObj?.gutReaction,
            hasThoughts: !!analysisObj?.thoughts,
            scoreKeys: analysisObj?.scores ? Object.keys(analysisObj.scores) : null,
            riskCount: analysisObj?.risks?.length || 0,
            summaryBulletCount: summaryBullets.length,
          });
        } catch (err) {
          log.error("ParsePricingPageUseCase", `[${persona.name}] Error during analysis`, { error: String(err) });
          analysisObj = {
            gutReaction: "Honestly, I'm having a hard time focusing on this right now.",
            thoughts: "The analysis failed to complete properly.",
            scores: {
              clarity: 1, clarityReason: "Analysis error.",
              valuePerception: 1, valuePerceptionReason: "Analysis error.",
              trust: 1, trustReason: "Analysis error.",
              explorationIntent: 1, explorationIntentReason: "Analysis error.",
              analysisIntent: 1, analysisIntentReason: "Analysis error.",
              buyIntent: 1, buyIntentReason: "Analysis error.",
            },
            risks: ["[SYSTEM] Technical difficulty during analysis"],
            recommendations: [],
            aiSuggestion: "Analysis could not be completed — no suggestion available.",
            summary: [],
          };
        }

        if (abortSignal?.aborted) throw new Error('Request cancelled during persona analysis');

        finishedCount++;
        const personaDuration = Date.now() - personaStartTime;
        log.recordPersonaLatency(persona.name, personaDuration);
        log.info("ParsePricingPageUseCase", `[${persona.name}] COMPLETED in ${personaDuration}ms (finishedCount=${finishedCount}/${totalCount})`);

        onProgress?.({
          step: 'THINKING',
          personaName: persona.name,
          totalCount,
          completedCount: finishedCount
        });

        // Add metadata and IDs
        const fullAnalysis: PricingAnalysis = {
          ...analysisObj,
          rawAnalysis: analysisObj?.thoughts || "",
          id: `${persona.name.replace(/[\s-]+/g, '_')}-${Date.now()}`,
          url,
          screenshotBase64: lastScoutingViewport || capturedScreenshot,
        };

        // Validate
        if (!validatePricingAnalysis(fullAnalysis)) {
          log.warn("ParsePricingPageUseCase", `[${persona.name}] Validation FAILED for analysis`, {
            hasId: !!fullAnalysis.id,
            hasUrl: !!fullAnalysis.url,
            hasScreenshot: !!fullAnalysis.screenshotBase64,
            hasThoughts: !!fullAnalysis.thoughts,
            hasScores: !!fullAnalysis.scores,
            hasRisks: Array.isArray(fullAnalysis.risks),
            hasRecommendations: Array.isArray(fullAnalysis.recommendations),
            hasAiSuggestion: !!fullAnalysis.aiSuggestion,
          });
          // fallback to ensure it doesn't crash the whole process
          fullAnalysis.id = fullAnalysis.id || `${persona.name.replace(/[\s-]+/g, '_')}-${Date.now()}`;
          fullAnalysis.url = fullAnalysis.url || url;
          fullAnalysis.screenshotBase64 = fullAnalysis.screenshotBase64 || capturedScreenshot;
          fullAnalysis.thoughts = fullAnalysis.thoughts || "Analysis validation failed.";
          fullAnalysis.scores = fullAnalysis.scores || {
            clarity: 1, clarityReason: "Default fallback.",
            valuePerception: 1, valuePerceptionReason: "Default fallback.",
            trust: 1, trustReason: "Default fallback.",
            explorationIntent: 1, explorationIntentReason: "Default fallback.",
            analysisIntent: 1, analysisIntentReason: "Default fallback.",
            buyIntent: 1, buyIntentReason: "Default fallback.",
          };
          fullAnalysis.risks = fullAnalysis.risks || [];
          fullAnalysis.aiSuggestion = fullAnalysis.aiSuggestion || "No AI suggestion available.";
        } else {
          log.info("ParsePricingPageUseCase", `[${persona.name}] Validation PASSED`);
        }

        // Enrich with persona profile data (presentation layer only)
        fullAnalysis.personaProfile = {
          name: persona.name,
          occupation: persona.occupation,
          bigFive: {
            conscientiousness: persona.conscientiousness,
            neuroticism: persona.neuroticism,
            openness: persona.openness,
            extraversion: persona.extraversion,
            agreeableness: persona.agreeableness,
          },
          values: persona.values ? [...persona.values] : [],
          fears: persona.fears ? [...persona.fears] : [],
          communicationStyle: persona.communicationStyle ?? "",
          decisionStyle: persona.decisionStyle ?? "",
        };
        fullAnalysis.personaId = persona.id;

        return fullAnalysis;
      }))
    );

    const analyses: PricingAnalysis[] = [];
    for (let i = 0; i < settledResults.length; i++) {
      const result = settledResults[i];
      if (result.status === 'fulfilled') {
        analyses.push(result.value);
      } else {
        log.warn("ParsePricingPageUseCase", `Persona ${personas[i]?.name ?? i} analysis was abandoned`, {
          error: result.reason?.message ?? String(result.reason),
        });
      }
    }

    if (analyses.length === 0 && personas.length > 0) {
      log.error("ParsePricingPageUseCase", "All persona analyses failed — no results to return");
      throw new Error('All persona analyses failed');
    }

    const personaPhaseDuration = Date.now() - personaPhaseStart;
    const totalDuration = Date.now() - overallStartTime;

    log.info("ParsePricingPageUseCase", `=== PERSONA ANALYSIS PHASE COMPLETE ===`, {
      personaPhaseDurationMs: personaPhaseDuration,
      totalDurationMs: totalDuration,
      analysisCount: analyses.length,
      successCount: analyses.filter(a => !a.thoughts?.includes('error') && !a.thoughts?.includes('failed')).length,
    });

    log.info("ParsePricingPageUseCase", "=== USE CASE EXECUTE END ===");

    // Log persona latencies summary
    log.logPersonaSummary();

    return analyses;
  }
}
