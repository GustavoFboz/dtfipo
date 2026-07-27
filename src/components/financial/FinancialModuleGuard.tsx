import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useFinancialPermissions } from "@/lib/financial/permissions/hooks";
import type { FinancialAction, FinancialModule } from "@/lib/financial/permissions/config";

/**
 * Guarda de módulo financeiro.
 * Renderiza `children` se o usuário tem a ação (default: "view") no módulo.
 * Caso contrário, mostra estado de acesso restrito ou `fallback`.
 */
export function FinancialModuleGuard({
  module,
  action = "view",
  children,
  fallback,
}: {
  module: FinancialModule;
  action?: FinancialAction;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, loading, role } = useFinancialPermissions();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-xs font-light text-slate-400">Verificando permissões…</div>
      </div>
    );
  }

  if (can(module, action)) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  return (
    <div className="max-w-md mx-auto text-center py-20 space-y-4">
      <div className="inline-flex p-4 rounded-3xl bg-rose-500/5 text-rose-500 border border-rose-500/10">
        <ShieldAlert className="h-6 w-6 stroke-[1.4px]" />
      </div>
      <h2 className="text-2xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.02em]">
        Acesso restrito
      </h2>
      <p className="text-sm font-light text-slate-500 leading-relaxed">
        Seu perfil ({role ?? "não identificado"}) não possui permissão para{" "}
        <span className="font-medium">{action}</span> em{" "}
        <span className="font-medium">{module}</span>.
      </p>
    </div>
  );
}
