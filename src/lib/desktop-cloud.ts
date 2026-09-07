export const DESKTOP_AUTH_TIMEOUT_MS = 8_000;
export const DESKTOP_READ_TIMEOUT_MS = 12_000;
export const DESKTOP_SYNC_TIMEOUT_MS = 20_000;

export class DesktopCloudTimeoutError extends Error {
  readonly code = "DENTALFLOW_DESKTOP_CLOUD_TIMEOUT";

  constructor(label: string, timeoutMs: number) {
    super(`Tempo limite ao acessar ${label} (${timeoutMs} ms).`);
    this.name = "DesktopCloudTimeoutError";
  }
}

/**
 * A WebView can report navigator.onLine=true while DNS, Cloud Login or the API
 * are unreachable. Every installed client cloud operation must therefore have a
 * finite deadline so the UI can fall back to SQLite instead of displaying an
 * infinite skeleton.
 */
export async function withDesktopCloudTimeout<T>(
  label: string,
  operation: Promise<T> | (() => Promise<T>),
  timeoutMs = DESKTOP_READ_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const task = typeof operation === "function" ? operation() : operation;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new DesktopCloudTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function desktopCloudErrorLooksTransient(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "failed to fetch",
    "networkerror",
    "network error",
    "load failed",
    "fetch failed",
    "connection",
    "offline",
    "timeout",
    "tempo limite",
    "cloud login",
    "dentalflow_desktop_cloud_timeout",
  ].some((needle) => message.includes(needle));
}
