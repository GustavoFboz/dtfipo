import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Check, Minus, Building2, Users, Layers3 } from "lucide-react";
import {
  FINANCIAL_ROLES,
  FINANCIAL_MODULES,
  TENANT_KINDS,
  TENANT_MODULES,
  canPerform,
  type FinancialAction,
  type FinancialRole,
  type TenantKind,
} from "@/lib/financial/permissions/config";
import { useFinancialPermissions } from "@/lib/financial/permissions/hooks";
import { FinancialModuleGuard } from "@/components/financial/FinancialModuleGuard";

export const Route = createFileRoute("/_authenticated/financeiro/permissoes")({
  component: PermissoesPage,
});

const ACTIONS: FinancialAction[] = ["view", "create", "edit", "delete", "approve", "export"];
const ACTION_LABEL: Record<FinancialAction, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  approve: "Aprovar",
  export: "Exportar",
};

function PermissoesPage() {
  return (
    <FinancialModuleGuard module="configuracoes" action="edit">
      <Content />
    </FinancialModuleGuard>
  );
}

function Content() {
  const perms = useFinancialPermissions();
  const [tenant, setTenant] = useState<TenantKind>(perms.tenantKind);

  return (
    <div className="space-y-8 md:space-y-10">
      {/* Header */}
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <ShieldCheck className="h-3 w-3" />
          Permissões financeiras
        </div>
        <h1 className="text-4xl md:text-5xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1.05]">
          Matriz de acessos
        </h1>
        <p className="text-sm md:text-base font-light text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
          Perfis, módulos e ações. Preparado para operação multiempresa —
          Laboratório, Clínica e IPO completa.
        </p>
      </header>

      {/* Contexto atual */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoCard
          icon={Users}
          label="Seu perfil"
          value={perms.role ?? "—"}
          hint="Detectado do seu cadastro."
        />
        <InfoCard
          icon={Building2}
          label="Tipo de empresa"
          value={
            TENANT_KINDS.find((t) => t.id === perms.tenantKind)?.label ?? "IPO completa"
          }
          hint="Vinculada ao seu consultório."
        />
        <InfoCard
          icon={Layers3}
          label="Módulos disponíveis"
          value={String(perms.modules.length)}
          hint="Considerando perfil × empresa."
        />
      </div>

      {/* Seletor de empresa para simulação */}
      <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1">
              Simular tipo de empresa
            </div>
            <div className="text-sm font-light text-slate-500">
              Alterna os módulos exibidos na matriz abaixo.
            </div>
          </div>
          <div className="md:ml-auto flex flex-wrap items-center gap-2">
            {TENANT_KINDS.map((t) => {
              const active = tenant === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTenant(t.id)}
                  className={`px-3.5 py-2 rounded-full text-xs font-medium border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary/40"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Matriz por módulo */}
      <div className="space-y-4">
        {FINANCIAL_MODULES.filter((m) => TENANT_MODULES[tenant].includes(m.id)).map((m) => (
          <div
            key={m.id}
            className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
          >
            <div className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary/70">
                Módulo
              </div>
              <div className="text-xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em] mt-1">
                {m.label}
              </div>
              <div className="text-xs font-light text-slate-500 mt-1">{m.description}</div>
            </div>

            <div className="overflow-x-auto -mx-5 md:-mx-6 px-5 md:px-6">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                    <th className="text-left font-semibold py-2 pr-4">Perfil</th>
                    {ACTIONS.map((a) => (
                      <th key={a} className="text-center font-semibold py-2 px-2">
                        {ACTION_LABEL[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FINANCIAL_ROLES.map((role) => (
                    <tr
                      key={role.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-3 pr-4">
                        <div className="font-light text-slate-900 dark:text-slate-100">
                          {role.label}
                        </div>
                        <div className="text-[10px] text-slate-400 max-w-[220px] truncate">
                          {role.description}
                        </div>
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="text-center py-3 px-2">
                          <PermCell role={role.id} module={m.id} action={a} tenant={tenant} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermCell({
  role,
  module,
  action,
  tenant,
}: {
  role: FinancialRole;
  module: (typeof FINANCIAL_MODULES)[number]["id"];
  action: FinancialAction;
  tenant: TenantKind;
}) {
  const ok = canPerform(role, module, action, tenant);
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
        ok
          ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10"
          : "bg-slate-50 dark:bg-slate-800/40 text-slate-300 border-transparent"
      }`}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3 w-3" />}
    </span>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
      <div className="p-3 rounded-2xl border bg-primary/5 text-primary border-primary/10 inline-flex mb-4">
        <Icon className="h-4 w-4 stroke-[1.4px]" />
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </div>
      <div className="text-2xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em] mt-1">
        {value}
      </div>
      <div className="text-xs font-light text-slate-500 mt-1">{hint}</div>
    </div>
  );
}
