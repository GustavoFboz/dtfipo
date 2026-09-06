import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ConnectivityState = "online" | "offline" | "reconnecting";

const RECONNECT_VISIBLE_MS = 900;

/**
 * Universal DentalFlow connectivity UX.
 *
 * Phase 1 observes device/browser connectivity. The same visual contract will
 * later be driven by the offline sync engine (SQLite outbox + cloud sync), so
 * the shells do not need to know whether they run on Web, Tauri or Capacitor.
 */
export function ConnectivityLayer() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectivityState>(() => {
    if (typeof navigator === "undefined") return "online";
    return navigator.onLine ? "online" : "offline";
  });
  const wasOffline = useRef(state === "offline");
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearReconnectTimer() {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    }

    function handleOffline() {
      clearReconnectTimer();
      wasOffline.current = true;
      setState("offline");
    }

    function handleOnline() {
      // Do not flash a reconnect overlay during the initial online mount. It is
      // reserved for a real Offline -> Online transition.
      if (!wasOffline.current) {
        setState("online");
        return;
      }

      wasOffline.current = false;
      setState("reconnecting");

      // Phase 1 refreshes active cloud reads. Later this exact transition will
      // await the local SQLite outbox/sync engine before changing to "online".
      void queryClient.invalidateQueries();
      void queryClient.refetchQueries({ type: "active" }).catch(() => undefined);

      clearReconnectTimer();
      reconnectTimer.current = window.setTimeout(() => {
        setState(navigator.onLine ? "online" : "offline");
        reconnectTimer.current = null;
      }, RECONNECT_VISIBLE_MS);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Reconcile with the browser in case connectivity changed between the
    // initial render and effect registration.
    if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearReconnectTimer();
    };
  }, [queryClient]);

  const isOffline = state === "offline";
  const isReconnecting = state === "reconnecting";

  return (
    <>
      <div
        className={`fixed right-[154px] top-[19px] z-[70] hidden h-[34px] items-center gap-2 rounded-full border px-3 text-[10px] font-medium tracking-[0.02em] shadow-sm backdrop-blur-xl transition-all sm:flex ${
          isOffline
            ? "border-amber-200/80 bg-amber-50/92 text-amber-700 dark:border-amber-800/35 dark:bg-amber-950/75 dark:text-amber-300"
            : isReconnecting
              ? "border-sky-200/80 bg-sky-50/92 text-sky-700 dark:border-sky-800/35 dark:bg-sky-950/75 dark:text-sky-300"
              : "border-emerald-200/65 bg-white/90 text-emerald-700 dark:border-emerald-900/35 dark:bg-[#090c11]/88 dark:text-emerald-400"
        }`}
        role="status"
        aria-live="polite"
        title={isOffline ? "Sem conexão com a internet" : isReconnecting ? "Conexão restabelecida. Atualizando dados." : "Conectado"}
      >
        {isOffline ? (
          <WifiOff className="h-3.5 w-3.5 stroke-[1.8]" />
        ) : isReconnecting ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[1.8]" />
        ) : (
          <Wifi className="h-3.5 w-3.5 stroke-[1.8]" />
        )}
        <span>{isOffline ? "Offline" : isReconnecting ? "Atualizando" : "Online"}</span>
      </div>

      {isReconnecting && (
        <div
          className="fixed inset-0 z-[9998] grid place-items-center overflow-hidden bg-white/62 backdrop-blur-[18px] animate-in fade-in duration-150 dark:bg-[#05070a]/72"
          role="status"
          aria-live="assertive"
          aria-label="Conexão restabelecida, atualizando dados"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.64),transparent_35%)] dark:bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.045),transparent_34%)]" />
          <div className="relative flex -translate-y-3 flex-col items-center px-6 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
              Conexão restabelecida
            </div>
            <div className="mt-4 text-[38px] font-extralight tracking-[-0.05em] text-slate-950 sm:text-[54px] dark:text-white">
              Atualizando dados
            </div>
            <div className="mt-8 grid h-11 w-11 place-items-center rounded-full border border-slate-200/70 bg-white/65 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1e8f87] dark:border-white/10 dark:border-t-[#48b8ad]" />
            </div>
            <div className="mt-4 text-[11px] font-light tracking-[0.04em] text-slate-400 dark:text-slate-500">
              Verificando as informações mais recentes…
            </div>
          </div>
        </div>
      )}
    </>
  );
}
