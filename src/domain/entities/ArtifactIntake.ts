export interface ArtifactIntake {
  screenshotBase64: string;
  pageHtml?: string;
  url?: string;
  /**
   * Summary of the page HTML, resolved off the critical path. The persona
   * pipeline never reads it; the only consumer (simulation title) awaits it
   * concurrently with persona analysis. Never started when there is no HTML.
   */
  summaryPromise?: Promise<string>;
}
