import * as React from "react";

type ScrollSnapshot = {
  windowX: number;
  windowY: number;
  appTop: number;
  appLeft: number;
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

const getAppScrollContainer = () =>
  document.querySelector<HTMLElement>('[data-scroll-container="app"]') ?? document.querySelector<HTMLElement>("main");

const takeSnapshot = (): ScrollSnapshot => {
  const app = getAppScrollContainer();
  return {
    windowX: window.scrollX || 0,
    windowY: window.scrollY || 0,
    appTop: app?.scrollTop ?? 0,
    appLeft: app?.scrollLeft ?? 0,
  };
};

const restoreSnapshot = (snap: ScrollSnapshot | null) => {
  if (typeof window === "undefined" || !snap) return;
  const app = getAppScrollContainer();
  if (app) {
    app.scrollTop = snap.appTop;
    app.scrollLeft = snap.appLeft;
    return;
  }
  window.scrollTo({ left: snap.windowX, top: snap.windowY, behavior: "auto" });
};

export function usePreservePageScrollOnOpenChange(
  open: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
) {
  const initiallyOpen = open ?? defaultOpen ?? false;
  const savedRef = React.useRef<ScrollSnapshot | null>(
    typeof window !== "undefined" && initiallyOpen ? takeSnapshot() : null,
  );
  const wasOpenRef = React.useRef(initiallyOpen);

  const capture = React.useCallback(() => {
    if (typeof window === "undefined") return;
    savedRef.current = takeSnapshot();
  }, []);

  const restore = React.useCallback(() => {
    restoreSnapshot(savedRef.current);
    savedRef.current = null;
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined" || open === undefined) return;
    const wasOpen = wasOpenRef.current;
    if (open && !wasOpen) capture();
    if (!open && wasOpen) restore();
    wasOpenRef.current = open;
  }, [open, capture, restore]);

  useIsomorphicLayoutEffect(() => {
    return () => {
      if (wasOpenRef.current && savedRef.current) restore();
    };
  }, [restore]);

  return React.useCallback(
    (nextOpen: boolean) => {
      if (typeof window !== "undefined") {
        const wasOpen = wasOpenRef.current;
        if (nextOpen && !wasOpen) capture();
        if (!nextOpen && wasOpen) restore();
        wasOpenRef.current = nextOpen;
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, capture, restore],
  );
}

export function usePreservePageScroll(open: boolean) {
  // O layout effect interno já reage a mudanças de `open`; evitamos disparar
  // capture/restore em duplicidade (que causava re-render extras).
  usePreservePageScrollOnOpenChange(open, false, undefined);
}
