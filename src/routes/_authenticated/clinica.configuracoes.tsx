import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { Switch } from "@/components/ui/switch";
import { CLINIC_PERMISSIONS, fetchClinicContext, fetchClinicRolePermissions, setClinicRolePermission, type ClinicPermission } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/configuracoes")({ component: ClinicSettingsPage });

const ROLES = ["DR", "ATENDIMENTO", "CADISTA", "PROTETICO", "SOLICITANTE", "USER"];
const LABELS: Record<ClinicPermission, string> = {
  "clinical.dashboard": "Visão geral",
  "clinical.appointments": "Agenda",
  "clinical.patients": "Pacientes",
  "clinical.financial": "Financeiro",
  "clinical.team": "Equipe",
  "clinical.settings": "Configurações",
};

function ClinicSettingsPage() { return <ClinicPageGuard permission="clinical.settings"><Settings /></ClinicPageGuard>; }

function Settings() {
  const qc = useQueryClient();
  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext });
  const clinicId = context.data?.clinicId ?? null;
  const rows = useQuery({ queryKey: ["clinic_role_permissions", clinicId], enabled: !!clinicId, queryFn: () => fetchClinicRolePermissions(clinicId!) });

  const mutation = useMutation({
    mutationFn: ({ role, permission, allowed }: { role: string; permission: ClinicPermission; allowed: boolean }) => setClinicRolePermission(clinicId!, role, permission, allowed),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic_role_permissions"] }); qc.invalidateQueries({ queryKey: ["clinic_context"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const allowed = (role: string, permission: ClinicPermission) => Boolean((rows.data ?? []).find((r: any) => r.role === role && r.permission === permission)?.allowed);

  return <div className="mx-auto max-w-[1300px] px-6 py-10 md:px-12">
    <div><div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">Clínica</div><h1 className="mt-2 text-4xl font-extralight tracking-tight text-slate-950 dark:text-white">Permissões da Clínica</h1><p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">Defina exatamente o que cada perfil pode acessar. CEO, ADMIN e o administrador principal permanecem com acesso total por segurança administrativa.</p></div>

    <div className="mt-8 overflow-x-auto rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
      <table className="w-full min-w-[850px] border-collapse text-left">
        <thead><tr className="border-b border-slate-100 dark:border-white/5"><th className="px-5 py-4 text-xs font-medium text-slate-400">Perfil</th>{CLINIC_PERMISSIONS.map((p) => <th key={p} className="px-4 py-4 text-center text-xs font-medium text-slate-400">{LABELS[p]}</th>)}</tr></thead>
        <tbody>{ROLES.map((role) => <tr key={role} className="border-b border-slate-100 last:border-0 dark:border-white/5"><td className="px-5 py-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary/70" /><span className="text-sm font-medium text-slate-800 dark:text-slate-100">{role}</span></div></td>{CLINIC_PERMISSIONS.map((permission) => <td key={permission} className="px-4 py-4 text-center"><Switch checked={allowed(role, permission)} disabled={mutation.isPending || rows.isLoading} onCheckedChange={(value) => mutation.mutate({ role, permission, allowed: value })} aria-label={`${role} ${LABELS[permission]}`} /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="mt-4 text-xs font-light text-slate-400">As mesmas permissões são validadas no banco por RLS; esconder um item no menu não é a única camada de proteção.</div>
  </div>;
}
