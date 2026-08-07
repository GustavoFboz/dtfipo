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
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-white dark:bg-black">
      <div className="h-10 w-10 rounded-full bg-[#2D7FF9] grid place-items-center animate-pulse shadow-[0_0_20px_rgba(45,127,249,0.3)]">
        <span className="text-white text-sm font-semibold">D</span>
      </div>
    </div>
  ),
});
