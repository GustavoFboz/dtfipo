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
            const url = new URL(lastPath, window.location.origin);
            if (url.origin === window.location.origin && url.pathname !== "/") {
              throw redirect({ href: lastPath });
            }
          }
        } catch (e) {
          if (typeof e === 'object' && e !== null && ('status' in e || 'isRedirect' in e)) throw e;
        }
      }
      throw redirect({ to: "/casos" });
    }
    
    throw redirect({ to: "/lp" });
  },
});
