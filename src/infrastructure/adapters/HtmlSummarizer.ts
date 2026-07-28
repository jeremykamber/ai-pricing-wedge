import { LlmServiceImpl } from "./LlmServiceImpl";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export class HtmlSummarizer {
  constructor(private llmService: LlmServiceImpl) { }

  async summarizeHtml(html: string, runId?: string): Promise<string> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    const startTime = Date.now();

    log?.info("HtmlSummarizer", "summarizeHtml START", {
      inputHtmlLength: html.length,
      inputPreview: html.slice(0, 300),
    });

    const prompt = `You are an expert web data extractor. You are provided with the cleaned HTML of a page.
Your task is to summarize this HTML into a highly objective, compact markdown format.
Focus ONLY on the objective facts about the page's content. Do NOT include marketing fluff or subjective opinions.

Extract and structure the following if present:
1. Product/Website Topic: Briefly, what is this page about based on the text?
2. Navigation/Functional Links: Key links found (e.g., "Login", "Contact Sales", "FAQ", "Book Demo").
3. Offerings: Any plans, tiers, or options mentioned, including price points and billing cycles if available. List specific currency symbols if present.
4. Features: Objective list of features or offerings mentioned.
5. Fine Print/Limits: Any mentioned limits (e.g., "up to 5 users"), overage charges, or guarantees.

HTML CONTENT:
"""
${html}
"""

Return ONLY the markdown summary. DO NOT include any conversational preamble.`;

    log?.info("HtmlSummarizer", "Sending HTML to LLM for compaction...", {
      promptLength: prompt.length,
      model: this.llmService.extractionModel,
    });

    const llmStart = Date.now();
    const content = await this.llmService.createChatCompletion(
      [{ role: "user", content: prompt }],
      {
        temperature: 0.1,
        model: this.llmService.extractionModel,
        purpose: "HTML Compacting",
      }
    );
    const llmDuration = Date.now() - llmStart;

    log?.info("HtmlSummarizer", "summarizeHtml COMPLETE", {
      outputLength: content.length,
      outputPreview: content.slice(0, 500),
      llmDurationMs: llmDuration,
      totalDurationMs: Date.now() - startTime,
    });

    return content;
  }
}
