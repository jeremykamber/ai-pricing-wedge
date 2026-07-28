/**
 * AnalysisLogger — Per-run logging for artifact analysis.
 *
 * Each run of the analysis pipeline gets a unique run ID and its own
 * log file under logs/analysis/.  Every log entry is both written to the file
 * (as JSONL) AND output to the console for real-time tracing.
 *
 * Usage:
 *   const log = AnalysisLogger.forRun(runId);
 *   await log.init();
 *   log.info("ModuleName", "Some message", { optionalData });
 *   // ... analysis runs ...
 *   await log.close();
 *
 * Logs are auto-flushed every ~100KB to avoid large memory buffers.
 */

import { promises as fs } from "fs";
import * as path from "path";

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  runId: string;
  module: string;
  message: string;
  data?: unknown;
}

export class AnalysisLogger {
  /** Root directory for all analysis logs. */
  private static readonly LOG_DIR = path.join(
    process.env.LOG_DIR || process.cwd(),
    "logs",
    "analysis"
  );

  /** Active loggers keyed by runId. */
  private static instances = new Map<string, AnalysisLogger>();

  /** Get or create a logger for a specific run. */
  static forRun(runId: string): AnalysisLogger {
    let instance = AnalysisLogger.instances.get(runId);
    if (!instance) {
      instance = new AnalysisLogger(runId);
      AnalysisLogger.instances.set(runId, instance);
    }
    return instance;
  }

  /** Remove a completed run from the registry. */
  static removeRun(runId: string): void {
    AnalysisLogger.instances.delete(runId);
  }

  /** List all active/in-progress run IDs. */
  static activeRunIds(): string[] {
    return Array.from(AnalysisLogger.instances.keys());
  }

  // ─── Instance ───────────────────────────────────────────────────────────

  public readonly runId: string;
  public readonly logPath: string;

  private entries: LogEntry[] = [];
  private bufferBytes = 0;
  private fileHandle: fs.FileHandle | null = null;
  private _initialized = false;
  private personaLatencies: Map<string, number> = new Map();

  private constructor(runId: string) {
    this.runId = runId;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    this.logPath = path.join(AnalysisLogger.LOG_DIR, `analysis-${runId}-${ts}.log`);
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /** Initialize the logger — creates the log directory and file. */
  async init(): Promise<void> {
    if (this._initialized) return;
    await fs.mkdir(AnalysisLogger.LOG_DIR, { recursive: true });
    this.fileHandle = await fs.open(this.logPath, "a");
    this._initialized = true;
    this.info("Logger", "=== ANALYSIS LOG START ===", {
      runId: this.runId,
      logPath: this.logPath,
    });
    // Print the log path prominently so the user can find it
    console.log(`\n📝 [AnalysisLogger] Logging to: ${this.logPath}\n`);
  }

  /** Core log method — writes to both console and file. */
  log(level: LogLevel, module: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = { timestamp, level, runId: this.runId, module, message };

    // Only include data if it's meaningful
    if (data !== undefined) {
      entry.data = data;
    }

    // Buffer for batch file write
    this.entries.push(entry);
    this.bufferBytes += JSON.stringify(entry).length + 1;

    // ── Console output ─────────────────────────────────────────────
    const dataStr =
      data !== undefined
        ? " " + (typeof data === "object" ? this.summarizeData(data) : String(data))
        : "";
    // Use different prefixes for readability
    const prefix = `[${level === "TRACE" ? "TRACE" : level}]`;
    console.log(`${prefix} [${module}] ${message}${dataStr}`);

    // Auto-flush when buffer exceeds ~100KB
    if (this.bufferBytes > 100 * 1024) {
      this.flush().catch((err) =>
        console.error("[AnalysisLogger] Auto-flush failed:", err)
      );
    }
  }

  // ── Convenience methods ────────────────────────────────────────────

  trace(module: string, message: string, data?: unknown): void {
    this.log("TRACE", module, message, data);
  }
  debug(module: string, message: string, data?: unknown): void {
    this.log("DEBUG", module, message, data);
  }
  info(module: string, message: string, data?: unknown): void {
    this.log("INFO", module, message, data);
  }
  warn(module: string, message: string, data?: unknown): void {
    this.log("WARN", module, message, data);
  }
  error(module: string, message: string, data?: unknown): void {
    this.log("ERROR", module, message, data);
  }

  // ── Persona latency tracking ───────────────────────────────────────

  recordPersonaLatency(personaName: string, durationMs: number): void {
    this.personaLatencies.set(personaName, durationMs);
    this.info("LatencyTracker", `Persona "${personaName}" took ${durationMs}ms`);
  }

  logPersonaSummary(): void {
    if (this.personaLatencies.size === 0) return;
    const entries = Array.from(this.personaLatencies.entries());
    entries.sort((a, b) => b[1] - a[1]);
    this.info("LatencyTracker", "=== PERSONA LATENCY SUMMARY ===", {
      totalPersonas: entries.length,
      totalTimeMs: entries.reduce((s, [, d]) => s + d, 0),
      slowest: entries[0],
      fastest: entries[entries.length - 1],
      breakdown: Object.fromEntries(entries),
    });
  }

  // ── Flush & Close ──────────────────────────────────────────────────

  /** Flush buffered entries to disk. */
  async flush(): Promise<void> {
    if (this.entries.length === 0) return;
    const lines = this.entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    this.entries = [];
    this.bufferBytes = 0;
    if (this.fileHandle) {
      await this.fileHandle.write(lines, 0, "utf-8").catch((err) => {
        console.error("[AnalysisLogger] Flush error:", err.message);
      });
    }
  }

  /** Close the logger — flush remaining entries and finalize the file. */
  async close(): Promise<void> {
    if (!this._initialized) return;
    this.logPersonaSummary();
    this.info("Logger", "=== ANALYSIS LOG END ===");
    await this.flush();
    if (this.fileHandle) {
      await this.fileHandle.close().catch(() => {});
      this.fileHandle = null;
    }
    this._initialized = false;
    AnalysisLogger.instances.delete(this.runId);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /** Summarize data for console display — truncate long strings. */
  private summarizeData(data: unknown): string {
    if (data === null || data === undefined) return "null";
    if (typeof data === "string") {
      if (data.length > 200) return `"${data.slice(0, 200)}...(${data.length} chars)"`;
      return `"${data}"`;
    }
    if (typeof data === "number" || typeof data === "boolean") return String(data);
    if (Array.isArray(data)) {
      if (data.length > 10) return `[${data.length} items: ${data.slice(0, 10).join(", ")}...]`;
      return `[${data.join(", ")}]`;
    }
    const str = JSON.stringify(data);
    if (str.length > 500) return str.slice(0, 500) + "...(truncated)";
    return str;
  }
}
