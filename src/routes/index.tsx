import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // @ts-ignore
      throw redirect({ to: "/lab" });
    }
    // @ts-ignore
    throw redirect({ to: "/lp" });
  },
});
