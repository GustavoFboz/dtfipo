import { useEffect, useRef, useState } from "react";

export type EnvironmentName = "Clínica" | "Laboratório" | "Radiologia";

const TRANSITION_EVENT = "dentalflow:environment-transition";
const NAVIGATION_DELAY_MS = 120;
const MIN_VISIBLE_MS = 680;

type EnvironmentTransitionDetail = {
  target: EnvironmentName;
};

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

export function EnvironmentTransition() {
  const [target, setTarget] = useState<EnvironmentName | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleTransition = (event: Event) => {
      const detail = (event as CustomEvent<EnvironmentTransitionDetail>).detail;
      if (!detail?.target) return;

      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setTarget(detail.target);
      hideTimer.current = window.setTimeout(() => {
        setTarget(null);
        hideTimer.current = null;
      }, MIN_VISIBLE_MS);
    };

    window.addEventListener(TRANSITION_EVENT, handleTransition);
    return () => {
      window.removeEventListener(TRANSITION_EVENT, handleTransition);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!target) return null;

  const accent = accentClass[target];

  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden bg-white/62 backdrop-blur-[18px] animate-in fade-in duration-150 dark:bg-[#05070a]/72"
      role="status"
      aria-live="polite"
      aria-label={`Trocando para o ambiente ${target}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.62),transparent_35%)] dark:bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.045),transparent_34%)]" />

      <div className="relative flex -translate-y-3 flex-col items-center px-6 text-center">
        <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
          Trocando de ambiente
        </div>
        <div className="mt-4 text-[42px] font-extralight tracking-[-0.05em] text-slate-950 sm:text-[58px] dark:text-white">
          {target}
        </div>
        <div className="mt-8 grid h-11 w-11 place-items-center rounded-full border border-slate-200/70 bg-white/65 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
          <div className={`h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-current ${accent}`} />
        </div>
        <div className="mt-4 text-[11px] font-light tracking-[0.04em] text-slate-400 dark:text-slate-500">
          Preparando seu espaço de trabalho…
        </div>
      </div>
    </div>
  );
}
