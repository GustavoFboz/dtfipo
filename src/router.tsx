import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { installTombstoneGuard } from "@/lib/optimistic";

function isStaleAssetError(error: Error) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|dynamically imported module|ChunkLoadError/i.test(
    error.message,
  );
}

async function recoverFromStaleAssets() {
  if (typeof window === "undefined") return;

  const key = "dentalflow:stale-assets-reload";
  const now = Date.now();
  const last = Number(sessionStorage.getItem(key) || "0");
  // Só bloqueia se já recarregamos há menos de 30s (evita loop de reload).
  if (last && now - last < 30_000) return;
  sessionStorage.setItem(key, String(now));

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch { /* noop */ }
  }

  window.location.reload();
}

// Captura erros globais de import dinâmico (modais lazy, chunks) que
// escapam do errorComponent do router e deixariam a UI em branco.
if (typeof window !== "undefined") {
  const globalHandler = (msg: unknown) => {
    const text = typeof msg === "string" ? msg : (msg as Error)?.message ?? "";
    if (isStaleAssetError({ message: text } as Error)) {
      recoverFromStaleAssets();
    }
  };
  window.addEventListener("error", (e) => globalHandler(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => globalHandler(e.reason));
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    if (isStaleAssetError(error)) {
      recoverFromStaleAssets();
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isStaleAssetError(error)
            ? "Atualizando os arquivos do sistema. Se não recarregar automaticamente, tente novamente."
            : error.message}
        </p>
        <button
          onClick={() => { recoverFromStaleAssets(); router.invalidate(); reset(); }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >Tentar novamente</button>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Dados frescos por 60s — reaproveita cache instantaneamente ao clicar.
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        // Polling global desativado: causava N requisições paralelas a cada
        // 30s em queries que não precisam disso, travando a UI no reload.
        // Queries que precisam de "ao vivo" (notificações, casos) devem
        // definir refetchInterval individualmente.
        refetchOnMount: false,
        refetchOnReconnect: "always",
        refetchOnWindowFocus: false,
        // Mantém dados anteriores durante refetch (sem flash de loading).
        placeholderData: (prev: unknown) => prev,
        retry: 1,
      },
    },
  });
  installTombstoneGuard(queryClient);
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Pré-carrega no hover/focus, sem delay — clique é instantâneo.
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 60_000,
    // Nunca mostra pendingComponent na navegação (mantém tela anterior até nova estar pronta).
    defaultPendingMs: 2_000_000,
    defaultPendingMinMs: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
