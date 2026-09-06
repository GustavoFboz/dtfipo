import { useEffect } from "react";
import { getDesktopRuntimeInfo, isDentalFlowDesktop } from "@/lib/desktop-local";

const READY_EVENT = "dentalflow:desktop-local-ready";

export function DesktopLocalRuntimeBridge() {
  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;
    document.documentElement.dataset.dentalflowDesktop = "initializing";

    getDesktopRuntimeInfo()
      .then((runtime) => {
        if (disposed) return;
        document.documentElement.dataset.dentalflowDesktop = "ready";
        window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: runtime }));
      })
      .catch((error) => {
        if (disposed) return;
        document.documentElement.dataset.dentalflowDesktop = "error";
        console.error("[DentalFlow Desktop] Falha ao inicializar o banco local", error);
      });

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
