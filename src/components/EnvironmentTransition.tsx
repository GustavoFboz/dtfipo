import { useEffect, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";

export type EnvironmentName = "Clínica" | "Laboratório" | "Radiologia";

const TRANSITION_EVENT = "dentalflow:environment-transition";
const NAVIGATION_DELAY_MS = 55;
const COLD_MIN_VISIBLE_MS = 240;
const WARM_MIN_VISIBLE_MS = 150;
const READY_QUIET_MS = 85;
const SAFETY_CEILING_MS = 2_600;
const WARM_MEMORY_TTL_MS = 5 * 60_000;
const WARM_MEMORY_KEY = "dentalflow:environment-warm:v1";

type EnvironmentTransitionDetail = {
  target: EnvironmentName;
};

type WarmMemory = Partial<Record<EnvironmentName, number>>;

function readWarmMemory(): WarmMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(WARM_MEMORY_KEY);
    return raw ? (JSON.parse(raw) as WarmMemory) : {};
  } catch {
    return {};
  }
}

function environmentIsWarm(target: EnvironmentName) {
  const timestamp = readWarmMemory()[target] ?? 0;
  return timestamp > 0 && Date.now() - timestamp < WARM_MEMORY_TTL_MS;
}

function rememberWarmEnvironment(target: EnvironmentName) {
  if (typeof window === "undefined") return;
  try {
    const current = readWarmMemory();
    current[target] = Date.now();
    window.sessionStorage.setItem(WARM_MEMORY_KEY, JSON.stringify(current));
  } catch {
    // Session memory is an optimization only. React Query + SQLite remain authoritative.
  }
}

export function startEnvironmentTransition(target: EnvironmentName, navigate: () => void) {
  if (typeof window === "undefined") {
    navigate();
    return;
  }

  window.dispatchEvent(
    new CustomEvent<EnvironmentTransitionDetail>(TRANSITION_EVENT, {
      detail: { target },
    }),
  );

  window.setTimeout(navigate, NAVIGATION_DELAY_MS);
}

const accentClass: Record<EnvironmentName, string> = {
  Clínica: "border-t-[#1e8f87] text-[#1e8f87]",
  Laboratório: "border-t-[#2D7FF9] text-[#2D7FF9]",
  Radiologia: "border-t-violet-500 text-violet-500",
};

/**
 * Full-screen environment hand-off.
 *
 * The percentage is a visual-readiness estimate, not a fake network byte counter:
 * it combines elapsed render time with the number of actively observed React Query
 * reads. Once the destination's visible queries settle, we wait one short quiet
 * window for layout/paint, complete at 100%, then reveal the already-rendered UI.
 * Recently prepared environments use an in-session warm marker and complete much
 * faster when their React Query/SQLite data is still hot.
 */
export function EnvironmentTransition() {
  const [target, setTarget] = useState<EnvironmentName | null>(null);
  const [progress, setProgress] = useState(0);
  const [warm, setWarm] = useState(false);
  const startedAt = useRef(0);
  const readySince = useRef<number | null>(null);
  const finishing = useRef(false);
  const hideTimer = useRef<number | null>(null);

  const foregroundFetching = useIsFetching({
    predicate: (query) => query.getObserversCount() > 0 && query.state.fetchStatus === "fetching",
  });

  useEffect(() => {
    const handleTransition = (event: Event) => {
      const detail = (event as CustomEvent<EnvironmentTransitionDetail>).detail;
      if (!detail?.target) return;

      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      const isWarm = environmentIsWarm(detail.target);
      startedAt.current = performance.now();
      readySince.current = null;
      finishing.current = false;
      setWarm(isWarm);
      setProgress(isWarm ? 34 : 7);
      setTarget(detail.target);
    };

    window.addEventListener(TRANSITION_EVENT, handleTransition);
    return () => {
      window.removeEventListener(TRANSITION_EVENT, handleTransition);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!target) return;

    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - startedAt.current;
      const minVisible = warm ? WARM_MIN_VISIBLE_MS : COLD_MIN_VISIBLE_MS;
      const navigationHasSettled = elapsed >= NAVIGATION_DELAY_MS + 70;
      const visualQueriesReady = navigationHasSettled && foregroundFetching === 0;

      if (visualQueriesReady) {
        if (readySince.current === null) readySince.current = now;
      } else {
        readySince.current = null;
      }

      const quietFor = readySince.current === null ? 0 : now - readySince.current;
      const canFinish = elapsed >= minVisible && quietFor >= READY_QUIET_MS;
      const safetyFinish = elapsed >= SAFETY_CEILING_MS;

      if ((canFinish || safetyFinish) && !finishing.current) {
        finishing.current = true;
        setProgress(100);
        rememberWarmEnvironment(target);

        // Give the browser one paint with 100% before removing the blur.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            hideTimer.current = window.setTimeout(() => {
              setTarget(null);
              setProgress(0);
              hideTimer.current = null;
            }, 70);
          });
        });
        return;
      }

      if (finishing.current) return;

      setProgress((current) => {
        let ceiling: number;
        if (visualQueriesReady) {
          ceiling = 96;
        } else if (warm) {
          ceiling = Math.min(90, 52 + elapsed / 16);
        } else {
          ceiling = Math.min(90, 18 + elapsed / 13);
        }

        // More foreground reads means we advance more conservatively. The meter
        // stays monotonic and never claims completion before visual readiness.
        const pressure = Math.min(12, foregroundFetching * 2.25);
        ceiling = Math.max(current, ceiling - pressure);
        const next = current + Math.max(0.7, (ceiling - current) * 0.2);
        return Math.min(96, Math.max(current, Math.round(next)));
      });
    }, 32);

    return () => window.clearInterval(timer);
  }, [foregroundFetching, target, warm]);

  if (!target) return null;

  const accent = accentClass[target];
  const textAccent = accent.split(" ").find((value) => value.startsWith("text-")) ?? "text-slate-600";

  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden bg-white/68 backdrop-blur-[18px] animate-in fade-in duration-100 dark:bg-[#05070a]/76"
      role="status"
      aria-live="polite"
      aria-label={`Trocando para o ambiente ${target}. ${progress}% carregado.`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.72),transparent_36%)] dark:bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.05),transparent_35%)]" />

      <div className="relative flex -translate-y-3 flex-col items-center px-6 text-center">
        <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
          Trocando de ambiente
        </div>
        <div className="mt-4 text-[42px] font-extralight tracking-[-0.05em] text-slate-950 sm:text-[58px] dark:text-white">
          {target}
        </div>

        <div className="relative mt-8 grid h-[68px] w-[68px] place-items-center rounded-full border border-slate-200/70 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
          <div className={`absolute inset-[8px] animate-spin rounded-full border-2 border-slate-200 border-t-current dark:border-white/10 ${accent}`} />
          <span className={`relative text-[12px] font-medium tabular-nums tracking-[-0.02em] ${textAccent}`}>
            {progress}%
          </span>
        </div>

        <div className="mt-4 text-[11px] font-light tracking-[0.04em] text-slate-400 dark:text-slate-500">
          {warm ? "Reabrindo dados preparados…" : "Preparando seu espaço de trabalho…"}
        </div>
      </div>
    </div>
  );
}
