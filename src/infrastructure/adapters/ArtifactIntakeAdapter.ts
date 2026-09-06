import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import type { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export type ArtifactInput =
  | { type: "url"; url: string }
  | { type: "screenshot"; imageBase64: string; url?: string };

export type IntakeProgress = "NAVIGATING" | "CAPTURING" | "PROCESSING" | "COMPLETE";

export type IntakeProgressCallback = (progress: IntakeProgress) => void;

export class ArtifactIntakeAdapter {
  constructor(
    private readonly browserService: BrowserServicePort,
    private readonly llmService: LlmServicePort,
  ) {}

  /**
   * Summarization is NOT on the critical path: the persona pipeline needs
   * only the screenshot (VisionAnalysisAdapter deliberately ignores summary/
   * pageHtml), and the summary's sole consumer is the nice-to-have title.
   * Summarizing inline added a serial 5-70s LLM round-trip to every URL run
   * before the first monologue could start. Capture returns immediately;
   * the summary rides along as a promise the title task awaits.
   */
  async intake(
    input: ArtifactInput,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<ArtifactIntake> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;

    log?.info("ArtifactIntakeAdapter", "Starting intake", { inputType: input.type });

    if (input.type === "url") {
      const { screenshotBase64, pageHtml, url } = await this.captureUrl(input.url, onProgress, runId);
      const summaryPromise = pageHtml
        ? this.llmService.summarizeHtml(pageHtml, runId)
        : Promise.resolve("");
      onProgress?.("COMPLETE");
      return { screenshotBase64, pageHtml, url, summaryPromise };
    }

    if (!input.imageBase64) {
      throw new Error("Cannot intake: screenshot data is missing");
    }

    onProgress?.("COMPLETE");

    // The client sends a full data URL (data:image/png;base64,...) from
    // FileReader.readAsDataURL.  Downstream adapters (VisionAnalysisAdapter,
    // LlmServiceImpl) wrap raw base64 with their own data-URL prefix, so we
    // must strip the prefix here to avoid double-wrapping.
    const rawBase64 = stripDataUrlPrefix(input.imageBase64);

    return {
      screenshotBase64: rawBase64,
      url: input.url,
    };
  }

  private async captureUrl(
    url: string,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<{ screenshotBase64: string; pageHtml?: string; url: string }> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;

    onProgress?.("NAVIGATING");

    try {
      await this.browserService.navigateTo(url, (status) => {
        log?.trace("ArtifactIntakeAdapter", "Navigation status", { status });
      });

      onProgress?.("CAPTURING");

      const [screenshotBase64, cleanedHtml] = await Promise.all([
        this.browserService.captureViewport(),
        this.browserService.getCleanedHtml(),
      ]);

      if (!cleanedHtml) {
        return { screenshotBase64, url };
      }

      onProgress?.("PROCESSING");

      log?.info("ArtifactIntakeAdapter", "HTML captured for background summarization", {
        htmlLength: cleanedHtml.length,
      });

      return {
        screenshotBase64,
        pageHtml: cleanedHtml,
        url,
      };
    } finally {
      try {
        await this.browserService.close();
      } catch (closeErr) {
        log?.warn("ArtifactIntakeAdapter", "Error closing browser", {
          error: String(closeErr),
        });
      }
    }
  }
}

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl;
  return dataUrl.slice(commaIndex + 1);
}

