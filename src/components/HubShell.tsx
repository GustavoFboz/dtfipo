import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Grid2X2, LogOut, Moon, Sun } from "lucide-react";

import { fetchProfile } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";

export function HubShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 5 * 60_000,
  });

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } });
  }

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900 dark:bg-[#07090d] dark:text-white">
      <header className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/70 bg-white/88 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#090b10]/88">
        <div className="mx-auto flex h-full max-w-[1500px] items-center justify-between px-5 md:px-8">
          <Link to="/hub" className="flex items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-80">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#2D7FF9] text-white shadow-[0_8px_24px_-10px_rgba(45,127,249,0.7)]">
              <span className="text-sm font-semibold">D</span>
            </div>
            <div>
              <div className="flex items-baseline text-[15px] tracking-tight">
                <span className="font-light">DENTAL</span><span className="font-bold">FLOW</span><span className="ml-1 text-[9px] font-medium text-slate-400">BR</span>
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">Central de módulos</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-3 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 sm:flex dark:border-white/10 dark:bg-white/[0.03]">
              <div className="grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-slate-100 text-xs font-semibold text-primary dark:bg-white/5">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name ?? "Perfil"} className="h-full w-full object-cover" /> : (profile?.full_name?.[0]?.toUpperCase() ?? "U")}
              </div>
              <div className="max-w-[150px]">
                <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{profile?.full_name || "Minha conta"}</div>
                <div className="text-[10px] text-slate-400">DentalFlow</div>
              </div>
            </div>
            <button onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white" title={theme === "dark" ? "Tema claro" : "Tema escuro"}>
              {theme === "dark" ? <Sun className="h-5 w-5 stroke-[1.5]" /> : <Moon className="h-5 w-5 stroke-[1.5]" />}
            </button>
            <button onClick={handleLogout} className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/20" title="Sair">
              <LogOut className="h-5 w-5 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-[72px]">
        <Outlet />
      </main>

      <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400 shadow-sm backdrop-blur md:flex dark:border-white/10 dark:bg-black/40">
        <Grid2X2 className="h-3.5 w-3.5" /> DentalFlow Hub
      </div>
    </div>
  );
}
