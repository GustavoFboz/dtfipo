import { useEffect, useRef, useState } from "react";
import { Check, Database, RefreshCw, WifiOff } from "lucide-react";

import { isDentalFlowDesktop, localCacheGet } from "@/lib/desktop-local";
import { resolveDesktopOwnerId } from "@/lib/desktop-identity";

type GateState = {
  visible: boolean;
  progress: number;
  title: string;
  detail: string;
  mode: "syncing" | "offline" | "error" | "ready";
};

type Readiness = {
  ready: boolean;
  ownerId: string | null;
  patients: number;
  cases: number;
  clinicCached: boolean;
};

const HIDDEN: GateState = {
  visible: false,
  progress: 100,
  title: "Pronto",
  detail: "",
  mode: "ready",
};

async function inspectLocalReadiness(): Promise<Readiness> {
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return { ready: false, ownerId: null, patients: 0, cases: 0, clinicCached: false };

  const [profile, patients, cases, clinic] = await Promise.all([
    localCacheGet<unknown>(ownerId, "reference-data:v1", "profile").catch(() => null),
    localCacheGet<unknown[]>(ownerId, "patients:v1", "all").catch(() => null),
    localCacheGet<unknown[]>(ownerId, "cases:v1", "all").catch(() => null),
    localCacheGet<unknown>(ownerId, "clinic-context:v1", "current").catch(() => null),
  ]);

  const patientsReady = Array.isArray(patients?.payload);
  const casesReady = Array.isArray(cases?.payload);
  const clinicReady = Boolean(clinic?.payload);
  const profileReady = Boolean(profile?.payload);

  return {
    ready: profileReady && patientsReady && casesReady && clinicReady,
    ownerId,
    patients: patientsReady ? patients!.payload.length : 0,
    cases: casesReady ? cases!.payload.length : 0,
    clinicCached: clinicReady,
  };
}

/**
 * First-device readiness screen for the installed Windows application.
 *
 * The UI itself is already bundled by Tauri and never comes from the network.
 * This gate appears only while a newly authorized account still lacks the local
 * SQLite read models required for a useful offline session. Warm installations
 * skip it completely and render the local interface/data immediately.
 */
export function DesktopPrimarySyncGate() {
  const desktop = isDentalFlowDesktop();
  const [state, setState] = useState<GateState>(HIDDEN);
  const [lastReady, setLastReady] = useState<Readiness | null>(null);
  const dismissed = useRef(false);
  const progressTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;

    const clearTimers = () => {
      if (progressTimer.current !== null) window.clearInterval(progressTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      progressTimer.current = null;
      hideTimer.current = null;
    };

    const startProgress = () => {
      if (progressTimer.current !== null) return;
      progressTimer.current = window.setInterval(() => {
        setState((current) => {
          if (!current.visible || current.mode !== "syncing") return current;
          return { ...current, progress: Math.min(88, current.progress + (current.progress < 55 ? 4 : 1)) };
        });
      }, 420);
    };

    const showPreparing = (detail = "Sincronizando pacientes, casos, permissões e dados essenciais para este computador.") => {
      if (dismissed.current) return;
      setState({
        visible: true,
        progress: 14,
        title: "Preparando o DentalFlow neste computador",
        detail,
        mode: "syncing",
      });
      startProgress();
    };

    const check = async (showIfMissing: boolean) => {
      const readiness = await inspectLocalReadiness().catch(() => ({
        ready: false,
        ownerId: null,
        patients: 0,
        cases: 0,
        clinicCached: false,
      }));
      if (disposed) return readiness;
      setLastReady(readiness);
      if (readiness.ready) {
        clearTimers();
        setState({
          visible: !dismissed.current,
          progress: 100,
          title: "DentalFlow pronto para uso offline",
          detail: `${readiness.patients} pacientes e ${readiness.cases} casos disponíveis localmente.`,
          mode: "ready",
        });
        hideTimer.current = window.setTimeout(() => {
          if (!disposed) setState(HIDDEN);
        }, 650);
      } else if (showIfMissing && !dismissed.current) {
        if (navigator.onLine === false) {
          clearTimers();
          setState({
            visible: true,
            progress: 0,
            title: "Primeira sincronização pendente",
            detail: "A interface já está instalada e pode abrir offline, mas os dados desta conta ainda precisam de uma sincronização online completa neste computador.",
            mode: "offline",
          });
        } else {
          showPreparing();
        }
      }
      return readiness;
    };

    void check(true);

    const onStart = () => {
      void check(false).then((readiness) => {
        if (!readiness.ready) showPreparing();
      });
    };

    const onComplete = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      void check(false).then((readiness) => {
        if (readiness.ready || disposed || dismissed.current) return;
        const patients = Number(detail?.patientsCached ?? 0);
        const cases = Number(detail?.casesCached ?? 0);
        setState({
          visible: true,
          progress: 88,
          title: "Concluindo a sincronização local",
          detail: patients || cases
            ? `${patients} pacientes e ${cases} casos recebidos nesta passagem. Confirmando os dados essenciais…`
            : "Confirmando os dados essenciais e as permissões desta conta…",
          mode: "syncing",
        });
        startProgress();
      });
    };

    const onError = (event: Event) => {
      const message = String((event as CustomEvent<any>).detail?.message ?? "Não foi possível concluir a sincronização.");
      void check(false).then((readiness) => {
        if (readiness.ready || disposed || dismissed.current) return;
        clearTimers();
        setState({
          visible: true,
          progress: 0,
          title: navigator.onLine === false ? "Sem conexão para a primeira sincronização" : "Sincronização incompleta",
          detail: navigator.onLine === false
            ? "A interface permanece disponível porque está instalada no Windows. Reconecte para baixar os dados desta conta."
            : message,
          mode: navigator.onLine === false ? "offline" : "error",
        });
      });
    };

    const onOnline = () => {
      dismissed.current = false;
      showPreparing("Conexão disponível. Atualizando os dados locais antes de liberar o modo offline.");
      window.dispatchEvent(new CustomEvent("dentalflow:desktop-force-sync"));
    };

    const onOffline = () => void check(true);

    window.addEventListener("dentalflow:desktop-sync-start", onStart as EventListener);
    window.addEventListener("dentalflow:desktop-sync-complete", onComplete as EventListener);
    window.addEventListener("dentalflow:desktop-sync-error", onError as EventListener);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      disposed = true;
      clearTimers();
      window.removeEventListener("dentalflow:desktop-sync-start", onStart as EventListener);
      window.removeEventListener("dentalflow:desktop-sync-complete", onComplete as EventListener);
      window.removeEventListener("dentalflow:desktop-sync-error", onError as EventListener);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [desktop]);

  if (!desktop || !state.visible) return null;

  const retry = () => {
    dismissed.current = false;
    setState({
      visible: true,
      progress: 14,
      title: "Sincronizando novamente",
      detail: "Buscando os dados essenciais da conta no Lovable Cloud…",
      mode: "syncing",
    });
    window.dispatchEvent(new CustomEvent("dentalflow:desktop-force-sync"));
  };

  const continueLocally = () => {
    dismissed.current = true;
    setState(HIDDEN);
  };

  const Icon = state.mode === "ready" ? Check : state.mode === "offline" ? WifiOff : state.mode === "error" ? Database : RefreshCw;

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-[#f7f9fc]/96 px-6 backdrop-blur-xl dark:bg-[#07090d]/96" role="status" aria-live="polite">
      <div className="w-full max-w-[540px] text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] border border-slate-200/80 bg-white text-[#2D7FF9] shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <Icon className={`h-6 w-6 stroke-[1.5] ${state.mode === "syncing" ? "animate-spin" : ""}`} />
        </div>
        <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">DentalFlow Desktop</div>
        <h1 className="mt-3 text-[30px] font-extralight tracking-[-0.04em] text-slate-950 sm:text-[38px] dark:text-white">{state.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-light leading-6 text-slate-500 dark:text-slate-400">{state.detail}</p>

        {state.mode === "syncing" || state.mode === "ready" ? (
          <div className="mx-auto mt-8 max-w-sm">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div className="h-full rounded-full bg-[#2D7FF9] transition-[width] duration-500" style={{ width: `${state.progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-slate-400">
              <span>{state.mode === "ready" ? "Dados locais preparados" : "Sincronização primária"}</span>
              <span>{Math.round(state.progress)}%</span>
            </div>
          </div>
        ) : (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {navigator.onLine !== false && (
              <button type="button" onClick={retry} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">Tentar novamente</button>
            )}
            <button type="button" onClick={continueLocally} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]">Abrir interface mesmo assim</button>
          </div>
        )}

        {lastReady && !lastReady.ready && state.mode !== "ready" && (
          <p className="mt-6 text-[10px] font-light text-slate-400">Depois desta primeira sincronização, pacientes, casos e permissões ficam disponíveis no armazenamento local deste Windows.</p>
        )}
      </div>
    </div>
  );
}
