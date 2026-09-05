import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Grid2X2, LogOut } from "lucide-react";

import { ClinicSidebar } from "@/components/ClinicSidebar";
import { fetchProfile } from "@/lib/api";
import { fetchClinicContext } from "@/lib/clinic";
import { supabase } from "@/integrations/supabase/client";

const PAGE_TITLES: Array<[string, string]> = [
  ["/clinica/configuracoes", "Configurações"],
  ["/clinica/financeiro", "Financeiro"],
  ["/clinica/pacientes", "Pacientes"],
  ["/clinica/equipe", "Equipe"],
  ["/clinica/agenda", "Agenda"],
  ["/clinica", "Visão geral"],
];

function pageTitle(pathname: string) {
  return PAGE_TITLES.find(([path]) => pathname === path || (path !== "/clinica" && pathname.startsWith(path)))?.[1] ?? "Clínica";
}

export function ClinicShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } });
  }

  return (
    <div className="min-h-screen bg-[#f6f9fc] text-slate-900 dark:bg-[#070a0e] dark:text-white">
      <header className="fixed inset-x-0 top-0 z-50 h-[72px] border-b border-slate-200/70 bg-white/92 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#090c11]/92">
        <div className="flex h-full items-center justify-between px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/clinica" className="flex min-w-0 items-center gap-3 rounded-xl transition hover:opacity-85">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#1e8f87] text-white shadow-[0_8px_24px_-12px_rgba(30,143,135,0.8)]">
                <Building2 className="h-5 w-5 stroke-[1.6]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline whitespace-nowrap text-[15px] tracking-tight">
                  <span className="font-light">DENTAL</span><span className="font-bold">FLOW</span><span className="ml-1 text-[9px] font-medium text-slate-400">BR</span>
                </div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1e8f87]">Clínica</div>
              </div>
            </Link>
            <div className="hidden h-7 w-px bg-slate-200 md:block dark:bg-white/10" />
            <div className="hidden min-w-0 md:block">
              <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{pageTitle(pathname)}</div>
              <div className="truncate text-[10px] text-slate-400">{context?.clinicName || "Gestão clínica"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/hub" className="flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-white" title="Trocar de módulo">
              <Grid2X2 className="h-4.5 w-4.5 stroke-[1.5]" />
              <span className="hidden sm:inline">Módulos</span>
            </Link>
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 py-1.5 lg:flex dark:border-white/10 dark:bg-white/[0.03]">
              <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg bg-[#1e8f87]/10 text-[10px] font-semibold text-[#1e8f87]">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.full_name ?? "Perfil"} className="h-full w-full object-cover" /> : (profile?.full_name?.[0]?.toUpperCase() ?? "U")}
              </div>
              <span className="max-w-[130px] truncate text-xs font-medium text-slate-600 dark:text-slate-300">{profile?.full_name?.split(" ")[0] || "Usuário"}</span>
            </div>
            <button onClick={handleLogout} className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/20" title="Sair">
              <LogOut className="h-5 w-5 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      {hasClinic && context && <ClinicSidebar context={context} />}

      <main className={`min-h-screen pt-[72px] pb-20 md:pb-0 ${hasClinic ? "md:pl-[272px]" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
