import type { CalculationLogEntry } from "./types";

/**
 * In-memory logger scoped to a single calculation run.
 * Callers can inspect `entries` after calculation to persist or forward them.
 */
export class CalculationLogger {
  readonly entries: CalculationLogEntry[] = [];

  log(level: CalculationLogEntry["level"], message: string, details?: Record<string, unknown>) {
    this.entries.push({ level, message, details, at: new Date().toISOString() });
  }

  debug(message: string, details?: Record<string, unknown>) {
    this.log("debug", message, details);
  }
  info(message: string, details?: Record<string, unknown>) {
    this.log("info", message, details);
  }
  warn(message: string, details?: Record<string, unknown>) {
    this.log("warn", message, details);
  }
  error(message: string, details?: Record<string, unknown>) {
    this.log("error", message, details);
  }

  drain(): CalculationLogEntry[] {
    return [...this.entries];
  }
}
