import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Home, LogIn, Moon, Sun } from "lucide-react";

import { startEnvironmentTransition, type EnvironmentName } from "@/components/EnvironmentTransition";
import { fetchProfile } from "@/lib/api";
import { fetchClinicContext } from "@/lib/clinic";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/hub")({ component: HubPage });

type EnvironmentOption = {
  id: "laboratory" | "clinic" | "radiology";
  name: EnvironmentName;
  description: string;
  to: "/casos" | "/clinica" | "/radiologia";
  accent: string;
  tint: string;
};

const ENVIRONMENTS: Record<EnvironmentOption["id"], EnvironmentOption> = {
  laboratory: {
    id: "laboratory",
    name: "Laboratório",
    description: "Gerencie casos, produção, equipe, materiais e entregas em um único fluxo de trabalho.",
    to: "/casos",
    accent: "#2d7ff9",
    tint: "rgba(45,127,249,.085)",
  },
  clinic: {
    id: "clinic",
    name: "Clínica",
    description: "Gerencie seus arquivos e informações clínicas tudo em um único ambiente integrado.",
    to: "/clinica",
    accent: "#15988f",
    tint: "rgba(21,152,143,.09)",
  },
  radiology: {
    id: "radiology",
    name: "Radiologia",
    description: "Organize exames, imagens e informações diagnósticas em um ambiente dedicado.",
    to: "/radiologia",
    accent: "#7668d9",
    tint: "rgba(118,104,217,.08)",
  },
};

const SELECTED_STORAGE_KEY = "dentalflow:hub-selected-environment";

function normalizeModules(input: string[] | undefined) {
  return new Set((input ?? []).map((value) => String(value).trim().toLowerCase()));
}

function hasAny(set: Set<string>, values: string[]) {
  return values.some((value) => set.has(value));
}

function readRememberedEnvironment(): EnvironmentOption["id"] | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(SELECTED_STORAGE_KEY);
    return value === "laboratory" || value === "clinic" || value === "radiology" ? value : null;
  } catch {
    return null;
  }
}

function HubPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [selectedId, setSelectedId] = useState<EnvironmentOption["id"] | null>(() => readRememberedEnvironment());

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
    if (!clinic.data) return [] as EnvironmentOption[];

    const modules = normalizeModules(clinic.data.modules);
    const hasClinic = Boolean(clinic.data.clinicId);
    const result: EnvironmentOption[] = [];
    const clinical = Boolean(clinic.data.hasClinicalModule) || hasAny(modules, ["clinical", "clinic", "clinica"]);
    const laboratory = hasAny(modules, ["laboratory", "laboratorio", "laboratório", "lab"]);
    const radiology = hasAny(modules, ["radiology", "radiologia", "imaging", "image"]);

    // Profissional individual sem empresa/Clínica vinculada usa o ambiente de
    // Laboratório. Em uma conta empresarial, só entram módulos realmente ativos.
    if (!hasClinic || laboratory) result.push(ENVIRONMENTS.laboratory);
    if (clinical) result.push(ENVIRONMENTS.clinic);
    if (radiology) result.push(ENVIRONMENTS.radiology);

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

  useEffect(() => {
    if (!selectedId) return;
    try {
      sessionStorage.setItem(SELECTED_STORAGE_KEY, selectedId);
    } catch {}
  }, [selectedId]);

  const selected = available.find((item) => item.id === selectedId) ?? available[0] ?? null;
  const profileName = profile.data?.full_name?.trim() || "Minha conta";
  const avatar = profile.data?.avatar_url;

  const enterSelected = () => {
    if (!selected) return;
    startEnvironmentTransition(selected.name, () => navigate({ to: selected.to as any }));
  };

  return (
    <div className="relative h-[100dvh] min-h-[580px] overflow-hidden bg-[#eef4f8] text-[#2f3337] dark:bg-[#080b10] dark:text-white">
      <Link
        to="/hub"
        data-no-window-drag
        aria-label="Início"
        title="Início"
        className="absolute left-4 top-4 z-50 grid h-9 w-9 place-items-center rounded-full text-[#7f878e]/75 transition hover:bg-white/45 hover:text-[#34393e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 sm:left-6 sm:top-6 dark:text-white/35 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
      >
        <Home className="h-[17px] w-[17px] stroke-[1.15]" />
      </Link>

      <button
        type="button"
        data-no-window-drag
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-50 flex h-[42px] w-[102px] items-center overflow-hidden rounded-full border border-white/90 bg-white/48 p-[3px] shadow-[0_8px_24px_-19px_rgba(15,23,42,.5)] backdrop-blur-2xl transition sm:right-8 sm:top-8 dark:border-white/[0.08] dark:bg-white/[0.035]"
        aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        title={theme === "dark" ? "Tema claro" : "Tema escuro"}
      >
        <span
          className={`absolute top-[3px] h-[36px] w-[46px] rounded-full bg-white/94 shadow-[0_5px_16px_-10px_rgba(15,23,42,.52)] transition-transform duration-300 dark:bg-white/[0.10] ${theme === "dark" ? "translate-x-[49px]" : "translate-x-0"}`}
        />
        <span className="relative z-10 grid h-[36px] w-[46px] place-items-center text-[#c7ccd0]">
          <Moon className="h-[17px] w-[17px] stroke-[1.05]" />
        </span>
        <span className="relative z-10 grid h-[36px] w-[46px] place-items-center text-[#c7ccd0]">
          <Sun className="h-[17px] w-[17px] stroke-[1.05]" />
        </span>
      </button>

      <header className="pointer-events-none absolute inset-x-0 top-[11.6vh] z-40 px-5 text-center sm:top-[12.4vh]">
        <h1 className="mx-auto max-w-[660px] leading-[.98] tracking-[-0.042em] text-[#4b4f53] dark:text-white/78">
          <span className="block text-[31px] font-thin text-[#73787c] sm:text-[36px] lg:text-[40px] dark:text-white/48">Selecione seu</span>
          <span className="mt-1 block text-[32px] font-extralight sm:text-[39px] lg:text-[44px]">Ambiente de Trabalho</span>
        </h1>
      </header>

      {available.length ? (
        <section
          className="relative z-10 grid h-full grid-rows-[repeat(var(--environment-count),minmax(0,1fr))] sm:grid-cols-[repeat(var(--environment-count),minmax(0,1fr))] sm:grid-rows-1"
          style={{ "--environment-count": available.length } as React.CSSProperties}
          aria-label="Ambientes disponíveis"
        >
          {available.map((environment, index) => {
            const active = selected?.id === environment.id;
            return (
              <button
                key={environment.id}
                type="button"
                data-no-window-drag
                aria-pressed={active}
                aria-label={`Selecionar ${environment.name}`}
                onPointerEnter={() => setSelectedId(environment.id)}
                onFocus={() => setSelectedId(environment.id)}
                onClick={() => setSelectedId(environment.id)}
                onDoubleClick={enterSelected}
                className={`group relative min-h-0 min-w-0 overflow-hidden outline-none ${index > 0 ? "border-t border-[#d7e1e7]/75 sm:border-l sm:border-t-0 dark:border-white/[0.055]" : ""}`}
              >
                <span className="absolute inset-0 bg-[#edf4f8] transition-colors duration-500 dark:bg-[#080b10]" />

                <span
                  className={`absolute inset-0 transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`}
                  style={{
                    background: `radial-gradient(ellipse at 50% 49%, ${environment.tint} 0%, transparent 46%), linear-gradient(104deg, rgba(255,255,255,.52) 0%, rgba(255,255,255,.12) 52%, rgba(219,232,238,.14) 100%)`,
                  }}
                />

                <span
                  className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${active ? "opacity-[.29]" : "opacity-0"}`}
                  aria-hidden="true"
                >
                  <span className="absolute left-[8%] top-[27%] h-[35%] w-[84%] -skew-y-6 bg-white/20" />
                  <span className="absolute left-[15%] top-[34%] h-px w-[72%] rotate-[-11deg] bg-white/80" />
                  <span className="absolute left-[20%] top-[43%] h-px w-[66%] rotate-[-7deg] bg-white/65" />
                  <span className="absolute left-[25%] top-[52%] h-px w-[58%] rotate-[-3deg] bg-white/50" />
                  <span className="absolute bottom-[21%] left-[12%] h-[17%] w-[76%] rounded-[40%] bg-white/24 blur-xl" />
                </span>

                <span className="absolute inset-x-4 top-[50.5%] -translate-y-1/2 text-center sm:inset-x-5 sm:top-[51%]">
                  <span
                    className={`block whitespace-nowrap font-extralight leading-none tracking-[-0.065em] transition-[font-size,color,opacity,transform] duration-500 ${active ? "text-[50px] sm:text-[64px] lg:text-[88px] xl:text-[96px]" : "text-[40px] text-[#555b60]/78 sm:text-[51px] lg:text-[64px] xl:text-[69px] dark:text-white/54"}`}
                    style={active ? { color: environment.accent } : undefined}
                  >
                    {environment.name}
                  </span>
                  <span
                    className={`mx-auto mt-3.5 block max-w-[350px] text-[11px] font-extralight leading-[1.28] tracking-[-0.014em] text-[#92999e] transition-all duration-500 sm:text-[13px] lg:text-[14px] ${active ? "translate-y-0 opacity-100" : "translate-y-[8px] opacity-0"}`}
                  >
                    {environment.description}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <div className="absolute inset-0 z-10 grid place-items-center px-6 pt-20 text-center">
          <p className="max-w-sm text-[12px] font-light leading-6 text-[#9aa1a7]">
            {clinic.isError ? "Não foi possível validar seus ambientes agora. Tente novamente em instantes." : "Preparando seus ambientes…"}
          </p>
        </div>
      )}

      {selected ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[9.5vh] z-40 flex flex-col items-center sm:bottom-[10.4vh]">
          <button
            type="button"
            data-no-window-drag
            onClick={enterSelected}
            aria-label={`Entrar em ${selected.name}`}
            className="pointer-events-auto flex min-w-[310px] max-w-[calc(100vw-30px)] items-center gap-4 rounded-full border border-white/90 bg-white/61 px-5 py-[12px] text-left shadow-[0_18px_48px_-31px_rgba(15,23,42,.52)] backdrop-blur-2xl transition hover:bg-white/78 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 sm:min-w-[410px] sm:px-7 sm:py-[13px] dark:border-white/[0.08] dark:bg-[#11161d]/58 dark:hover:bg-[#151b23]/74"
          >
            <span className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full bg-white/80 text-[15px] font-light text-[#777f86] shadow-sm dark:bg-white/[0.075] dark:text-white/70">
              {avatar ? <img src={avatar} alt={profileName} className="h-full w-full object-cover" /> : profileName[0]?.toUpperCase() || "U"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[18px] font-normal tracking-[-0.025em] text-[#1f2327] sm:text-[20px] dark:text-white/90">{profileName}</span>
              <span className="mt-[1px] block text-[15px] font-extralight leading-none text-[#aab0b5] sm:text-[17px]">Entrar</span>
            </span>
          </button>

          <button
            type="button"
            data-no-window-drag
            onClick={enterSelected}
            aria-label={`Abrir ${selected.name}`}
            className="pointer-events-auto mt-3 grid h-9 w-9 place-items-center rounded-full text-[#25292d] transition hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:text-white/70 dark:hover:bg-white/[0.05]"
          >
            <LogIn className="h-[22px] w-[22px] stroke-[1.15]" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
