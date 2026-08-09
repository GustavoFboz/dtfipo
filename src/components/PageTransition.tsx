import { type ReactNode, useEffect, useState } from "react";

/**
 * Route transition presenter.
 *
 * AppShell owns the timing so navigation only happens while this component is
 * in the blank phase. That prevents the old Outlet from being mounted again
 * between the exit and the next route's entrance animation.
 */
export function PageTransition({
  pathname,
  children,
  phase = "idle",
  transitionKey = 0,
}: {
  pathname: string;
  children: ReactNode;
  phase?: "idle" | "exiting" | "blank" | "entering";
  transitionKey?: number;
}) {
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const update = () => setIsLocked(document.body.hasAttribute("data-scroll-locked"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    return () => obs.disconnect();
  }, []);
  // Lab↔Dentes usa animações dedicadas nas próprias rotas. Nessas transições
  // o AppShell mantém o phase em "idle" (não passa pelo handleAnimatedNavigation),
  // então detectamos o par exatamente por essa combinação e ignoramos o wrapper
  // animado. Para navegações vindas do menu lateral, o phase é "exiting"/"entering"
  // e o wrapper animado continua sendo aplicado normalmente sobre /lab.
  const isLabOrDentes = pathname.startsWith("/lab") || pathname.startsWith("/dentes");
  const skipTransition = isLabOrDentes && phase === "idle";


  const wrapper = "max-w-[1600px] mx-auto min-h-full h-full";

  if (skipTransition) {
    return <div className={`relative z-10 ${wrapper}`}>{children}</div>;
  }

  if (phase === "blank") {
    // Hard blank: no Outlet is mounted while the route is being swapped.
    return null;
  }

  const motionClass =
    phase === "exiting"
      ? "animate-page-exit"
      : phase === "entering"
        ? "animate-page-rise"
        : "";

  return (
    <div
      key={`${pathname}-${transitionKey}-${phase === "exiting" ? "exit" : "page"}`}
      className={`relative z-10 ${wrapper} ${motionClass} ${isLocked ? "!blur-none grayscale-[0.05] brightness-[0.98] opacity-[0.98]" : ""}`}
    >
      {children}
    </div>
  );
}
