import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ConnectivityState = "online" | "offline" | "reconnecting";

const RECONNECT_VISIBLE_MS = 900;
const RECONNECT_FALLBACK_MS = 10_000;

/**
 * Indicador de conectividade apenas informativo.
 *
 * A reconciliação é coordenada pelo bootstrap do Desktop. Esta camada não chama
 * sincronização integral, não invalida todo o React Query e nunca cobre a tela.
 * Assim, voltar do sleep/offline não transforma uma mudança de rede em bloqueio.
 */
export function ConnectivityLayer() {
  const [state, setState] = useState<ConnectivityState>(() => {
    if (typeof navigator === "undefined") return "online";
    return navigator.onLine ? "online" : "offline";
  });
  const wasOffline = useRef(state === "offline");
  const reconnectStartedAt = useRef(0);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearReconnectTimer() {
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    }

    function settleReconnect() {
      if (!reconnectStartedAt.current) return;
      const remaining = Math.max(0, RECONNECT_VISIBLE_MS - (Date.now() - reconnectStartedAt.current));
      clearReconnectTimer();
      reconnectTimer.current = window.setTimeout(() => {
        reconnectStartedAt.current = 0;
        reconnectTimer.current = null;
        setState(navigator.onLine ? "online" : "offline");
      }, remaining);
    }

    function handleOffline() {
      clearReconnectTimer();
      reconnectStartedAt.current = 0;
      wasOffline.current = true;
      setState("offline");
    }

    function handleOnline() {
      if (!wasOffline.current) {
        setState("online");
        return;
      }

      wasOffline.current = false;
      reconnectStartedAt.current = Date.now();
      setState("reconnecting");

      clearReconnectTimer();
      reconnectTimer.current = window.setTimeout(settleReconnect, RECONNECT_FALLBACK_MS);
    }

    function handleSyncSettled() {
      if (reconnectStartedAt.current) settleReconnect();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("dentalflow:desktop-sync-complete", handleSyncSettled as EventListener);
    window.addEventListener("dentalflow:desktop-sync-error", handleSyncSettled as EventListener);

    if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("dentalflow:desktop-sync-complete", handleSyncSettled as EventListener);
      window.removeEventListener("dentalflow:desktop-sync-error", handleSyncSettled as EventListener);
      clearReconnectTimer();
    };
  }, []);

  const isOffline = state === "offline";
  const isReconnecting = state === "reconnecting";

  return (
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
      title={isOffline ? "Sem conexão com a internet" : isReconnecting ? "Conexão restabelecida. Atualizando dados em segundo plano." : "Conectado e pronto"}
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
  );
}
