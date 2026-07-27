import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    // @ts-expect-error iOS
    window.navigator.standalone === true
  );
}

/**
 * Impede que gestos/atalhos de "voltar" e "avançar" fechem o PWA.
 * - Mantém uma sentinela no history para popstate nunca sair do app.
 * - Intercepta Alt+←/→ e Backspace (fora de campos) e delega ao router.
 */
export function usePWANavGuard() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isStandalone()) return;

    const SENTINEL = "__df_guard__";
    // Empurra sentinela quando a stack está no início desta sessão.
    if (!window.history.state || !(window.history.state as { [k: string]: unknown })[SENTINEL]) {
      window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL]: true }, "");
    }

    const onPop = () => {
      const state = window.history.state as { [k: string]: unknown } | null;
      const guarded = state && state[SENTINEL];
      // Se caímos na sentinela (usuário voltou além da raiz do app),
      // re-empurra para impedir fechamento e navega para a home logicamente.
      if (guarded) {
        window.history.pushState({ [SENTINEL]: true }, "");
        try {
          router.navigate({ to: "/" });
        } catch { /* noop */ }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (e.key === "ArrowLeft") window.history.back();
        else window.history.forward();
      } else if (e.key === "Backspace" && !isEditable) {
        e.preventDefault();
        window.history.back();
      }
    };

    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, [router]);
}
