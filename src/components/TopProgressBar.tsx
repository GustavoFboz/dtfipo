import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQueryClient, useIsMutating } from "@tanstack/react-query";

/**
 * Linha fina e fixa no topo indicando carregamento REAL.
 *
 * Regras (para não ficar "sempre em movimento"):
 *  - Navegação de rota em andamento (troca de página).
 *  - Queries em *primeiro* carregamento (ainda sem dados em cache) — refetch
 *    em background NÃO acende a barra, pois o usuário já vê a informação.
 *  - Mutations em andamento (ações do usuário que alteram dados).
 *  - Só aparece se o carregamento passar de 250ms (evita piscar em cada clique).
 */
function useInitialFetching() {
  const queryClient = useQueryClient();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const compute = () =>
      cache.getAll().filter(
        (q) =>
          q.state.fetchStatus === "fetching" &&
          q.state.data === undefined &&
          q.getObserversCount() > 0,
      ).length;
    setCount(compute());
    return cache.subscribe(() => setCount(compute()));
  }, [queryClient]);

  return count;
}

export function TopProgressBar() {
  const routerLoading = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading,
  });
  const initialFetching = useInitialFetching();
  const mutating = useIsMutating();
  const active = routerLoading || initialFetching > 0 || mutating > 0;

  const [visible, setVisible] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const clear = () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      showTimer.current = null;
      hideTimer.current = null;
    };

    if (active) {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (!visible && !showTimer.current) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = null;
          setVisible(true);
        }, 250);
      }
    } else {
      if (showTimer.current) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      if (visible && !hideTimer.current) {
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = null;
          setVisible(false);
        }, 150);
      }
    }
    return clear;
  }, [active, visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="tpb-root pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-[2px] overflow-hidden"
      style={{ opacity: 1, transition: "opacity 200ms ease-out" }}
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
