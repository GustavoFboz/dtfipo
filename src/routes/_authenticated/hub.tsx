import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,
  FlaskConical,
  Radio,
  Sparkles,
} from "lucide-react";

import { fetchProfile } from "@/lib/api";
import { fetchClinicContext } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/hub")({ component: HubPage });

type ModuleCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  to?: string;
  eyebrow: string;
  badge?: string;
  accent: "lab" | "clinic" | "radiology";
};

const accents = {
  lab: {
    icon: "bg-[#2D7FF9]/10 text-[#2D7FF9]",
    glow: "from-[#2D7FF9]/12",
    hover: "group-hover:border-[#2D7FF9]/25",
  },
  clinic: {
    icon: "bg-[#1e8f87]/10 text-[#1e8f87]",
    glow: "from-[#1e8f87]/12",
    hover: "group-hover:border-[#1e8f87]/25",
  },
  radiology: {
    icon: "bg-violet-500/10 text-violet-500",
    glow: "from-violet-500/10",
    hover: "group-hover:border-violet-500/20",
  },
};

function ModuleCard({ title, description, icon, enabled, to, eyebrow, badge, accent }: ModuleCardProps) {
  const style = accents[accent];
  const content = (
    <article className={`group relative min-h-[330px] overflow-hidden rounded-[30px] border border-slate-200/75 bg-white p-7 transition-all duration-300 dark:border-white/[0.08] dark:bg-[#0b0e13] ${enabled ? `${style.hover} hover:-translate-y-1 hover:shadow-[0_24px_70px_-28px_rgba(15,23,42,0.3)]` : "opacity-70"}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b ${style.glow} to-transparent opacity-70`} />
      <div className="relative flex items-start justify-between gap-4">
        <div className={`grid h-14 w-14 place-items-center rounded-[20px] ${style.icon}`}>{icon}</div>
        {enabled ? (
          <div className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-300 transition group-hover:border-slate-300 group-hover:text-slate-700 dark:border-white/10 dark:group-hover:text-white">
            <ArrowRight className="h-4 w-4" />
          </div>
        ) : (
          <span className="rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">{badge || "Indisponível"}</span>
        )}
      </div>

      <div className="relative mt-16">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
        <h2 className="mt-2 text-[30px] font-light tracking-[-0.03em] text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-3 max-w-sm text-sm font-light leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      <div className="relative mt-8 flex items-center gap-2 text-[11px] font-medium text-slate-400">
        {enabled ? <><Check className="h-3.5 w-3.5" /> Ambiente disponível</> : <>{badge || "Em preparação"}</>}
      </div>
    </article>
  );

  return enabled && to ? <Link to={to as any} className="block">{content}</Link> : content;
}

function HubPage() {
  const clinic = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext, staleTime: 60_000 });
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile, staleTime: 5 * 60_000 });
  const modules = clinic.data?.modules ?? [];
  const labEnabled = modules.includes("laboratory") || modules.length === 0;
  const clinicalEnabled = Boolean(clinic.data?.hasClinicalModule);
  const firstName = profile.data?.full_name?.split(" ")[0] || "";

  return (
    <div className="relative min-h-[calc(100vh-72px)] overflow-hidden px-5 py-10 md:px-10 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_0%,rgba(45,127,249,0.10),transparent_32%),radial-gradient(circle_at_78%_5%,rgba(30,143,135,0.09),transparent_30%)]" />

      <div className="relative mx-auto max-w-[1320px]">
        <section className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
              <Sparkles className="h-3.5 w-3.5 text-[#2D7FF9]" /> Plataforma DentalFlow
            </div>
            <h1 className="mt-6 text-4xl font-extralight tracking-[-0.045em] text-slate-950 sm:text-5xl md:text-[64px] md:leading-[1.02] dark:text-white">
              {firstName ? `${firstName}, escolha seu` : "Escolha seu"}<br className="hidden sm:block" /> ambiente de trabalho.
            </h1>
            <p className="mt-5 max-w-2xl text-base font-light leading-7 text-slate-500 md:text-lg dark:text-slate-400">
              Laboratório, Clínica e Radiologia são ambientes independentes. Eles compartilham somente dados centrais quando necessário e podem ser integrados conforme o plano contratado.
            </p>
          </div>

          <div className="max-w-sm rounded-[24px] border border-slate-200/70 bg-white/70 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.025]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Estrutura modular</div>
            <p className="mt-2 text-xs font-light leading-5 text-slate-500 dark:text-slate-400">Cada módulo mantém navegação, permissões, regras e experiência próprias. Pacientes e recursos compartilháveis permanecem no núcleo DentalFlow.</p>
          </div>
        </section>

        <section className="mt-12 grid gap-5 lg:grid-cols-3">
          <ModuleCard
            title="Laboratório"
            eyebrow="Produção odontológica"
            description="Casos, etapas, produção, entregas e rotina técnica do laboratório em seu ambiente próprio."
            icon={<FlaskConical className="h-6 w-6 stroke-[1.5]" />}
            enabled={labEnabled}
            to="/casos"
            accent="lab"
          />
          <ModuleCard
            title="Clínica"
            eyebrow="Gestão do consultório"
            description="Agenda, pacientes, financeiro, equipe e operação clínica sem elementos ou processos do laboratório."
            icon={<Building2 className="h-6 w-6 stroke-[1.5]" />}
            enabled={clinicalEnabled}
            to="/clinica"
            badge={clinicalEnabled ? undefined : "Plano não habilitado"}
            accent="clinic"
          />
          <ModuleCard
            title="Radiologia"
            eyebrow="Imagem e diagnóstico"
            description="Exames, imagens e laudos em uma aplicação dedicada. A arquitetura já está preparada para receber este módulo."
            icon={<Radio className="h-6 w-6 stroke-[1.5]" />}
            enabled={false}
            badge="Em preparação"
            accent="radiology"
          />
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[11px] font-light text-slate-400">
          <span>{clinic.data?.clinicName ? `Organização: ${clinic.data.clinicName}` : "DentalFlow modular"}</span>
          <span>Integrações entre módulos podem ser habilitadas separadamente.</span>
        </div>
      </div>
    </div>
  );
}
