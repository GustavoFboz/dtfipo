import { Link, useLocation } from "@tanstack/react-router";
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Users2,
  WalletCards,
  Settings,
  FlaskConical,
  Grid2X2,
  Building2,
} from "lucide-react";

import type { ClinicContext, ClinicPermission } from "@/lib/clinic";

const primaryItems: Array<{ to: string; label: string; icon: any; permission: ClinicPermission }> = [
  { to: "/clinica", label: "Visão geral", icon: LayoutDashboard, permission: "clinical.dashboard" },
  { to: "/clinica/agenda", label: "Agenda", icon: CalendarDays, permission: "clinical.appointments" },
  { to: "/clinica/pacientes", label: "Pacientes", icon: Users, permission: "clinical.patients" },
];

const managementItems: Array<{ to: string; label: string; icon: any; permission: ClinicPermission }> = [
  { to: "/clinica/financeiro", label: "Financeiro", icon: WalletCards, permission: "clinical.financial" },
  { to: "/clinica/equipe", label: "Equipe", icon: Users2, permission: "clinical.team" },
  { to: "/clinica/configuracoes", label: "Configurações", icon: Settings, permission: "clinical.settings" },
];

function NavItem({ item, active }: { item: (typeof primaryItems)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to as any}
      className={`group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm transition-all ${
        active
          ? "bg-[#1e8f87]/9 font-medium text-[#16756f] dark:bg-[#1e8f87]/15 dark:text-[#63c7c0]"
          : "font-light text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
      }`}
    >
      {active && <span className="absolute left-0 h-6 w-0.5 rounded-r-full bg-[#1e8f87]" />}
      <Icon className="h-[19px] w-[19px] shrink-0 stroke-[1.55]" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function ClinicSidebar({ context }: { context: ClinicContext }) {
  const { pathname } = useLocation();
  const activeFor = (to: string) => (to === "/clinica" ? pathname === "/clinica" : pathname.startsWith(to));
  const primary = primaryItems.filter((item) => context.permissions[item.permission]);
  const management = managementItems.filter((item) => context.permissions[item.permission]);
  const labEnabled = context.modules.includes("laboratory") || context.modules.length === 0;

  return (
    <>
      <aside className="fixed bottom-0 left-0 top-[72px] z-40 hidden w-[272px] flex-col border-r border-slate-200/70 bg-white md:flex dark:border-white/[0.07] dark:bg-[#090c11]">
        <div className="px-4 pb-3 pt-5">
          <div className="rounded-[22px] border border-[#1e8f87]/10 bg-[linear-gradient(135deg,rgba(30,143,135,0.09),rgba(30,143,135,0.025))] p-4 dark:border-[#1e8f87]/20 dark:bg-[#1e8f87]/10">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#1e8f87] text-white shadow-[0_8px_22px_-12px_rgba(30,143,135,0.9)]">
                <Building2 className="h-5 w-5 stroke-[1.6]" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1e8f87]">Ambiente clínico</div>
                <div className="mt-0.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{context.clinicName || "Minha clínica"}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[10px] font-light leading-relaxed text-slate-500 dark:bg-black/15 dark:text-slate-400">
              Agenda, pacientes e gestão do consultório em um ambiente independente do laboratório.
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          <div className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 dark:text-slate-600">Atendimento</div>
          <div className="space-y-1">
            {primary.map((item) => <NavItem key={item.to} item={item} active={activeFor(item.to)} />)}
          </div>

          {management.length > 0 && (
            <>
              <div className="mx-3 my-4 h-px bg-slate-100 dark:bg-white/5" />
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 dark:text-slate-600">Gestão</div>
              <div className="space-y-1">
                {management.map((item) => <NavItem key={item.to} item={item} active={activeFor(item.to)} />)}
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-slate-100 p-3 dark:border-white/5">
          {labEnabled && (
            <Link to="/casos" className="flex h-10 items-center gap-3 rounded-xl px-3 text-xs font-light text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200">
              <FlaskConical className="h-4.5 w-4.5 stroke-[1.5]" />
              <span>Ir para Laboratório</span>
            </Link>
          )}
          <Link to="/hub" className="mt-1 flex h-10 items-center gap-3 rounded-xl px-3 text-xs font-medium text-[#1e8f87] transition hover:bg-[#1e8f87]/6">
            <Grid2X2 className="h-4.5 w-4.5 stroke-[1.5]" />
            <span>Trocar de módulo</span>
          </Link>
        </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid h-[64px] grid-cols-5 rounded-[22px] border border-slate-200/80 bg-white/94 p-1.5 shadow-[0_14px_45px_rgba(15,23,42,0.13)] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-[#0b0e13]/94">
        {primary.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const active = activeFor(item.to);
          return (
            <Link key={item.to} to={item.to as any} className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-medium transition ${active ? "bg-[#1e8f87]/10 text-[#1e8f87]" : "text-slate-400"}`}>
              <Icon className="h-5 w-5 stroke-[1.5]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {management.find((item) => item.to === "/clinica/financeiro") ? (
          <Link to="/clinica/financeiro" className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-medium transition ${activeFor("/clinica/financeiro") ? "bg-[#1e8f87]/10 text-[#1e8f87]" : "text-slate-400"}`}>
            <WalletCards className="h-5 w-5 stroke-[1.5]" />
            <span>Financeiro</span>
          </Link>
        ) : <span />}
        <Link to="/hub" className="flex flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-medium text-slate-400 transition hover:text-[#1e8f87]">
          <Grid2X2 className="h-5 w-5 stroke-[1.5]" />
          <span>Módulos</span>
        </Link>
      </nav>
    </>
  );
}
