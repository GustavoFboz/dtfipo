import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Home, LogOut, Moon, Sun } from "lucide-react";

import { startEnvironmentTransition, type EnvironmentName } from "@/components/EnvironmentTransition";
import { fetchProfile } from "@/lib/api";
import { fetchClinicContext } from "@/lib/clinic";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/hub")({ component: HubPage });

type EnvironmentOption = {
  id: "laboratory" | "clinic" | "radiology";
  name: EnvironmentName;
  description: string;
  to: "/casos" | "/clinica" | "/radiologia";
  accent: string;
  accentSoft: string;
};

const ENVIRONMENTS: Record<EnvironmentOption["id"], EnvironmentOption> = {
  laboratory: {
    id: "laboratory",
    name: "Laboratório",
    description: "Gerencie casos, produção, equipe, materiais e entregas em um único fluxo de trabalho.",
    to: "/casos",
    accent: "#2D7FF9",
    accentSoft: "rgba(45,127,249,0.12)",
  },
  clinic: {
    id: "clinic",
    name: "Clínica",
    description: "Gerencie seus arquivos e informações clínicas em um único ambiente integrado.",
    to: "/clinica",
    accent: "#1b958c",
    accentSoft: "rgba(27,149,140,0.12)",
  },
  radiology: {
    id: "radiology",
    name: "Radiologia",
    description: "Organize exames, imagens e informações diagnósticas em um ambiente dedicado.",
    to: "/radiologia",
    accent: "#7c6ee6",
    accentSoft: "rgba(124,110,230,0.11)",
  },
};

function normalizedModules(input: string[] | undefined) {
  return new Set((input ?? []).map((value) => String(value).trim().toLowerCase()));
}

function hasAny(set: Set<string>, values: string[]) {
  return values.some((value) => set.has(value));
}

function HubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const [selectedId, setSelectedId] = useState<EnvironmentOption["id"] | null>(null);

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

  const available = useMemo(() => {
    // Nunca renderizamos ambientes indisponíveis. O seletor é montado apenas a
    // partir dos módulos efetivamente concedidos à conta atual.
    if (!clinic.data) return [] as EnvironmentOption[];

    const modules = normalizedModules(clinic.data.modules);
    const result: EnvironmentOption[] = [];
    const hasClinic = Boolean(clinic.data.clinicId);
    const hasClinical = Boolean(clinic.data.hasClinicalModule) || hasAny(modules, ["clinical", "clinic", "clinica"]);
    const explicitLab = hasAny(modules, ["laboratory", "laboratorio", "laboratório", "lab"]);
    const explicitRadiology = hasAny(modules, ["radiology", "radiologia", "imaging", "image"]);

    // Conta profissional individual sem vínculo empresarial continua sendo um
    // ambiente de Laboratório. Em instalações legadas, clínica vinculada sem uma
    // lista explícita de módulos também conserva Laboratório como fallback.
    const personalLaboratory = !hasClinic;
    const legacyLaboratory = hasClinic && modules.size === 0 && !hasClinical;

    if (explicitLab || personalLaboratory || legacyLaboratory) result.push(ENVIRONMENTS.laboratory);
    if (hasClinical) result.push(ENVIRONMENTS.clinic);
    if (explicitRadiology) result.push(ENVIRONMENTS.radiology);

    return result;
  }, [clinic.data]);

  useEffect(() => {
    if (!available.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !available.some((item) => item.id === selectedId)) {
      setSelectedId(available[0].id);
    }
  }, [available, selectedId]);

  const selected = available.find((item) => item.id === selectedId) ?? available[0] ?? null;
  const profileName = profile.data?.full_name?.trim() || "Minha conta";
  const avatar = profile.data?.avatar_url;

  const enterSelected = () => {
    if (!selected) return;
    startEnvironmentTransition(selected.name, () => navigate({ to: selected.to as any }));
  };

  const logout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } });
  };

  return (
    <div className="relative h-screen min-h-[620px] overflow-hidden bg-[#edf4f8] text-[#25282d] dark:bg-[#080b10] dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.12),rgba(255,255,255,0.58)_50%,rgba(255,255,255,0.12))] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.01),rgba(255,255,255,0.025)_50%,rgba(255,255,255,0.01))]" />

      <div className="absolute left-5 top-5 z-40 flex items-center gap-1.5 sm:left-7 sm:top-7">
        <Link
          to="/hub"
          data-no-window-drag
          className="grid h-10 w-10 place-items-center rounded-full border border-white/65 bg-white/55 text-slate-500 shadow-[0_6px_24px_-16px_rgba(15,23,42,0.45)] backdrop-blur-md transition hover:bg-white/80 hover:text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white"
          aria-label="Início"
          title="Início"
        >
          <Home className="h-[18px] w-[18px] stroke-[1.35]" />
        </Link>
        <button
          type="button"
          data-no-window-drag
          onClick={() => void logout()}
          className="grid h-10 w-10 place-items-center rounded-full text-slate-400/80 transition hover:bg-white/50 hover:text-slate-700 dark:hover:bg-white/[0.05] dark:hover:text-white"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="h-[17px] w-[17px] stroke-[1.25]" />
        </button>
      </div>

      <div className="absolute right-5 top-5 z-40 sm:right-7 sm:top-7">
        <button
          type="button"
          data-no-window-drag
          onClick={toggleTheme}
          className="relative flex h-[44px] w-[104px] items-center overflow-hidden rounded-full border border-white/80 bg-white/58 p-1 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/[0.09] dark:bg-white/[0.04]"
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          title={theme === "dark" ? "Tema claro" : "Tema escuro"}
        >
          <span className={`absolute top-1 h-9 w-[47px] rounded-full bg-white shadow-[0_4px_14px_-8px_rgba(15,23,42,0.5)] transition-transform duration-300 dark:bg-white/[0.1] ${theme === "dark" ? "translate-x-[48px]" : "translate-x-0"}`} />
          <span className="relative z-10 grid h-9 w-[47px] place-items-center text-slate-400">
            <Moon className="h-[18px] w-[18px] stroke-[1.25]" />
          </span>
          <span className="relative z-10 grid h-9 w-[47px] place-items-center text-slate-400">
            <Sun className="h-[18px] w-[18px] stroke-[1.25]" />
          </span>
        </button>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-[7.8vh] z-30 px-5 text-center sm:top-[8.5vh]">
        <h1 className="mx-auto max-w-[650px] text-[29px] font-extralight leading-[1.05] tracking-[-0.04em] text-[#4a4d51] sm:text-[36px] lg:text-[42px] dark:text-white/82">
          <span className="block font-thin text-[#666a70] dark:text-white/54">Selecione seu</span>
          <span className="block font-light">Ambiente de Trabalho</span>
        </h1>
      </header>

      {available.length ? (
        <section
          className="relative z-10 flex h-full flex-col sm:flex-row"
          aria-label="Ambientes disponíveis"
        >
          {available.map((environment, index) => {
            const active = selected?.id === environment.id;
            return (
              <button
                key={environment.id}
                type="button"
                data-no-window-drag
                onMouseEnter={() => setSelectedId(environment.id)}
                onFocus={() => setSelectedId(environment.id)}
                onClick={() => setSelectedId(environment.id)}
                onDoubleClick={enterSelected}
                className={`group relative min-h-0 min-w-0 flex-1 overflow-hidden text-center outline-none transition-[background-color,filter] duration-500 ${index > 0 ? "border-t border-[#d8e2e9]/80 sm:border-l sm:border-t-0 dark:border-white/[0.055]" : ""}`}
                aria-pressed={active}
                aria-label={`Selecionar ${environment.name}`}
              >
                <span
                  className={`absolute inset-0 transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0"}`}
                  style={{
                    background: `
                      radial-gradient(circle at 54% 54%, ${environment.accentSoft} 0%, transparent 35%),
                      linear-gradient(128deg, rgba(255,255,255,.42) 0%, rgba(255,255,255,.08) 48%, rgba(255,255,255,.35) 100%),
                      repeating-linear-gradient(118deg, rgba(255,255,255,.16) 0 42px, rgba(215,228,236,.09) 42px 86px)
                    `,
                  }}
                />
                <span className={`absolute inset-0 transition-colors duration-500 ${active ? "bg-white/26 dark:bg-white/[0.018]" : "bg-[#edf4f8]/70 dark:bg-[#080b10]/74"}`} />

                <span className="absolute inset-x-5 top-[42%] -translate-y-1/2 sm:inset-x-8 sm:top-[48%]">
                  <span
                    className={`block whitespace-nowrap font-extralight leading-none tracking-[-0.055em] transition-[font-size,color,transform,opacity] duration-500 ${active ? "text-[48px] sm:text-[56px] lg:text-[72px]" : "text-[38px] text-[#555b62]/82 sm:text-[44px] lg:text-[58px] dark:text-white/58"}`}
                    style={active ? { color: environment.accent } : undefined}
                  >
                    {environment.name}
                  </span>
                  <span
                    className={`mx-auto mt-3 block max-w-[330px] text-[12px] font-extralight leading-[1.38] tracking-[-0.015em] text-[#6f777d] transition-all duration-500 sm:text-[13px] dark:text-white/45 ${active ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                  >
                    {environment.description}
                  </span>
                </span>

                <span
                  className={`absolute bottom-[17%] left-1/2 h-[2px] -translate-x-1/2 rounded-full transition-all duration-500 sm:bottom-[19%] ${active ? "w-9 opacity-70" : "w-0 opacity-0"}`}
                  style={{ backgroundColor: environment.accent }}
                />
              </button>
            );
          })}
        </section>
      ) : (
        <div className="absolute inset-0 z-10 grid place-items-center px-6 pt-24 text-center">
          <div className="max-w-sm text-[13px] font-light leading-6 text-slate-400">
            {clinic.isError ? "Não foi possível validar seus ambientes agora. Tente novamente em instantes." : "Preparando seus ambientes…"}
          </div>
        </div>
      )}

      {selected ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[4.8vh] z-30 flex flex-col items-center sm:bottom-[6vh]">
          <button
            type="button"
            data-no-window-drag
            onClick={enterSelected}
            className="pointer-events-auto flex min-w-[300px] max-w-[calc(100vw-32px)] items-center gap-4 rounded-full border border-white/75 bg-white/66 px-5 py-3.5 text-left shadow-[0_16px_46px_-28px_rgba(15,23,42,0.52)] backdrop-blur-2xl transition hover:bg-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 sm:min-w-[380px] sm:px-7 sm:py-4 dark:border-white/[0.085] dark:bg-[#11161d]/66 dark:hover:bg-[#151b23]/78"
            aria-label={`Entrar em ${selected.name}`}
          >
            <span className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full bg-white/80 text-base font-light text-slate-500 shadow-sm dark:bg-white/[0.08] dark:text-white/70">
              {avatar ? <img src={avatar} alt={profileName} className="h-full w-full object-cover" /> : profileName[0]?.toUpperCase() || "U"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[18px] font-normal tracking-[-0.025em] text-[#1e2328] sm:text-[20px] dark:text-white/90">{profileName}</span>
              <span className="mt-0.5 block text-[16px] font-extralight leading-none text-slate-400 sm:text-[17px]">Entrar</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 stroke-[1.25] text-[#272b30]/82 dark:text-white/70" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
