import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Recovery logic: if we have a saved path from a refresh, go there instead of defaulting to /casos
      if (typeof window !== "undefined") {
        try {
          const lastPath = sessionStorage.getItem("last_path");
          if (lastPath) {
            // Only redirect if it's a valid internal path and different from root
            const url = new URL(lastPath, window.location.origin);
            if (url.origin === window.location.origin && url.pathname !== "/") {
              throw redirect({ href: lastPath });
            }
          }
        } catch (e) {
          // Re-throw TanStack Router redirects
          if (typeof e === 'object' && e !== null && ('status' in e || 'isRedirect' in e)) throw e;
        }
      }
      throw redirect({ to: "/casos" });
    }
    
    throw redirect({ to: "/lp" });
  },
});
