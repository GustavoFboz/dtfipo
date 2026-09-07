import { Minus, Square, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  getDesktopWindowState,
  isDentalFlowDesktop,
  performDesktopWindowAction,
} from "@/lib/desktop-local";
import "@/desktop-native.css";
import "@/desktop-dialog-portals.css";

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

function syncNativeRouteMarker() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const key = window.location.pathname.split("/").filter(Boolean)[0] ?? "root";
  document.documentElement.dataset.dentalflowNativeRoute = key;
}

function RestoreIcon() {
  return (
    <span className="relative block h-3.5 w-3.5" aria-hidden="true">
      <span className="absolute left-[3px] top-0 h-[10px] w-[10px] border border-current" />
      <span className="absolute bottom-0 left-0 h-[10px] w-[10px] border border-current bg-white dark:bg-slate-950" />
    </span>
  );
}

export function DesktopNativeFrame({ children }: { children: ReactNode }) {
  const [desktop, setDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [captionHeight, setCaptionHeight] = useState(40);

  useEffect(() => {
    setDesktop(isDentalFlowDesktop());
  }, []);

  useEffect(() => {
    if (!desktop) return;
    document.documentElement.dataset.dentalflowNativeWindow = "true";
    syncNativeRouteMarker();
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
    document.body.style.fontFamily = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

    const syncState = () => {
      void getDesktopWindowState().then((state) => setMaximized(state.maximized)).catch(() => {});
    };
    syncState();
    window.addEventListener("resize", syncState);
    return () => {
      window.removeEventListener("resize", syncState);
      delete document.documentElement.dataset.dentalflowNativeWindow;
      delete document.documentElement.dataset.dentalflowNativeRoute;
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let current: HTMLElement | null = null;
    let frame = 0;

    const attach = () => {
      frame = 0;
      syncNativeRouteMarker();
      const next = visibleTopHeader();
      if (next === current) {
        if (next) setCaptionHeight(Math.max(40, Math.round(next.getBoundingClientRect().height)));
        return;
      }
      if (current) delete current.dataset.dentalflowNativeHeader;
      current = next;
      if (current) {
        current.dataset.dentalflowNativeHeader = "true";
        setCaptionHeight(Math.max(40, Math.round(current.getBoundingClientRect().height)));
      } else {
        setCaptionHeight(40);
      }
      setHeaderHost(current);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(attach);
    };

    attach();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("popstate", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("popstate", schedule);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, headerHost]);

  if (!desktop) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-[1] overflow-hidden bg-background text-foreground"
      data-dentalflow-native-frame
    >
      <div className="absolute inset-0 overflow-hidden bg-background">{children}</div>

      {/* Always render our Windows caption buttons. The previous portal inserted
          them as a second child of <header>; because the header already had a
          full-height first child, the controls could land outside its 72 px box
          and effectively disappear. */}
      <div
        data-dentalflow-window-controls
        data-no-window-drag
        className="absolute right-0 top-0 z-[90] flex shrink-0 items-stretch text-slate-500 dark:text-slate-300"
        style={{ height: captionHeight }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Minimizar"
          title="Minimizar"
          onClick={() => void run("minimize")}
          className="grid w-[46px] place-items-center transition-colors hover:bg-black/[0.055] hover:text-slate-800 dark:hover:bg-white/[0.08] dark:hover:text-white"
        >
          <Minus className="h-3.5 w-3.5 stroke-[1.3]" />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          title={maximized ? "Restaurar" : "Maximizar"}
          onClick={() => void run("toggle_maximize")}
          className="grid w-[46px] place-items-center transition-colors hover:bg-black/[0.055] hover:text-slate-800 dark:hover:bg-white/[0.08] dark:hover:text-white"
        >
          {maximized ? <RestoreIcon /> : <Square className="h-3 w-3 stroke-[1.2]" />}
        </button>
        <button
          type="button"
          aria-label="Fechar"
          title="Fechar"
          onClick={() => void run("close")}
          className="grid w-[46px] place-items-center transition-colors hover:bg-[#c42b1c] hover:text-white"
        >
          <X className="h-4 w-4 stroke-[1.35]" />
        </button>
      </div>

      {!headerHost ? (
        <div
          aria-hidden="true"
          data-dentalflow-window-drag-edge
          className="absolute left-0 right-[138px] top-0 z-[80] h-10 cursor-default"
          onPointerDown={(event) => {
            if (event.button === 0) void run("drag");
          }}
          onDoubleClick={() => void run("toggle_maximize")}
        />
      ) : null}
    </div>
  );
}
