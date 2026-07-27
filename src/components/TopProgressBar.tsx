import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Linha fina e fixa no topo indicando carregamento (navegação de rotas,
 * fetch/mutations do React Query). Não altera o layout — usa position: fixed
 * e fica em cima de tudo. Anima uma "sanfona" azul de ponta a ponta enquanto
 * o carregamento estiver ativo e desaparece suavemente quando termina.
 */
export function TopProgressBar() {
  const routerLoading = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading || s.isTransitioning,
  });
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = routerLoading || fetching > 0 || mutating > 0;

  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setVisible(true);
    } else if (visible) {
      hideTimer.current = window.setTimeout(() => setVisible(false), 250);
    }
    return () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [active, visible]);

  return (
    <div
      aria-hidden
      className="tpb-root pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-[2px] overflow-hidden"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease-out",
      }}
    >
      <div className="tpb-indeterminate absolute inset-y-0 bg-[#1F8AFF]" />
      <style>{`
        .tpb-indeterminate {
          left: -40%;
          width: 40%;
          border-radius: 9999px;
          animation: tpb-slide 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          box-shadow: 0 0 8px rgba(31, 138, 255, 0.6);
        }
        @keyframes tpb-slide {
          0%   { left: -40%; width: 40%; }
          50%  { left: 30%;  width: 55%; }
          100% { left: 100%; width: 40%; }
        }
      `}</style>
    </div>
  );
}
