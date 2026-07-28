import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import type { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export type ArtifactInput =
  | { type: "url"; url: string }
  | { type: "screenshot"; imageBase64: string; url?: string };

export type IntakeProgress =
  | { step: "NAVIGATING" }
  | { step: "CAPTURING" }
  | { step: "PROCESSING" }
  | { step: "COMPLETE" };

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
      return this.urlIntake(input.url, onProgress, runId);
    }

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

    try {
      onProgress?.({ step: "NAVIGATING" });

      await this.browserService.navigateTo(url, (status) => {
        log?.trace("ArtifactIntakeAdapter", "Navigation status", { status });
      });

      onProgress?.({ step: "CAPTURING" });

      const [screenshotBase64, cleanedHtml] = await Promise.all([
        this.browserService.captureViewport(),
        this.browserService.getCleanedHtml(),
      ]);

      let pageHtml: string | undefined;
      if (cleanedHtml) {
        onProgress?.({ step: "PROCESSING" });

        log?.info("ArtifactIntakeAdapter", "Summarizing HTML", {
          htmlLength: cleanedHtml.length,
        });

        pageHtml = await this.llmService.summarizeHtml(cleanedHtml);
      }

      onProgress?.({ step: "COMPLETE" });

      return {
        screenshotBase64,
        pageHtml,
        url,
        summary: pageHtml,
      };
    } finally {
      await this.browserService.close();
    }
  }
}
