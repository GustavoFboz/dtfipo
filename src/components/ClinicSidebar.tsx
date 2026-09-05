import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, LayoutDashboard, Users, Users2, WalletCards, Settings, FlaskConical, Grid2X2 } from "lucide-react";

import { StorageSidebarCard } from "@/components/StorageSidebarCard";
import type { ClinicContext, ClinicPermission } from "@/lib/clinic";

const items: Array<{ to: string; label: string; icon: any; permission: ClinicPermission }> = [
  { to: "/clinica", label: "Visão geral", icon: LayoutDashboard, permission: "clinical.dashboard" },
  { to: "/clinica/agenda", label: "Agenda", icon: CalendarDays, permission: "clinical.appointments" },
  { to: "/clinica/pacientes", label: "Pacientes", icon: Users, permission: "clinical.patients" },
  { to: "/clinica/financeiro", label: "Financeiro", icon: WalletCards, permission: "clinical.financial" },
  { to: "/clinica/equipe", label: "Equipe", icon: Users2, permission: "clinical.team" },
  { to: "/clinica/configuracoes", label: "Configurações", icon: Settings, permission: "clinical.settings" },
];

export function ClinicSidebar({ context }: { context: ClinicContext }) {
  const { pathname } = useLocation();
  const allowedItems = items.filter((item) => context.permissions[item.permission]);
  const activeFor = (to: string) => to === "/clinica" ? pathname === "/clinica" : pathname.startsWith(to);

  return (
    <>
      <div className="sticky top-0 z-30 -mx-6 mb-2 flex gap-1 overflow-x-auto border-b border-slate-100 bg-white/92 px-4 py-2 backdrop-blur-xl dark:border-white/5 dark:bg-black/90 md:hidden">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const active = activeFor(item.to);
          return <Link key={item.to} to={item.to as any} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs ${active ? "bg-primary/10 text-primary" : "text-slate-500"}`}><Icon className="h-4 w-4" />{item.label}</Link>;
        })}
        <Link to="/hub" className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs text-slate-400"><Grid2X2 className="h-4 w-4" />Módulos</Link>
      </div>

      <aside className="fixed bottom-0 left-0 top-[72px] z-[45] hidden w-[var(--sidebar-width,256px)] flex-col overflow-hidden border-r border-slate-100 bg-white dark:border-white/5 dark:bg-black md:flex">
        <div className="px-5 pb-3 pt-7">
          <div className="flex items-center gap-3 overflow-hidden rounded-2xl bg-primary/[0.045] px-3 py-3 text-primary">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10"><LayoutDashboard className="h-5 w-5" /></div>
            <div className="min-w-[145px] overflow-hidden whitespace-nowrap"><div className="text-sm font-medium">Clínica</div><div className="truncate text-[10px] font-light text-slate-400">{context.clinicName || "Gestão clínica"}</div></div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {allowedItems.map((item) => {
            const active = activeFor(item.to);
            const Icon = item.icon;
            return <Link key={item.to} to={item.to as any} className={`flex h-11 items-center gap-4 overflow-hidden rounded-xl px-4 text-sm transition ${active ? "bg-primary/[0.06] text-primary" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-200"}`}><Icon className="h-5 w-5 shrink-0 stroke-[1.5]" /><span className="min-w-[130px] whitespace-nowrap font-light">{item.label}</span></Link>;
          })}
        </nav>

        {context.isAdvanced && <StorageSidebarCard collapsed={false} />}

        <div className="border-t border-slate-100 p-3 dark:border-white/5">
          <Link to="/casos" className="flex h-11 items-center gap-4 overflow-hidden rounded-xl px-4 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-primary dark:hover:bg-white/5"><FlaskConical className="h-5 w-5 shrink-0 stroke-[1.5]" /><span className="min-w-[130px] whitespace-nowrap font-light">Laboratório</span></Link>
          <Link to="/hub" className="mt-1 flex h-11 items-center gap-4 overflow-hidden rounded-xl px-4 text-sm text-slate-400 transition hover:bg-slate-50 hover:text-primary dark:hover:bg-white/5"><Grid2X2 className="h-5 w-5 shrink-0 stroke-[1.5]" /><span className="min-w-[130px] whitespace-nowrap font-light">Todos os módulos</span></Link>
        </div>
      </aside>
    </>
  );
}
