type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

export type PublicBetaRuntimeCategory =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server"
  | "render"
  | "unknown";

const safeRoutes = new Set([
  "casos", "cases", "pacientes", "patients", "clinica", "clinic",
  "laboratorio", "laboratory", "master", "billing", "assinatura",
  "financeiro", "auth", "login", "cadastro", "conta", "app",
]);

/** Only fixed route groups, never a patient/case ID or a query token. */
export function publicBetaRoute(pathname: string): string {
  const segment = pathname.split("/")[1]?.toLowerCase() ?? "";
  if (!segment) return "home";
  return safeRoutes.has(segment) ? segment : "other";
}

/** Classify without retaining messages, URLs, stacks, arbitrary context, or PHI. */
export function publicBetaErrorCategory(error: unknown): PublicBetaRuntimeCategory {
  if (typeof Response !== "undefined" && error instanceof Response) {
    if (error.status === 401) return "unauthorized";
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "not_found";
    if (error.status >= 500) return "server";
    return "unknown";
  }
  // Never send the raw message. Pattern matching is strictly local.
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (/network|failed to fetch|load failed|fetch failed/.test(text)) return "network";
  if (/timed out|timeout|aborted/.test(text)) return "timeout";
  if (error instanceof TypeError || error instanceof ReferenceError) return "render";
  return "unknown";
}

/**
 * Beta-safe best-effort reporting. The legacy preview reporter accepted raw
 * errors, stack traces, arbitrary context, and full paths; those can contain
 * patient names, IDs, tokens or even signed Storage URLs. Never forward them.
 *
 * This is diagnostic sanitization, NOT proof of persisted production telemetry.
 * Backend ingestion and retention require a separately reviewed deployment.
 */
export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  void context; // Untrusted caller context must never reach a telemetry provider.
  const category = publicBetaErrorCategory(error);
  const route = publicBetaRoute(window.location.pathname);
  const message = `DentalFlow runtime ${category}`;
  window.__lovableEvents?.captureException?.(
    new Error(message),
    { source: "react_error_boundary", route, category },
    { mechanism: "react_error_boundary", handled: false, severity: "error" },
  );
  window.__lovableReportRuntimeError?.({ message, filename: route });
}
