import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, FlaskConical, Radio, ArrowUpRight } from "lucide-react";

import { fetchClinicContext } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/hub")({ component: HubPage });

function ModuleCard({ title, description, icon, enabled, to, badge }: {
  title: string; description: string; icon: React.ReactNode; enabled: boolean; to?: string; badge?: string;
}) {
  const body = (
    <div className={`group relative min-h-[230px] overflow-hidden rounded-[30px] border p-7 transition-all ${enabled ? "border-slate-200/70 bg-white hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(15,23,42,0.09)] dark:border-white/10 dark:bg-slate-950" : "border-slate-200/60 bg-slate-50/60 opacity-75 dark:border-white/5 dark:bg-white/[0.02]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/8 text-primary">{icon}</div>
        {enabled && <ArrowUpRight className="h-5 w-5 text-slate-300 transition group-hover:text-primary" />}
      </div>
      <div className="mt-12">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-light tracking-tight text-slate-900 dark:text-white">{title}</h2>
          {badge && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:bg-white/5">{badge}</span>}
        </div>
        <p className="mt-2 max-w-sm text-sm font-light leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
  return enabled && to ? <Link to={to as any}>{body}</Link> : body;
}

function HubPage() {
  const clinic = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext, staleTime: 60_000 });
  const modules = clinic.data?.modules ?? [];
  const labEnabled = modules.includes("laboratory") || modules.length === 0;
  const clinicalEnabled = Boolean(clinic.data?.hasClinicalModule);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_50%_-10%,rgba(74,155,255,0.10),transparent_38%)] px-6 py-12 md:px-14 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary/70">DentalFlow</div>
          <h1 className="mt-3 text-4xl font-extralight tracking-[-0.035em] text-slate-950 md:text-6xl dark:text-white">Onde você quer trabalhar agora?</h1>
          <p className="mt-4 text-base font-light leading-relaxed text-slate-500">Escolha um ambiente. Cada módulo mantém suas ferramentas, permissões e contexto separados.</p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <ModuleCard title="Laboratório" description="Fluxos de casos, produção, estoque e comunicação do laboratório." icon={<FlaskConical className="h-6 w-6" />} enabled={labEnabled} to="/casos" />
          <ModuleCard title="Clínica" description="Agenda de pacientes, gestão clínica, financeiro e equipe do consultório." icon={<Building2 className="h-6 w-6" />} enabled={clinicalEnabled} to="/clinica" badge={clinicalEnabled ? undefined : "Plano não habilitado"} />
          <ModuleCard title="Radiologia" description="Ambiente dedicado para radiologia e exames odontológicos." icon={<Radio className="h-6 w-6" />} enabled={false} badge="Em preparação" />
        </div>

        {clinic.data?.clinicName && <div className="mt-8 text-xs font-light text-slate-400">Organização atual: {clinic.data.clinicName}</div>}
      </div>
    </div>
  );
}
