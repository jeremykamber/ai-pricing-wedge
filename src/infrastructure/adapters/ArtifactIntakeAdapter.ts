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

  async intake(
    input: ArtifactInput,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<ArtifactIntake> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;

    log?.info("ArtifactIntakeAdapter", "Starting intake", { inputType: input.type });

    if (input.type === "url") {
      if (!input.url.trim()) {
        throw new Error("Cannot intake: URL is empty");
      }
      return this.urlIntake(input.url, onProgress, runId);
    }

    if (!input.imageBase64) {
      throw new Error("Cannot intake: screenshot data is missing");
    }

    onProgress?.("COMPLETE");

    return {
      screenshotBase64: input.imageBase64,
      url: input.url,
    };
  }

  private async urlIntake(
    url: string,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<ArtifactIntake> {
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
        onProgress?.("COMPLETE");
        return { screenshotBase64, url };
      }

      onProgress?.("PROCESSING");

      log?.info("ArtifactIntakeAdapter", "Summarizing HTML", {
        htmlLength: cleanedHtml.length,
      });

      const summarizedHtml = await this.llmService.summarizeHtml(cleanedHtml);

      onProgress?.("COMPLETE");

      return {
        screenshotBase64,
        pageHtml: cleanedHtml,
        url,
        summary: summarizedHtml,
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
