import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { TopProgressBar } from "@/components/TopProgressBar";
import { UploadProgressDock } from "@/components/UploadProgressDock";
import { ConfirmHost } from "@/lib/confirm";
import { tryAutoConnectPrinter } from "@/lib/print-note/bluetooth";
import { usePWANavGuard } from "@/hooks/use-pwa-nav-guard";
import { useSessionLifecycle } from "@/hooks/use-session-lifecycle";
import { logAuditEvent } from "@/lib/audit";
import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Ir para o início
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#2D7FF9" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "DentalFlow" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "DentalFlowPro" },
      { name: "description", content: "[DESENVOLVIMENTO] Sistema de Gestão e Controle para Clinicas e Laboratórios Odontológicos" },
      { property: "og:title", content: "DentalFlowPro" },
      { name: "twitter:title", content: "DentalFlowPro" },
      { property: "og:description", content: "[DESENVOLVIMENTO] Sistema de Gestão e Controle para Clinicas e Laboratórios Odontológicos" },
      { name: "twitter:description", content: "[DESENVOLVIMENTO] Sistema de Gestão e Controle para Clinicas e Laboratórios Odontológicos" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/44a66a7b-2487-4c3d-a7c7-38bf992aaaef" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/44a66a7b-2487-4c3d-a7c7-38bf992aaaef" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Google+Sans+Display:wght@300;400;500;700&family=Google+Sans+Text:wght@400;500;700&display=swap" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
      { rel: "icon", type: "image/png", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('df-theme');if(t==='dark'){document.documentElement.classList.add('dark');}var a=localStorage.getItem('df-arcada-style');if(a==='azul'){document.documentElement.setAttribute('data-arcada','azul');}document.documentElement.classList.add('refresh-boot');window.addEventListener('load',function(){setTimeout(function(){document.documentElement.classList.remove('refresh-boot');},600);});}catch(e){}`,
          }}
        />

      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    // Guarda o user id atual para ignorar eventos "SIGNED_IN" que o Supabase
    // dispara toda vez que a aba volta ao foco (re-hidratação de sessão).
    // Sem isso, cada troca de aba invalidava TODAS as queries e o router,
    // gerando um refetch massivo que deixava a tela em branco por segundos.
    let currentUserId: string | null | undefined;
    supabase.auth.getSession().then(({ data }) => {
      currentUserId = data.session?.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const nextUserId = session?.user?.id ?? null;
      // Só age quando o usuário realmente mudou (login/logout/troca de conta).
      if (nextUserId === currentUserId) return;
      currentUserId = nextUserId;
      // CRÍTICO: cancela requisições em voo e LIMPA todo o cache do React Query
      // ao trocar de identidade. Sem isso, dados do usuário anterior aparecem
      // por um instante na tela do novo usuário (ou na tela de login) antes
      // do refetch chegar. `removeQueries()` é síncrono e apaga qualquer
      // resultado cacheado, evitando o flash de dados de outra conta.
      queryClient.cancelQueries();
      queryClient.removeQueries();
      router.invalidate();
      // Só dispara refetch quando existe sessão. Em SIGNED_OUT não há token —
      // refazer queries protegidas geraria uma tempestade de 401.
      if (event !== "SIGNED_OUT" && nextUserId) queryClient.invalidateQueries();
      // Auditoria: registra troca de identidade em admin_logs (best-effort).
      if (event === "SIGNED_IN" && nextUserId) void logAuditEvent("auth.login", { via: "session" });
      if (event === "SIGNED_OUT") void logAuditEvent("auth.logout", { via: "session" });
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Reconecta a impressora Bluetooth pareada em background (sem popup).
    tryAutoConnectPrinter().catch(() => {});
  }, []);
  usePWANavGuard();
  return (
    <QueryClientProvider client={queryClient}>
      <SessionLifecycleBridge />
      <TopProgressBar />
      <Outlet />
      <Toaster />
      <UploadProgressDock />
      <ConfirmHost />
    </QueryClientProvider>
  );
}

function SessionLifecycleBridge() {
  useSessionLifecycle();
  return null;
}
