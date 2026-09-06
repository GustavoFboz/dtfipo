import { Maximize2, Minus, Square, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  getDesktopWindowState,
  isDentalFlowDesktop,
  performDesktopWindowAction,
} from "@/lib/desktop-local";

export function DesktopNativeFrame({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);

  // Keep the server/prerendered markup identical to the first client render.
  // The Tauri global only exists after the desktop WebView has started.
  useEffect(() => {
    setDesktop(isDentalFlowDesktop());
  }, []);

  useEffect(() => {
    if (!desktop) return;
    document.documentElement.dataset.dentalflowNativeWindow = "true";
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    document.body.style.fontFamily = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
    void getDesktopWindowState().then((state) => setMaximized(state.maximized)).catch(() => {});

    const syncState = () => {
      void getDesktopWindowState().then((state) => setMaximized(state.maximized)).catch(() => {});
    };
    window.addEventListener("resize", syncState);
    return () => window.removeEventListener("resize", syncState);
  }, [desktop]);

  if (!desktop) return <>{children}</>;

  const run = async (action: "minimize" | "toggle_maximize" | "drag" | "close") => {
    try {
      const state = await performDesktopWindowAction(action);
      if (action !== "close") setMaximized(state.maximized);
    } catch (error) {
      console.warn("[DentalFlow Desktop] Falha no controle nativo da janela", error);
    }
  };

  return (
    <div
      className={[
        "fixed z-[2147483000] overflow-hidden bg-background text-foreground",
        "border border-white/60 shadow-[0_22px_70px_rgba(15,23,42,0.28),0_2px_10px_rgba(15,23,42,0.16)]",
        "dark:border-white/10 dark:shadow-[0_26px_80px_rgba(0,0,0,0.72)]",
        maximized ? "inset-0 rounded-none" : "inset-[6px] rounded-[18px]",
      ].join(" ")}
      data-dentalflow-native-frame
    >
      <div
        className="absolute inset-x-0 top-0 z-[2147483640] flex h-9 select-none items-center border-b border-black/[0.055] bg-white/78 pl-3 backdrop-blur-2xl dark:border-white/[0.07] dark:bg-[#090c11]/86"
        onDoubleClick={() => void run("toggle_maximize")}
      >
        <button
          type="button"
          aria-label="Mover janela"
          title="DentalFlow"
          className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 text-left"
          onPointerDown={(event) => {
            if (event.button === 0 && event.detail === 1) void run("drag");
          }}
        >
          <img src="/icon-512.png" alt="" className="h-[17px] w-[17px] rounded-[4px] object-cover" draggable={false} />
          <span className="truncate text-[11px] font-medium tracking-[-0.01em] text-slate-500 dark:text-slate-400">
            DentalFlow
          </span>
          <span className="ml-1 hidden rounded-full border border-slate-200/70 bg-white/65 px-2 py-0.5 text-[9px] font-medium text-slate-400 xl:inline dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-500">
            Desktop
          </span>
        </button>

        <div className="ml-auto flex h-full items-stretch" onDoubleClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            aria-label="Minimizar"
            onClick={() => void run("minimize")}
            className="grid w-11 place-items-center text-slate-500 transition-colors hover:bg-slate-950/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.07]"
          >
            <Minus className="h-3.5 w-3.5 stroke-[1.4]" />
          </button>
          <button
            type="button"
            aria-label={maximized ? "Restaurar" : "Maximizar"}
            onClick={() => void run("toggle_maximize")}
            className="grid w-11 place-items-center text-slate-500 transition-colors hover:bg-slate-950/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.07]"
          >
            {maximized ? <Maximize2 className="h-3 w-3 stroke-[1.35]" /> : <Square className="h-3 w-3 stroke-[1.35]" />}
          </button>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => void run("close")}
            className="grid w-12 place-items-center text-slate-500 transition-colors hover:bg-[#c42b1c] hover:text-white dark:text-slate-400"
          >
            <X className="h-4 w-4 stroke-[1.4]" />
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 top-9 overflow-hidden bg-background">
        {children}
      </div>
    </div>
  );
}
