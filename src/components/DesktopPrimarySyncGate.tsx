import { useEffect, useRef, useState } from "react";
import { Check, Database, LogIn, RefreshCw, WifiOff } from "lucide-react";

import { isDentalFlowDesktop, localCacheGet } from "@/lib/desktop-local";
import { inspectDesktopSyncReadiness } from "@/lib/desktop-sync-proof";

type GateMode = "syncing" | "offline" | "error" | "reauth" | "ready";
type GateState = {
  visible: boolean;
  progress: number;
  title: string;
  detail: string;
  mode: GateMode;
};

type Readiness = {
  ready: boolean;
  ownerId: string | null;
  patients: number;
  cases: number;
  clinicCached: boolean;
  verified: boolean;
};

const SYNC_GATE_WATCHDOG_MS = 45_000;
const HIDDEN: GateState = {
  visible: false,
  progress: 100,
  title: "Pronto",
  detail: "",
  mode: "ready",
};

async function inspectLocalReadiness(): Promise<Readiness> {
  const inspected = await inspectDesktopSyncReadiness();
  const ownerId = inspected.ownerId;
  if (!ownerId) {
    return { ready: false, ownerId: null, patients: 0, cases: 0, clinicCached: false, verified: false };
  }

  const [profile, clinic] = await Promise.all([
    localCacheGet<unknown>(ownerId, "reference-data:v1", "profile").catch(() => null),
    localCacheGet<unknown>(ownerId, "clinic-context:v1", "current").catch(() => null),
  ]);
  const profileReady = Boolean(profile?.payload);
  const clinicCached = Boolean(clinic?.payload);
  const verified = Boolean(inspected.proof);

  return {
    ready: verified && profileReady && clinicCached,
    ownerId,
    patients: inspected.local?.patients ?? 0,
    cases: inspected.local?.cases ?? 0,
    clinicCached,
    verified,
  };
}

/**
 * Desktop readiness gate.
 *
 * 0.2.9 keeps the first authenticated preparation explicit, but a machine that
 * already has a verified SQLite snapshot is never blocked again merely because
 * Windows went offline and came back. Reconnect refreshes are silent/background.
 * A watchdog also guarantees that a broken endpoint cannot leave the full-screen
 * "Conferindo todas as listas" state visible forever.
 */
export function DesktopPrimarySyncGate() {
  const desktop = isDentalFlowDesktop();
  const [state, setState] = useState<GateState>(HIDDEN);
  const [lastReady, setLastReady] = useState<Readiness | null>(null);
  const dismissed = useRef(false);
  const progressTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const watchdogTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;

    const clearTimers = () => {
      if (progressTimer.current !== null) window.clearInterval(progressTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      if (watchdogTimer.current !== null) window.clearTimeout(watchdogTimer.current);
      progressTimer.current = null;
      hideTimer.current = null;
      watchdogTimer.current = null;
    };

    const armWatchdog = () => {
      if (watchdogTimer.current !== null) window.clearTimeout(watchdogTimer.current);
      watchdogTimer.current = window.setTimeout(() => {
        if (disposed) return;
        progressTimer.current !== null && window.clearInterval(progressTimer.current);
        progressTimer.current = null;
        setState((current) => {
          if (!current.visible || current.mode !== "syncing") return current;
          return {
            visible: true,
            progress: 0,
            title: "Sincronização demorou mais que o esperado",
            detail: "O DentalFlow interrompeu a tela de espera para não prender o programa. Tente novamente; os dados locais já verificados continuam preservados.",
            mode: "error",
          };
        });
      }, SYNC_GATE_WATCHDOG_MS);
    };

    const startProgress = () => {
      if (progressTimer.current !== null) return;
      progressTimer.current = window.setInterval(() => {
        setState((current) => {
          if (!current.visible || current.mode !== "syncing") return current;
          return { ...current, progress: Math.min(90, current.progress + (current.progress < 55 ? 4 : 1)) };
        });
      }, 420);
    };

    const showPreparing = (detail = "Validando sua sessão e sincronizando pacientes, casos, etapas, categorias e estoque.") => {
      if (dismissed.current) return;
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
      setState({ visible: true, progress: 12, title: "Sincronizando dados deste computador", detail, mode: "syncing" });
      startProgress();
      armWatchdog();
    };

    const check = async (showIfMissing: boolean, announceReady = false) => {
      const readiness = await inspectLocalReadiness().catch(() => ({
        ready: false,
        ownerId: null,
        patients: 0,
        cases: 0,
        clinicCached: false,
        verified: false,
      }));
      if (disposed) return readiness;
      setLastReady(readiness);

      if (readiness.ready) {
        clearTimers();
        if (announceReady && !dismissed.current) {
          setState({
            visible: true,
            progress: 100,
            title: "DentalFlow sincronizado",
            detail: `${readiness.patients} pacientes e ${readiness.cases} casos confirmados localmente.`,
            mode: "ready",
          });
          hideTimer.current = window.setTimeout(() => {
            if (!disposed) setState(HIDDEN);
          }, 700);
        } else {
          setState(HIDDEN);
        }
      } else if (showIfMissing && !dismissed.current) {
        if (navigator.onLine === false) {
          clearTimers();
          setState({
            visible: true,
            progress: 0,
            title: "Sincronização verificada pendente",
            detail: "A interface está instalada e pode abrir offline, mas este computador ainda precisa concluir uma sincronização autenticada para garantir que todas as listas estejam completas.",
            mode: "offline",
          });
        } else {
          showPreparing();
        }
      }
      return readiness;
    };

    void check(true, false);

    const onStart = () => {
      void check(false, false).then((readiness) => {
        if (!readiness.ready) showPreparing();
      });
    };

    const onComplete = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      void check(false, false).then((readiness) => {
        if (readiness.ready || disposed || dismissed.current) return;
        const reason = String(detail?.reason ?? "");
        const finalAttempt = ["boot-finalize", "manual", "online", "account-changed"].some((value) => reason.includes(value));
        const cloudValidated = Boolean(detail?.cloudValidated);

        if (finalAttempt && !cloudValidated && navigator.onLine !== false) {
          clearTimers();
          setState({
            visible: true,
            progress: 0,
            title: "Revalide seu login para sincronizar",
            detail: "O Windows está conectado, mas a sessão do Lovable Cloud não está autenticada. Para evitar listas vazias falsas, o DentalFlow bloqueou a leitura remota até você entrar novamente.",
            mode: "reauth",
          });
          return;
        }

        if (finalAttempt) {
          clearTimers();
          setState({
            visible: true,
            progress: 0,
            title: "Sincronização ainda incompleta",
            detail: "A sessão foi validada, mas alguma lista local ainda não coincide com os dados autorizados no Cloud. Tente novamente; o aplicativo não substituirá dados válidos por uma resposta vazia ambígua.",
            mode: "error",
          });
          return;
        }

        setState({
          visible: true,
          progress: 90,
          title: "Conferindo todas as listas",
          detail: "Comparando pacientes, casos, tipos, etapas, profissionais, categorias e estoque com o Lovable Cloud…",
          mode: "syncing",
        });
        startProgress();
        armWatchdog();
      });
    };

    const onError = (event: Event) => {
      const message = String((event as CustomEvent<any>).detail?.message ?? "Não foi possível concluir a sincronização.");
      void check(false, false).then((readiness) => {
        if (readiness.ready || disposed || dismissed.current) return;
        clearTimers();
        setState({
          visible: true,
          progress: 0,
          title: navigator.onLine === false ? "Sem conexão para sincronizar" : "Sincronização incompleta",
          detail: navigator.onLine === false
            ? "Os dados já verificados permanecem disponíveis localmente. Reconecte para atualizar o conteúdo."
            : message,
          mode: navigator.onLine === false ? "offline" : "error",
        });
      });
    };

    const onOnline = () => {
      dismissed.current = false;
      void check(false, false).then((readiness) => {
        // Once this Windows installation has a verified snapshot, reconnect is a
        // background refresh; never cover the app with a 90% blocking screen.
        if (!readiness.ready) {
          showPreparing("Conexão disponível. Revalidando a sessão e conferindo todos os dados locais.");
        }
        window.dispatchEvent(new CustomEvent("dentalflow:desktop-force-sync"));
      });
    };
    const onOffline = () => void check(true, false);

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
      progress: 12,
      title: "Sincronizando novamente",
      detail: "Revalidando a conta e reconstruindo os dados locais…",
      mode: "syncing",
    });
    window.dispatchEvent(new CustomEvent("dentalflow:desktop-force-sync"));
  };

  const reauthenticate = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/reauth?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const continueLocally = () => {
    dismissed.current = true;
    setState(HIDDEN);
  };

  const Icon = state.mode === "ready"
    ? Check
    : state.mode === "offline"
      ? WifiOff
      : state.mode === "reauth"
        ? LogIn
        : state.mode === "error"
          ? Database
          : RefreshCw;

  return (
    <div className="fixed inset-0 z-[10020] grid place-items-center bg-[#f7f9fc]/96 px-6 backdrop-blur-xl dark:bg-[#07090d]/96" role="status" aria-live="polite">
      <div className="w-full max-w-[540px] text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] border border-slate-200/80 bg-white text-[#2D7FF9] shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <Icon className={`h-6 w-6 stroke-[1.5] ${state.mode === "syncing" ? "animate-spin" : ""}`} />
        </div>
        <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">DentalFlow Desktop 0.2.9</div>
        <h1 className="mt-3 text-[30px] font-extralight tracking-[-0.04em] text-slate-950 sm:text-[38px] dark:text-white">{state.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-light leading-6 text-slate-500 dark:text-slate-400">{state.detail}</p>

        {state.mode === "syncing" || state.mode === "ready" ? (
          <div className="mx-auto mt-8 max-w-sm">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div className="h-full rounded-full bg-[#2D7FF9] transition-[width] duration-500" style={{ width: `${state.progress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-slate-400">
              <span>{state.mode === "ready" ? "Dados verificados" : "Sincronização autenticada"}</span>
              <span>{Math.round(state.progress)}%</span>
            </div>
          </div>
        ) : (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {state.mode === "reauth" ? (
              <button type="button" onClick={reauthenticate} className="rounded-full bg-[#2D7FF9] px-5 py-2.5 text-sm text-white transition hover:bg-[#226fe1]">Entrar novamente</button>
            ) : navigator.onLine !== false ? (
              <button type="button" onClick={retry} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">Tentar novamente</button>
            ) : null}
            <button type="button" onClick={continueLocally} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]">Abrir com dados locais</button>
          </div>
        )}

        {lastReady && !lastReady.ready && state.mode !== "ready" && (
          <p className="mt-6 text-[10px] font-light text-slate-400">A 0.2.9 só considera este computador sincronizado depois de confirmar as listas com uma sessão Cloud real.</p>
        )}
      </div>
    </div>
  );
}
