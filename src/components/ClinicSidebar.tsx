import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Users2,
  WalletCards,
  Settings,
} from "lucide-react";

import { StorageSidebarCard } from "@/components/StorageSidebarCard";
import { startEnvironmentTransition, type EnvironmentName } from "@/components/EnvironmentTransition";
import type { ClinicContext, ClinicPermission } from "@/lib/clinic";
import type { Profile } from "@/lib/types";

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

function NavItem({ item, active, collapsed }: { item: (typeof primaryItems)[number]; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to as any}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group relative flex h-11 items-center overflow-hidden rounded-xl text-sm transition-all ${
        active
          ? "bg-[#1e8f87]/9 font-medium text-[#16756f] dark:bg-[#1e8f87]/15 dark:text-[#63c7c0]"
          : "font-light text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
      } ${collapsed ? "mx-auto w-11 justify-center px-0" : "gap-3 px-3.5"}`}
    >
      {active && !collapsed && <span className="absolute left-0 h-6 w-0.5 rounded-r-full bg-[#1e8f87]" />}
      <Icon className="h-[19px] w-[19px] shrink-0 stroke-[1.5]" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {active && collapsed && <span className="absolute bottom-1 h-0.5 w-4 rounded-full bg-[#1e8f87]" />}
    </Link>
  );
}

function EnvironmentModuleButton({
  label,
  shortLabel,
  to,
  environment,
  collapsed,
  disabled = false,
}: {
  label: string;
  shortLabel: string;
  to?: string;
  environment: EnvironmentName;
  collapsed: boolean;
  disabled?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      disabled={disabled}
      title={collapsed ? label : undefined}
      aria-label={label}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
      }}
      onClick={() => {
        if (!to || disabled) return;
        startEnvironmentTransition(environment, () => navigate({ to: to as any }));
      }}
      className={`group relative flex w-full items-center overflow-hidden py-6 text-[13px] font-medium uppercase tracking-[0.1em] text-slate-500 transition-all hover:bg-[#54A8FB]/[0.03] active:bg-[#54A8FB]/[0.05] disabled:cursor-default disabled:opacity-45 ${
        collapsed ? "justify-center px-1" : "pl-12"
      }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-slate-100 dark:bg-white/5" />
      <div
        className="pointer-events-none absolute h-24 w-24 rounded-full bg-[#54A8FB] opacity-0 blur-[30px] transition-opacity duration-300 group-hover:opacity-20 group-disabled:opacity-0"
        style={{
          left: "var(--mouse-x, 50%)",
          top: "var(--mouse-y, 50%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <span className={`relative whitespace-nowrap transition-colors duration-300 group-hover:text-primary ${collapsed ? "text-[9px] tracking-[0.08em]" : ""}`}>
        {collapsed ? shortLabel : label}
      </span>
    </button>
  );
}

function ProfileArea({ profile, collapsed }: { profile?: Profile; collapsed: boolean }) {
  if (!profile) return null;
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || "Usuário";
  const settingsLink = (
    <Link
      to="/clinica/configuracoes"
      title={collapsed ? `Conta ativa · ${profile.full_name || firstName}` : undefined}
      className={`group flex w-full items-center transition-all duration-300 ${
        collapsed
          ? "justify-center"
          : "gap-3 rounded-[24px] border border-slate-100/70 bg-slate-50/55 p-3.5 hover:bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.025] dark:hover:bg-white/[0.04]"
      }`}
    >
      <div className={`relative shrink-0 overflow-hidden rounded-full border border-slate-100 bg-white shadow-sm dark:border-white/10 dark:bg-slate-800 ${collapsed ? "h-9 w-9" : "h-12 w-12"}`}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.full_name ?? "Perfil"} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm font-semibold text-[#1e8f87]">{firstName[0]?.toUpperCase()}</div>
        )}
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium tracking-tight text-slate-900 dark:text-slate-100">{profile.full_name || firstName}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-light text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Conta ativa
          </div>
        </div>
      )}
    </Link>
  );

  return (
    <div className={collapsed ? "px-4 pb-4 pt-6" : "px-4 pb-3 pt-7"}>
      {!collapsed && (
        <div className="mb-4 px-2 text-[16px] font-medium tracking-tight text-[#1e8f87]">
          Bem-vindo <span className="font-light text-slate-400">de volta,</span> {firstName}
        </div>
      )}
      {settingsLink}
    </div>
  );
}

export function ClinicSidebar({
  context,
  profile,
  collapsed = false,
}: {
  context: ClinicContext;
  profile?: Profile;
  collapsed?: boolean;
}) {
  const { pathname } = useLocation();
  const activeFor = (to: string) => (to === "/clinica" ? pathname === "/clinica" : pathname.startsWith(to));
  const primary = primaryItems.filter((item) => context.permissions[item.permission]);
  const management = managementItems.filter((item) => context.permissions[item.permission]);
  const labEnabled = context.modules.includes("laboratory") || context.modules.length === 0;

  return (
    <>
      <aside
        className={`fixed bottom-0 left-0 top-[72px] z-40 hidden flex-col border-r border-slate-200/70 bg-white transition-[width] duration-300 md:flex dark:border-white/[0.07] dark:bg-[#090c11] ${
          collapsed ? "w-[80px]" : "w-[272px]"
        }`}
      >
        <ProfileArea profile={profile} collapsed={collapsed} />

        {!collapsed && (
          <div className="px-4 pb-4">
            <div
              data-clinic-institute-card
              className="rounded-[20px] border border-[#1e8f87]/10 bg-[linear-gradient(135deg,rgba(30,143,135,0.075),rgba(30,143,135,0.02))] px-4 py-4 dark:border-[#1e8f87]/20 dark:bg-[#1e8f87]/10"
            >
              <div className="text-[14px] font-medium leading-5 text-slate-800 dark:text-slate-100">
                {context.clinicName || "Minha clínica"}
              </div>
            </div>
          </div>
        )}

        <div className={`mx-auto h-px bg-slate-100 dark:bg-white/5 ${collapsed ? "w-9" : "w-[calc(100%-32px)]"}`} />

        <nav className={`flex-1 overflow-y-auto pb-3 pt-3 ${collapsed ? "px-2" : "px-3"}`}>
          {!collapsed && <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 dark:text-slate-600">Atendimento</div>}
          <div className="space-y-1">{primary.map((item) => <NavItem key={item.to} item={item} active={activeFor(item.to)} collapsed={collapsed} />)}</div>

          {management.length > 0 && (
            <>
              <div className={`my-4 h-px bg-slate-100 dark:bg-white/5 ${collapsed ? "mx-auto w-8" : "mx-3"}`} />
              {!collapsed && <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 dark:text-slate-600">Gestão</div>}
              <div className="space-y-1">{management.map((item) => <NavItem key={item.to} item={item} active={activeFor(item.to)} collapsed={collapsed} />)}</div>
            </>
          )}
        </nav>

        {context.isAdvanced && <StorageSidebarCard to="/clinica/armazenamento" variant="clinic" collapsed={collapsed} />}

        <div className="mt-auto flex flex-col overflow-hidden border-t border-slate-100 bg-white dark:border-white/5 dark:bg-[#090c11]">
          {labEnabled && (
            <EnvironmentModuleButton
              label="LABORATÓRIO"
              shortLabel="LAB"
              to="/casos"
              environment="Laboratório"
              collapsed={collapsed}
            />
          )}
          <EnvironmentModuleButton
            label="RADIOLOGIA"
            shortLabel="RAD"
            environment="Radiologia"
            collapsed={collapsed}
            disabled
          />
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
        <Link to="/clinica/configuracoes" className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-medium transition ${activeFor("/clinica/configuracoes") ? "bg-[#1e8f87]/10 text-[#1e8f87]" : "text-slate-400"}`}>
          <Settings className="h-5 w-5 stroke-[1.5]" />
          <span>Ajustes</span>
        </Link>
      </nav>
    </>
  );
}
