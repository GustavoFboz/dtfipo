import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { installTombstoneGuard } from "@/lib/optimistic";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { installDesktopRuntimeOptimizations } from "@/lib/desktop-runtime-optimizations";

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

if (typeof window !== "undefined") {
  // Installed builds keep frequently reopened case files on persistent local
  // storage and hold the hidden notification renderer alive while in the tray.
  // The web build never installs this narrow fetch/cache layer.
  if (isDentalFlowDesktop()) installDesktopRuntimeOptimizations();

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
  const desktop = typeof window !== "undefined" && isDentalFlowDesktop();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // O Desktop possui reconciliação local, realtime e um coordenador próprio
        // de retorno de conexão. Deixar o React Query refazer tudo em paralelo no
        // reconnect criava uma tempestade de leituras exatamente após sleep/idle.
        staleTime: desktop ? 5 * 60_000 : 60_000,
        gcTime: desktop ? 30 * 60_000 : 15 * 60_000,
        refetchOnMount: false,
        refetchOnReconnect: desktop ? false : "always",
        refetchOnWindowFocus: false,
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
    defaultPreload: "intent",
    defaultPreloadDelay: 100,
    defaultPreloadStaleTime: desktop ? 5 * 60_000 : 30_000,
    defaultPendingMs: 1500,
    defaultPendingMinMs: 300,
    defaultErrorComponent: DefaultErrorComponent,
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
