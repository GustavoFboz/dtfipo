import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, LogOut, Moon, Sun } from "lucide-react";

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
    <div className="min-h-screen bg-[#f6f9fc] text-slate-900 dark:bg-[#07090d] dark:text-white">
      <header className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#090b10]/95">
        <div className="flex h-full min-w-0 items-center px-3 sm:px-5 md:px-6">
          <Link
            to="/hub"
            data-no-window-drag
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-[#2D7FF9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7FF9]/35 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            title="Início"
            aria-label="Voltar ao início"
          >
            <Home className="h-[20px] w-[20px] stroke-[1.5]" />
          </Link>

          <Link
            to="/hub"
            data-no-window-drag
            className="ml-1.5 flex min-w-0 items-center gap-2.5 rounded-2xl px-1.5 py-1 transition hover:opacity-80 sm:ml-2"
            aria-label="DentalFlow — ambientes de trabalho"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-[#2D7FF9] text-white shadow-[0_8px_24px_-12px_rgba(45,127,249,0.72)]">
              <span className="text-[13px] font-semibold">D</span>
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-baseline whitespace-nowrap text-[14px] tracking-tight">
                <span className="font-light">DENTAL</span><span className="font-bold">FLOW</span><span className="ml-1 text-[8px] font-medium text-slate-400">BR</span>
              </div>
              <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-slate-400">Ambientes</div>
            </div>
          </Link>

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
            <div className="hidden items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-white px-2.5 py-1.5 xl:flex dark:border-white/10 dark:bg-white/[0.03]">
              <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-xs font-semibold text-[#2D7FF9] dark:bg-white/5">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name ?? "Perfil"} className="h-full w-full object-cover" />
                ) : (
                  profile?.full_name?.[0]?.toUpperCase() ?? "U"
                )}
              </div>
              <div className="max-w-[150px] min-w-0">
                <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{profile?.full_name || "Minha conta"}</div>
                <div className="text-[9px] text-slate-400">DentalFlow</div>
              </div>
            </div>

            <button
              type="button"
              data-no-window-drag
              onClick={toggleTheme}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
              title={theme === "dark" ? "Tema claro" : "Tema escuro"}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {theme === "dark" ? <Sun className="h-[19px] w-[19px] stroke-[1.45]" /> : <Moon className="h-[19px] w-[19px] stroke-[1.45]" />}
            </button>

            <button
              type="button"
              data-no-window-drag
              onClick={handleLogout}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 dark:hover:bg-rose-950/20"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-[19px] w-[19px] stroke-[1.45]" />
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-[72px]">
        <Outlet />
      </main>
    </div>
  );
}
