import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Home, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { ClinicSidebar } from "@/components/ClinicSidebar";
import { NotificationPanel } from "@/components/NotificationPanel";
import { fetchProfile } from "@/lib/api";
import { fetchClinicContext } from "@/lib/clinic";
import { supabase } from "@/integrations/supabase/client";

const CLINIC_SIDEBAR_STORAGE_KEY = "dentalflow:clinic-sidebar-collapsed";

export function ClinicShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(CLINIC_SIDEBAR_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return window.innerWidth < 1280;
  });

  const { data: context } = useQuery({
    queryKey: ["clinic_context"],
    queryFn: fetchClinicContext,
    staleTime: 60_000,
  });
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 5 * 60_000,
  });

  const hasClinic = Boolean(context?.hasClinicalModule);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLINIC_SIDEBAR_STORAGE_KEY, isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined, returnTo: undefined } });
  }

  return (
    <div className="min-h-screen bg-[#f7fafc] text-slate-900 dark:bg-[#070a0e] dark:text-white">
      <header className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/70 bg-white/94 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#090c11]/94">
        <div className="flex h-full items-center justify-between px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-5">
            {hasClinic && (
              <button
                type="button"
                onClick={() => setIsCollapsed((value) => !value)}
                className="hidden h-10 w-6 shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-slate-700 md:flex dark:hover:text-slate-200"
                aria-label={isCollapsed ? "Expandir painel lateral" : "Recolher painel lateral"}
                title={isCollapsed ? "Expandir painel" : "Recolher painel"}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}

            <Link to="/clinica" className="flex min-w-0 items-center gap-3 rounded-xl transition hover:opacity-85">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1e8f87] text-white shadow-[0_8px_24px_-12px_rgba(30,143,135,0.8)]">
                <Building2 className="h-5 w-5 stroke-[1.55]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline whitespace-nowrap text-[15px] tracking-tight">
                  <span className="font-light">DENTAL</span><span className="font-bold">FLOW</span><span className="ml-1 text-[9px] font-medium text-slate-400">BR</span>
                </div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1e8f87]">Clínica</div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <NotificationPanel profile={profile ?? undefined} />
            <Link
              to="/hub"
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-[#1e8f87] dark:hover:bg-white/5"
              title="Início"
              aria-label="Voltar ao início"
            >
              <Home className="h-[21px] w-[21px] stroke-[1.4px]" />
            </Link>
            <button
              onClick={handleLogout}
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50/60 hover:text-rose-500 dark:hover:bg-rose-950/20"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-[21px] w-[21px] stroke-[1.4px]" />
            </button>
          </div>
        </div>
      </header>

      {hasClinic && context && (
        <ClinicSidebar context={context} profile={profile ?? undefined} collapsed={isCollapsed} />
      )}

      <main
        className={`min-h-screen pb-20 pt-[72px] transition-[padding] duration-300 md:pb-0 ${
          hasClinic ? (isCollapsed ? "md:pl-[80px]" : "md:pl-[272px]") : ""
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
