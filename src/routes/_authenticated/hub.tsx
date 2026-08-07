// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Wallet, Stethoscope, ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { useIsBetaTester } from "@/hooks/use-is-beta-tester";


export const Route = createFileRoute("/_authenticated/")({
  component: HubPage,
});

type ClinicModules = {
  company_type: "LAB" | "CLINIC" | "HYBRID" | "IPO";
  modules_enabled: string[];
};

function useActiveClinicModules() {
  const { isReady, userId } = useAuthReady();
  return useQuery<ClinicModules | null>({
    queryKey: ["active-clinic-modules", userId],
    enabled: isReady && !!userId,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("clinic_id")
        .eq("id", userId!)
        .maybeSingle();
      let clinicId = profile?.clinic_id ?? null;
      if (!clinicId) {
        const { data: member } = await supabase
          .from("clinic_members")
          .select("clinic_id")
          .eq("user_id", userId!)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        clinicId = member?.clinic_id ?? null;
      }
      if (!clinicId) return null;
      const { data: clinic } = await supabase
        .from("clinics")
        .select("company_type, modules_enabled")
        .eq("id", clinicId)
        .maybeSingle();
      return (clinic as ClinicModules | null) ?? null;
    },
  });
}

type ModuleCardProps = {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  enabled: boolean;
  comingSoon?: boolean;
  accent: string;
};

function ModuleCard({ title, subtitle, description, icon: Icon, to, enabled, comingSoon, accent }: ModuleCardProps) {
  const disabled = !enabled || comingSoon;
  const inner = (
    <div
      className={`group relative h-full bg-white dark:bg-slate-900 p-10 md:p-12 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)] transition-all duration-700 overflow-hidden ${
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:shadow-[0_30px_80px_rgba(0,0,0,0.06)] hover:-translate-y-1.5"
      }`}
    >
      <div className={`absolute -top-24 -right-24 h-64 w-64 rounded-full ${accent} opacity-[0.06] blur-3xl transition-opacity duration-1000 group-hover:opacity-[0.12]`} />
      <div className="relative z-10 flex flex-col h-full gap-8">
        <div className="flex items-start justify-between">
          <div className={`p-5 rounded-2xl bg-primary/5 text-primary border border-primary/10 transition-all duration-700 ${!disabled && "group-hover:scale-110 group-hover:bg-primary/10 group-hover:rotate-3"}`}>
            <Icon className="h-7 w-7 stroke-[1.2px]" />
          </div>
          {comingSoon ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              <Lock className="h-3 w-3" /> Em breve
            </span>
          ) : !enabled ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Indisponível
            </span>
          ) : (
            <ArrowRight className="h-5 w-5 text-slate-300 dark:text-slate-600 stroke-[1.5px] transition-all duration-700 group-hover:text-primary group-hover:translate-x-1" />
          )}
        </div>

        <div className="space-y-3 mt-auto">
          <div className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.1em]">{subtitle}</div>
          <h3 className="text-3xl md:text-4xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1.05]">
            {title}
          </h3>
          <p className="text-sm font-light text-slate-500 dark:text-slate-400 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );

  if (disabled || !to) return <div className="h-full">{inner}</div>;
  return (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  );
}

function HubPage() {
  const { data: modules } = useActiveClinicModules();
  const { data: isBeta } = useIsBetaTester();
  const baseEnabled: string[] = Array.isArray(modules?.modules_enabled)
    ? (modules!.modules_enabled as string[])
    : ["laboratory"];
  // Módulo Financeiro desativado — nunca é habilitado, mesmo para beta testers.
  const enabled = isBeta
    ? Array.from(new Set([...baseEnabled, "laboratory"]))
    : baseEnabled;
  const isIPO = modules?.company_type === "IPO";


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="max-w-[1400px] mx-auto px-6 md:px-16 py-16 md:py-24">
        <header className="mb-16 md:mb-24 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
            {isIPO ? "IPO — Acesso total" : "Plataforma"}
          </div>
          <h1 className="text-5xl md:text-7xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1]">
            IPO<span className="text-primary"> · </span>Instituto Praia
            <br />
            <span className="text-slate-400 dark:text-slate-600">de Odontologia</span>
          </h1>
          <p className="text-base md:text-lg font-light text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
            Selecione um módulo para começar. Sua conta acessa apenas os módulos habilitados pela sua empresa.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <ModuleCard
            title="Laboratório"
            subtitle="Módulo 01"
            description="Gestão completa de casos, pacientes, estoque, equipe e fluxo de produção do laboratório."
            icon={FlaskConical}
            to="/lab"
            enabled={enabled.includes("laboratory")}
            accent="bg-primary"
          />
          <ModuleCard
            title="Financeiro"
            subtitle="Módulo 02"
            description="Controle financeiro, contas a pagar e receber, fluxo de caixa e relatórios."
            icon={Wallet}
            enabled={false}
            comingSoon
            accent="bg-emerald-500"
          />

          <ModuleCard
            title="Clínica"
            subtitle="Módulo 03"
            description="Agenda clínica, prontuários, atendimentos e prescrições."
            icon={Stethoscope}
            enabled={enabled.includes("clinical")}
            comingSoon
            accent="bg-violet-500"
          />
        </div>
      </div>
    </div>
  );
}
