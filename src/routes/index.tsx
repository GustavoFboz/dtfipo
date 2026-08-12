import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      if (typeof window !== "undefined") {
        try {
          const lastPath = sessionStorage.getItem("last_path");
          if (lastPath) {
            // Se o lastPath for o index ("/"), evite loop redirecionando para /casos
            const url = new URL(lastPath, window.location.origin);
            if (url.origin === window.location.origin && url.pathname !== "/") {
              console.log("Redirecting to last saved path:", lastPath);
              throw redirect({ href: lastPath });
            }
          }
        } catch (e) {
          // Se for um objeto de redirecionamento do TanStack, relance
          if (typeof e === 'object' && e !== null && ('status' in e || 'isRedirect' in e || 'statusText' in e)) throw e;
        }
      }
      throw redirect({ to: "/casos" });
    }
    
    throw redirect({ to: "/lp" });
  },
});
