import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";

type ConnectivityState = "online" | "offline" | "reconnecting";

const RECONNECT_VISIBLE_MS = 900;

/**
 * Universal DentalFlow connectivity UX.
 *
 * On Desktop, a real Offline -> Online transition now waits for the local
 * outbox/cache coordinator before returning to Online. On Web the same visual
 * contract remains, but the sync coordinator is a no-op and cloud queries are
 * simply refreshed.
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

    async function handleOnline() {
      // Do not flash a reconnect overlay during the initial online mount. It is
      // reserved for a real Offline -> Online transition.
      if (!wasOffline.current) {
        setState("online");
        return;
      }

      wasOffline.current = false;
      clearReconnectTimer();
      setState("reconnecting");
      const startedAt = Date.now();

      try {
        const summary = await syncDesktopOfflineData();
        window.dispatchEvent(new CustomEvent("dentalflow:desktop-sync-complete", { detail: summary }));
      } catch (error) {
        // Connectivity itself is restored even if one queued entity fails. The
        // outbox keeps failed/conflicted work for a later retry/review.
        console.error("[DentalFlow] Falha ao sincronizar alterações locais", error);
      }

      await Promise.allSettled([
        queryClient.invalidateQueries(),
        queryClient.refetchQueries({ type: "active" }),
      ]);

      const remaining = Math.max(0, RECONNECT_VISIBLE_MS - (Date.now() - startedAt));
      reconnectTimer.current = window.setTimeout(() => {
        setState(navigator.onLine ? "online" : "offline");
        reconnectTimer.current = null;
      }, remaining);
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
        title={isOffline ? "Sem conexão com a internet" : isReconnecting ? "Conexão restabelecida. Sincronizando dados locais." : "Conectado"}
      >
        {isOffline ? (
          <WifiOff className="h-3.5 w-3.5 stroke-[1.8]" />
        ) : isReconnecting ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[1.8]" />
        ) : (
          <Wifi className="h-3.5 w-3.5 stroke-[1.8]" />
        )}
        <span>{isOffline ? "Offline" : isReconnecting ? "Sincronizando" : "Online"}</span>
      </div>

      {isReconnecting && (
        <div
          className="fixed inset-0 z-[9998] grid place-items-center overflow-hidden bg-white/62 backdrop-blur-[18px] animate-in fade-in duration-150 dark:bg-[#05070a]/72"
          role="status"
          aria-live="assertive"
          aria-label="Conexão restabelecida, sincronizando dados"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.64),transparent_35%)] dark:bg-[radial-gradient(circle_at_50%_44%,rgba(255,255,255,0.045),transparent_34%)]" />
          <div className="relative flex -translate-y-3 flex-col items-center px-6 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
              Conexão restabelecida
            </div>
            <div className="mt-4 text-[38px] font-extralight tracking-[-0.05em] text-slate-950 sm:text-[54px] dark:text-white">
              Sincronizando dados
            </div>
            <div className="mt-8 grid h-11 w-11 place-items-center rounded-full border border-slate-200/70 bg-white/65 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1e8f87] dark:border-white/10 dark:border-t-[#48b8ad]" />
            </div>
            <div className="mt-4 text-[11px] font-light tracking-[0.04em] text-slate-400 dark:text-slate-500">
              Enviando alterações locais e buscando as informações mais recentes…
            </div>
          </div>
        </div>
      )}
    </>
  );
}
