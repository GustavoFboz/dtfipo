import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // @ts-ignore - Route /lab exists but tree might not be gen yet
      throw redirect({ to: "/lab" });
    }
    // @ts-ignore - Route /lp exists but tree might not be gen yet
    throw redirect({ to: "/lp" });
  },
});
