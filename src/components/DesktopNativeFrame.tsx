import { Minus, Square, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
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

const FALLBACK_LIGHT_CAPTION = "rgb(255, 255, 255)";
const FALLBACK_DARK_CAPTION = "rgb(2, 6, 23)";

function visibleTopHeader(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const headers = Array.from(document.querySelectorAll<HTMLElement>("header"));
  return (
    headers.find((header) => {
      const style = window.getComputedStyle(header);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = header.getBoundingClientRect();
      // A janela instalada pode ser estreita. O limite antigo de 520 px fazia o
      // cabeçalho deixar de ser reconhecido e permitia que os botões nativos
      // sobrepusessem ações importantes do sistema.
      return rect.width >= 240 && rect.height >= 42 && rect.top <= 16 && rect.bottom > 42;
    }) ?? null
  );
}

function syncNativeRouteMarker() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const key = window.location.pathname.split("/").filter(Boolean)[0] ?? "root";
  document.documentElement.dataset.dentalflowNativeRoute = key;
}

function parseRgb(color: string): [number, number, number, number] | null {
  const match = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] == null ? 1 : Number(match[4]),
  ];
}

function resolveCaptionBackground(header: HTMLElement | null) {
  const dark = document.documentElement.classList.contains("dark");
  const fallback = dark ? FALLBACK_DARK_CAPTION : FALLBACK_LIGHT_CAPTION;
  if (!header) return fallback;

  const parsed = parseRgb(window.getComputedStyle(header).backgroundColor);
  if (!parsed) return fallback;
  const [r, g, b, alpha] = parsed;
  if (alpha >= 0.995) return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

  const base = parseRgb(fallback) ?? [255, 255, 255, 1];
  const composite = [r, g, b].map((channel, index) =>
    Math.round(channel * alpha + base[index] * (1 - alpha)),
  );
  return `rgb(${composite[0]}, ${composite[1]}, ${composite[2]})`;
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
  const [captionBackground, setCaptionBackground] = useState(FALLBACK_LIGHT_CAPTION);
  const resizeStateTimer = useRef<number | null>(null);

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
    const scheduleStateSync = () => {
      if (resizeStateTimer.current !== null) window.clearTimeout(resizeStateTimer.current);
      resizeStateTimer.current = window.setTimeout(() => {
        resizeStateTimer.current = null;
        syncState();
      }, 120);
    };

    syncState();
    window.addEventListener("resize", scheduleStateSync);
    return () => {
      window.removeEventListener("resize", scheduleStateSync);
      if (resizeStateTimer.current !== null) window.clearTimeout(resizeStateTimer.current);
      resizeStateTimer.current = null;
      delete document.documentElement.dataset.dentalflowNativeWindow;
      delete document.documentElement.dataset.dentalflowNativeRoute;
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let current: HTMLElement | null = null;
    let frame = 0;
    let headerResizeObserver: ResizeObserver | null = null;

    const updateHeaderMetrics = (header: HTMLElement | null) => {
      if (header) {
        setCaptionHeight(Math.max(40, Math.round(header.getBoundingClientRect().height)));
      } else {
        setCaptionHeight(40);
      }
      setCaptionBackground(resolveCaptionBackground(header));
    };

    const watchHeaderSize = (header: HTMLElement | null) => {
      headerResizeObserver?.disconnect();
      headerResizeObserver = null;
      if (!header || typeof ResizeObserver === "undefined") return;
      headerResizeObserver = new ResizeObserver(() => updateHeaderMetrics(header));
      headerResizeObserver.observe(header);
    };

    const attach = () => {
      frame = 0;
      syncNativeRouteMarker();
      const next = visibleTopHeader();
      if (next === current) {
        updateHeaderMetrics(next);
        return;
      }
      if (current) delete current.dataset.dentalflowNativeHeader;
      current = next;
      if (current) current.dataset.dentalflowNativeHeader = "true";
      setHeaderHost(current);
      updateHeaderMetrics(current);
      watchHeaderSize(current);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(attach);
    };

    attach();

    // O observador anterior acompanhava class/style de toda a árvore. Em telas
    // com animações isso acordava a cada frame e forçava getComputedStyle/layout.
    // Agora observamos apenas mudanças estruturais e a classe de tema no <html>.
    const structureObserver = new MutationObserver(schedule);
    structureObserver.observe(document.body, { childList: true, subtree: true });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    window.addEventListener("resize", schedule);
    window.addEventListener("popstate", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      structureObserver.disconnect();
      themeObserver.disconnect();
      headerResizeObserver?.disconnect();
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
    // run only changes native state; listeners only need the current host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, headerHost]);

  if (!desktop) return <>{children}</>;

  const captionControls = typeof document !== "undefined"
    ? createPortal(
        <div
          data-dentalflow-window-controls
          data-no-window-drag
          className="fixed right-0 top-0 flex shrink-0 items-stretch text-slate-500 dark:text-slate-300"
          style={{ height: captionHeight, zIndex: 2147483646, backgroundColor: captionBackground }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Minimizar"
            title="Minimizar"
            onClick={() => void run("minimize")}
            className="grid w-[46px] place-items-center bg-transparent transition-colors hover:bg-black/[0.055] hover:text-slate-800 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <Minus className="h-3.5 w-3.5 stroke-[1.3]" />
          </button>
          <button
            type="button"
            aria-label={maximized ? "Restaurar" : "Maximizar"}
            title={maximized ? "Restaurar" : "Maximizar"}
            onClick={() => void run("toggle_maximize")}
            className="grid w-[46px] place-items-center bg-transparent transition-colors hover:bg-black/[0.055] hover:text-slate-800 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            {maximized ? <RestoreIcon /> : <Square className="h-3 w-3 stroke-[1.2]" />}
          </button>
          <button
            type="button"
            aria-label="Fechar"
            title="Fechar"
            onClick={() => void run("close")}
            className="grid w-[46px] place-items-center bg-transparent transition-colors hover:bg-[#c42b1c] hover:text-white"
          >
            <X className="h-4 w-4 stroke-[1.35]" />
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className="fixed inset-0 z-[1] overflow-hidden bg-background text-foreground"
      data-dentalflow-native-frame
    >
      <div className="absolute inset-0 overflow-hidden bg-background">{children}</div>

      {captionControls}

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
