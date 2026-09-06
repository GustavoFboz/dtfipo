import { Maximize2, Minus, Square, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  getDesktopWindowState,
  isDentalFlowDesktop,
  performDesktopWindowAction,
} from "@/lib/desktop-local";

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role='button']",
  "[contenteditable='true']",
  "[data-no-window-drag]",
  "[data-dentalflow-window-controls]",
].join(",");

function visibleTopHeader(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const headers = Array.from(document.querySelectorAll<HTMLElement>("header"));
  return (
    headers.find((header) => {
      const style = window.getComputedStyle(header);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = header.getBoundingClientRect();
      return rect.width >= 520 && rect.height >= 42 && rect.top <= 16 && rect.bottom > 42;
    }) ?? null
  );
}

export function DesktopNativeFrame({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!desktop) return;
    let current: HTMLElement | null = null;
    let frame = 0;

    const attach = () => {
      frame = 0;
      const next = visibleTopHeader();
      if (next === current) return;
      if (current) delete current.dataset.dentalflowNativeHeader;
      current = next;
      if (current) current.dataset.dentalflowNativeHeader = "true";
      setHeaderHost(current);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(attach);
    };

    attach();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (current) delete current.dataset.dentalflowNativeHeader;
      setHeaderHost(null);
    };
  }, [desktop]);

  const run = async (action: "minimize" | "toggle_maximize" | "drag" | "close") => {
    try {
      const state = await performDesktopWindowAction(action);
      if (action !== "close") setMaximized(state.maximized);
    } catch (error) {
      console.warn("[DentalFlow Desktop] Falha no controle nativo da janela", error);
    }
  };

  useEffect(() => {
    if (!desktop || !headerHost) return;

    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) return;
      void run("drag");
    };
    const doubleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) return;
      void run("toggle_maximize");
    };

    headerHost.addEventListener("pointerdown", pointerDown);
    headerHost.addEventListener("dblclick", doubleClick);
    return () => {
      headerHost.removeEventListener("pointerdown", pointerDown);
      headerHost.removeEventListener("dblclick", doubleClick);
    };
    // run only depends on Tauri commands and local state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, headerHost]);

  if (!desktop) return <>{children}</>;

  const controls = headerHost
    ? createPortal(
        <div
          data-dentalflow-window-controls
          data-no-window-drag
          className="ml-2 flex h-full shrink-0 items-stretch border-l border-slate-200/60 pl-1 dark:border-white/[0.08]"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Minimizar"
            title="Minimizar"
            onClick={() => void run("minimize")}
            className="grid w-10 place-items-center text-slate-400 transition-colors hover:bg-slate-950/[0.055] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
          >
            <Minus className="h-3.5 w-3.5 stroke-[1.35]" />
          </button>
          <button
            type="button"
            aria-label={maximized ? "Restaurar" : "Maximizar"}
            title={maximized ? "Restaurar" : "Maximizar"}
            onClick={() => void run("toggle_maximize")}
            className="grid w-10 place-items-center text-slate-400 transition-colors hover:bg-slate-950/[0.055] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
          >
            {maximized ? <Maximize2 className="h-3 w-3 stroke-[1.3]" /> : <Square className="h-3 w-3 stroke-[1.3]" />}
          </button>
          <button
            type="button"
            aria-label="Fechar"
            title="Fechar"
            onClick={() => void run("close")}
            className="grid w-11 place-items-center rounded-tr-[inherit] text-slate-400 transition-colors hover:bg-[#c42b1c] hover:text-white dark:text-slate-400"
          >
            <X className="h-4 w-4 stroke-[1.35]" />
          </button>
        </div>,
        headerHost,
      )
    : null;

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
      <div className="absolute inset-0 overflow-hidden bg-background">{children}</div>
      {controls}
      {!headerHost ? (
        <div
          aria-hidden="true"
          data-dentalflow-window-drag-edge
          className="absolute inset-x-3 top-0 z-[2147483630] h-[5px] cursor-default"
          onPointerDown={(event) => {
            if (event.button === 0) void run("drag");
          }}
          onDoubleClick={() => void run("toggle_maximize")}
        />
      ) : null}
    </div>
  );
}
