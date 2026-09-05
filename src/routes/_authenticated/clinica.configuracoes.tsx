import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarClock, HardDrive, Plug, ShieldCheck, Users2 } from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { Switch } from "@/components/ui/switch";
import { CLINIC_PERMISSIONS, fetchClinicContext, fetchClinicRolePermissions, setClinicRolePermission, type ClinicPermission } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/configuracoes")({ component: ClinicSettingsPage });

const ROLES = ["DR", "ATENDIMENTO", "USER"];
const ROLE_LABEL: Record<string, string> = { DR: "Dentista", ATENDIMENTO: "Atendimento", USER: "Usuário" };
const LABELS: Record<ClinicPermission, string> = {
  "clinical.dashboard": "Visão geral",
  "clinical.appointments": "Agenda",
  "clinical.patients": "Pacientes",
  "clinical.financial": "Financeiro",
  "clinical.team": "Equipe",
  "clinical.settings": "Configurações",
};

function ClinicSettingsPage() {
  return <ClinicPageGuard permission="clinical.settings"><Settings /></ClinicPageGuard>;
}

function Settings() {
  const qc = useQueryClient();
  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext });
  const clinicId = context.data?.clinicId ?? null;
  const rows = useQuery({ queryKey: ["clinic_role_permissions", clinicId], enabled: !!clinicId, queryFn: () => fetchClinicRolePermissions(clinicId!) });

  const mutation = useMutation({
    mutationFn: ({ role, permission, allowed }: { role: string; permission: ClinicPermission; allowed: boolean }) => setClinicRolePermission(clinicId!, role, permission, allowed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic_role_permissions"] });
      qc.invalidateQueries({ queryKey: ["clinic_context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allowed = (role: string, permission: ClinicPermission) => Boolean((rows.data ?? []).find((r: any) => r.role === role && r.permission === permission)?.allowed);

  return (
    <div className="mx-auto max-w-[1450px] px-5 py-8 md:px-10 lg:px-12">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">Clínica</div>
        <h1 className="mt-2 text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">Configurações</h1>
        <p className="mt-2 max-w-2xl text-sm font-light leading-relaxed text-slate-500">A base já está organizada. Vamos adicionar novas preferências apenas quando elas tiverem uma regra real no produto.</p>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SettingCard icon={Building2} title="Dados da clínica" description={context.data?.clinicName || "Identificação da organização"} status="Ativo" />
        <SettingCard icon={CalendarClock} title="Agenda" description="Duração padrão, horários e regras de atendimento." status="Em preparação" muted />
        <Link to="/clinica/equipe" className="block"><SettingCard icon={Users2} title="Equipe" description="Membros e acessos do ambiente clínico." status="Abrir" /></Link>
        <Link to="/clinica/armazenamento" className="block"><SettingCard icon={HardDrive} title="Armazenamento" description="Cota e arquivos compartilhados pelo DentalFlow." status="Gerenciar" /></Link>
      </div>

      <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center dark:border-white/5">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#1e8f87]" /><h2 className="text-lg font-light text-slate-900 dark:text-white">Permissões da Clínica</h2></div>
            <p className="mt-1 text-xs font-light text-slate-400">Defina o que cada perfil clínico pode acessar. Administradores principais mantêm acesso total.</p>
          </div>
          <span className="self-start rounded-full bg-[#1e8f87]/8 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#1e8f87] md:self-auto">Operante</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left">
            <thead><tr className="border-b border-slate-100 dark:border-white/5"><th className="px-5 py-4 text-xs font-medium text-slate-400">Perfil</th>{CLINIC_PERMISSIONS.map((p) => <th key={p} className="px-4 py-4 text-center text-xs font-medium text-slate-400">{LABELS[p]}</th>)}</tr></thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                  <td className="px-5 py-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#1e8f87]/70" /><span className="text-sm font-medium text-slate-800 dark:text-slate-100">{ROLE_LABEL[role] ?? role}</span></div></td>
                  {CLINIC_PERMISSIONS.map((permission) => <td key={permission} className="px-4 py-4 text-center"><Switch checked={allowed(role, permission)} disabled={mutation.isPending || rows.isLoading} onCheckedChange={(value) => mutation.mutate({ role, permission, allowed: value })} aria-label={`${role} ${LABELS[permission]}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5"><Plug className="h-5 w-5 stroke-[1.5]" /></div>
          <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-800 dark:text-white">Integrações entre módulos</div><p className="mt-1 max-w-2xl text-xs font-light leading-relaxed text-slate-400">Clínica ↔ Laboratório e Clínica ↔ Radiologia serão configurados aqui quando a camada comercial de integração estiver pronta. Nenhuma integração é ativada automaticamente.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:bg-white/5">Em breve</span>
        </div>
      </section>

      <p className="mt-4 text-xs font-light text-slate-400">As permissões continuam protegidas também no banco por RLS; a interface é apenas uma das camadas de segurança.</p>
    </div>
  );
}

function SettingCard({ icon: Icon, title, description, status, muted = false }: { icon: any; title: string; description: string; status: string; muted?: boolean }) {
  return (
    <div className={`h-full rounded-[24px] border p-5 transition ${muted ? "border-slate-200/50 bg-slate-50/50 opacity-75 dark:border-white/5 dark:bg-white/[0.02]" : "border-slate-200/70 bg-white hover:border-[#1e8f87]/20 hover:shadow-sm dark:border-white/10 dark:bg-slate-950"}`}>
      <div className="flex items-start justify-between gap-3"><div className={`grid h-10 w-10 place-items-center rounded-2xl ${muted ? "bg-slate-100 text-slate-400 dark:bg-white/5" : "bg-[#1e8f87]/8 text-[#1e8f87]"}`}><Icon className="h-5 w-5 stroke-[1.5]" /></div><span className={`rounded-full px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] ${muted ? "bg-slate-100 text-slate-400 dark:bg-white/5" : "bg-[#1e8f87]/8 text-[#1e8f87]"}`}>{status}</span></div>
      <div className="mt-5 text-sm font-medium text-slate-800 dark:text-white">{title}</div>
      <p className="mt-1 text-xs font-light leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}
