import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  FlaskConical,
  Radio,
  ShieldCheck,
} from "lucide-react";

import { startEnvironmentTransition, type EnvironmentName } from "@/components/EnvironmentTransition";
import { fetchProfile } from "@/lib/api";
import { fetchClinicContext } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/hub")({ component: HubPage });

type Accent = "lab" | "clinic" | "radiology";

type EnvironmentPanelProps = {
  title: string;
  subtitle: string;
  description: string;
  icon: ReactNode;
  accent: Accent;
  enabled: boolean;
  to?: string;
  environment?: EnvironmentName;
  status: string;
  featured?: boolean;
  footer?: ReactNode;
};

const palette: Record<Accent, {
  ink: string;
  icon: string;
  line: string;
  wash: string;
  hover: string;
}> = {
  lab: {
    ink: "text-[#2D7FF9]",
    icon: "bg-[#2D7FF9]/9 text-[#2D7FF9] dark:bg-[#2D7FF9]/14",
    line: "bg-[#2D7FF9]",
    wash: "from-[#2D7FF9]/[0.065]",
    hover: "hover:border-[#2D7FF9]/25",
  },
  clinic: {
    ink: "text-[#168e85] dark:text-[#4dbbb1]",
    icon: "bg-[#168e85]/9 text-[#168e85] dark:bg-[#4dbbb1]/12 dark:text-[#4dbbb1]",
    line: "bg-[#168e85] dark:bg-[#4dbbb1]",
    wash: "from-[#168e85]/[0.095] dark:from-[#4dbbb1]/[0.07]",
    hover: "hover:border-[#168e85]/30 dark:hover:border-[#4dbbb1]/25",
  },
  radiology: {
    ink: "text-violet-500 dark:text-violet-400",
    icon: "bg-violet-500/[0.08] text-violet-500 dark:bg-violet-400/[0.09] dark:text-violet-400",
    line: "bg-violet-500 dark:bg-violet-400",
    wash: "from-violet-500/[0.045] dark:from-violet-400/[0.04]",
    hover: "hover:border-violet-500/20",
  },
};

function EnvironmentPanel({
  title,
  subtitle,
  description,
  icon,
  accent,
  enabled,
  to,
  environment,
  status,
  featured = false,
  footer,
}: EnvironmentPanelProps) {
  const navigate = useNavigate();
  const color = palette[accent];

  const panel = (
    <article
      className={`group relative flex h-full min-h-[390px] flex-col overflow-hidden border bg-white/88 p-6 transition-[border-color,box-shadow,transform] duration-300 dark:bg-[#0a0d12]/92 sm:p-7 lg:min-h-[510px] ${
        featured
          ? `rounded-[34px] border-slate-200/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.42)] dark:border-white/[0.09] ${enabled ? `${color.hover} lg:hover:-translate-y-1` : ""}`
          : `rounded-[30px] border-slate-200/70 dark:border-white/[0.07] ${enabled ? `${color.hover} lg:hover:-translate-y-0.5` : "opacity-[0.72]"}`
      }`}
      aria-disabled={!enabled}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-[48%] bg-gradient-to-b ${color.wash} to-transparent`} />
      <div className="pointer-events-none absolute -right-16 top-16 h-56 w-56 rounded-full border border-slate-200/40 dark:border-white/[0.035]" />
      <div className="pointer-events-none absolute -right-6 top-28 h-36 w-36 rounded-full border border-slate-200/40 dark:border-white/[0.035]" />

      <div className="relative flex items-start justify-between gap-4">
        <div className={`grid h-12 w-12 place-items-center rounded-[17px] ${color.icon}`}>
          {icon}
        </div>
        {enabled ? (
          <div className="grid h-9 w-9 place-items-center rounded-full border border-slate-200/80 text-slate-400 transition group-hover:border-slate-300 group-hover:text-slate-800 dark:border-white/10 dark:text-slate-500 dark:group-hover:text-white">
            <ArrowRight className="h-4 w-4 stroke-[1.5]" />
          </div>
        ) : (
          <div className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
            {status}
          </div>
        )}
      </div>

      <div className={`relative ${featured ? "mt-16 lg:mt-[88px]" : "mt-16 lg:mt-[110px]"}`}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.19em] text-slate-400">{subtitle}</div>
        <h2 className={`mt-2 font-extralight tracking-[-0.045em] text-slate-950 dark:text-white ${featured ? "text-[42px] sm:text-[48px]" : "text-[34px] sm:text-[38px]"}`}>
          {title}
        </h2>
        <div className={`mt-4 h-[2px] w-8 rounded-full ${color.line}`} />
        <p className="mt-5 max-w-sm text-[13px] font-light leading-6 text-slate-500 dark:text-slate-400 sm:text-sm">
          {description}
        </p>
      </div>

      <div className="relative mt-auto pt-8">
        {footer ?? (
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
            {enabled ? <Check className={`h-3.5 w-3.5 ${color.ink}`} /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />}
            {status}
          </div>
        )}
      </div>
    </article>
  );

  if (!enabled || !to) return panel;

  return (
    <Link
      to={to as any}
      className="block h-full rounded-[34px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7FF9]/35 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#07090d]"
      onClick={(event) => {
        if (!environment) return;
        event.preventDefault();
        startEnvironmentTransition(environment, () => navigate({ to: to as any }));
      }}
      aria-label={`Abrir ambiente ${title}`}
    >
      {panel}
    </Link>
  );
}

function HubPage() {
  const clinic = useQuery({
    queryKey: ["clinic_context"],
    queryFn: fetchClinicContext,
    staleTime: 60_000,
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 5 * 60_000,
  });

  const modules = clinic.data?.modules ?? [];
  const labEnabled = modules.includes("laboratory") || modules.length === 0;
  const clinicEnabled = Boolean(clinic.data?.hasClinicalModule);
  const clinicStillValidating = !clinic.data && (clinic.isPending || clinic.isFetching);
  const clinicStatus = clinicEnabled
    ? "Ambiente disponível"
    : clinicStillValidating
      ? "Validando acesso"
      : clinic.isError
        ? "Revalidando acesso"
        : "Plano não habilitado";

  const displayName = profile.data?.full_name?.trim() || "Minha conta";
  const firstName = displayName.split(" ")[0];
  const avatar = profile.data?.avatar_url;

  return (
    <div className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-[#f6f9fc] px-4 pb-8 pt-8 text-slate-900 dark:bg-[#07090d] dark:text-white sm:px-6 md:px-8 lg:pb-10 lg:pt-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_-20%,rgba(45,127,249,0.105),transparent_42%),radial-gradient(circle_at_72%_15%,rgba(22,142,133,0.07),transparent_30%)] dark:bg-[radial-gradient(circle_at_50%_-20%,rgba(45,127,249,0.12),transparent_42%),radial-gradient(circle_at_72%_15%,rgba(77,187,177,0.07),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-144px)] w-full max-w-[1480px] flex-col">
        <header className="mx-auto max-w-3xl px-2 text-center">
          <div className="text-[11px] font-medium tracking-[-0.01em] text-slate-400">{firstName ? `Olá, ${firstName}` : "DentalFlow"}</div>
          <h1 className="mt-2 text-[32px] font-extralight leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-[42px] lg:text-[48px] dark:text-white">
            Selecione seu ambiente de trabalho
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[13px] font-light leading-6 text-slate-500 sm:text-sm dark:text-slate-400">
            Entre diretamente no módulo que você precisa. Cada ambiente mantém navegação, permissões e ferramentas próprias, com uma experiência contínua entre computador e celular.
          </p>
        </header>

        <section className="mt-8 grid flex-1 gap-4 lg:mt-10 lg:grid-cols-[0.9fr_1.18fr_0.9fr] lg:items-stretch lg:gap-5 xl:gap-6" aria-label="Ambientes do DentalFlow">
          <EnvironmentPanel
            title="Laboratório"
            subtitle="Produção odontológica"
            description="Organize casos, fluxo produtivo, equipe, materiais, estoque e entregas em um único ambiente operacional."
            icon={<FlaskConical className="h-[21px] w-[21px] stroke-[1.45]" />}
            accent="lab"
            enabled={labEnabled}
            to="/"
            environment="laboratory"
            status={labEnabled ? "Ambiente disponível" : "Acesso não habilitado"}
          />

          <EnvironmentPanel
            title="Clínica"
            subtitle="Gestão clínica integrada"
            description="Pacientes, agenda, registros clínicos, financeiro e acompanhamento do atendimento reunidos em um espaço claro e eficiente."
            icon={<Building2 className="h-[22px] w-[22px] stroke-[1.45]" />}
            accent="clinic"
            enabled={clinicEnabled}
            to="/clinica"
            environment="clinic"
            status={clinicStatus}
            featured
            footer={
              <div className="flex items-center justify-between gap-4 rounded-[22px] border border-slate-200/75 bg-white/82 p-3 shadow-[0_12px_36px_-28px_rgba(15,23,42,0.45)] dark:border-white/[0.08] dark:bg-white/[0.035]">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#168e85]/10 text-xs font-semibold text-[#168e85] dark:bg-[#4dbbb1]/10 dark:text-[#4dbbb1]">
                    {avatar ? (
                      <img src={avatar} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      displayName[0]?.toUpperCase() || "U"
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{displayName}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <ShieldCheck className="h-3 w-3 stroke-[1.6]" /> Sessão ativa
                    </div>
                  </div>
                </div>
                {clinicEnabled ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#168e85] dark:text-[#4dbbb1]" />
                ) : (
                  <span className="max-w-[116px] text-right text-[9px] font-medium uppercase leading-4 tracking-[0.08em] text-slate-400">{clinicStatus}</span>
                )}
              </div>
            }
          />

          <EnvironmentPanel
            title="Radiologia"
            subtitle="Imagem e diagnóstico"
            description="Um ambiente dedicado à organização de exames, imagens e integração diagnóstica, preparado para a próxima etapa da plataforma."
            icon={<Radio className="h-[21px] w-[21px] stroke-[1.45]" />}
            accent="radiology"
            enabled={false}
            status="Em preparação"
          />
        </section>

        <footer className="mt-5 flex items-center justify-center text-center text-[10px] font-light leading-5 text-slate-400 lg:mt-6">
          Seus ambientes disponíveis são definidos pelas permissões da sua conta.
        </footer>
      </div>
    </div>
  );
}
