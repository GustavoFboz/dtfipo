import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ArcadaMode = "work" | "implant";

type Props = {
  mode: ArcadaMode;
  onChange: (mode: ArcadaMode) => void;
  /**
   * Sinaliza que há sistema(s) de implante ativo(s) no caso sem nenhum
   * dente marcado. Exibe um pontinho vermelho sobre o ícone de implante
   * para alertar o usuário a eleger ao menos 1 dente.
   */
  needsImplantTooth?: boolean;
};

const ACTIVE_LIGHT = "#0C84FA";
const ACTIVE_DARK = "#FFFFFF";
const INACTIVE_LIGHT = "#E6E6E6";
const INACTIVE_DARK = "#3F3F46";
const ACTIVE_ICON_LIGHT = "#F8F8F8";
const ACTIVE_ICON_DARK = "#0A0A0A";

function useIsDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function ToothIcon({ color }: { color: string }) {
  return (
    <svg viewBox="27 24 249 249" className="h-6 w-6" xmlns="http://www.w3.org/2000/svg">
      <path
        fill={color}
        d="M149.7 89.16c-11.09,-0.48 -21.58,-6.97 -32.02,-6.21 -10.95,0.8 -16.9,8.25 -20.16,18.07 -3.47,10.45 -4.02,23.07 -3.19,34.78 1.91,27.03 9.58,52.06 21.88,74.02 0.71,1.26 1.08,1.9 1.97,2.69 2.85,2.53 7.82,1.6 9.69,-1.86 0.97,-1.81 1.1,-5.82 1.34,-8.16 1.42,-13.94 4.96,-45.66 23.34,-43.86 14.48,1.42 18.19,25.15 19.76,37.59 0.36,2.83 0.68,5.67 0.98,8.5 0.33,3.16 0.34,5.7 2.26,7.46 1.64,1.5 4.42,2.37 7.09,1.24 2.09,-0.89 3.23,-3.15 4.39,-5.3 12.14,-22.63 19.52,-47.45 21.04,-75 1.01,-18.27 -1.25,-51.29 -26.28,-50.19 -5.25,0.23 -10.9,2.11 -15.62,3.52 -5.16,1.54 -10.54,2.96 -16.47,2.7z"
      />
    </svg>
  );
}

function ImplantIcon({ color }: { color: string }) {
  return (
    <svg viewBox="274 24 249 249" className="h-6 w-6" xmlns="http://www.w3.org/2000/svg">
      <path
        fill={color}
        d="M370.24 92.54l56.48 0c1.82,0 3.4,-1.12 4.46,-3.16 1.08,-2.04 1.33,-4.46 0.75,-6.84l-4.06 -16.68c-0.78,-3.13 -2.81,-5.17 -5.21,-5.17 -16.12,0 -32.25,0 -48.37,0 -2.4,0 -4.44,2.04 -5.21,5.17l-4.06 16.68c-0.58,2.38 -0.32,4.8 0.75,6.84 1.07,2.04 2.63,3.16 4.46,3.16l0.01 0zm-21.89 28.12l4.89 0c6.05,0 10.98,4.94 10.98,10.98l0 49.12c0,6.05 4.94,11 10.98,11l46.56 0c6.05,0 10.98,-4.95 10.98,-11l0 -49.12c0,-6.05 4.93,-10.98 10.97,-10.98l4.91 0c1.82,0 3.39,-0.8 4.46,-2.28 0.86,-1.21 1.2,-2.59 0.98,-4.02 0.03,-0.24 0.03,-0.49 -0.03,-0.76l-3.05 -13.11c-0.36,-1.51 -1.09,-2.86 -2.41,-2.86l-3.67 0 -0.12 0 -0.23 -0.01c-30.73,0 -61.45,0 -92.18,0l-0.22 0.01 -0.12 0 -3.54 0c-1.33,0 -2.06,1.34 -2.4,2.86l-3.05 13.11 -0.03 0.13c-0.46,1.63 -0.16,3.26 0.84,4.64 1.07,1.48 2.62,2.28 4.47,2.28l0.01 0.01zm33.53 76.28l33.2 0 -3.08 29.74c-0.56,5.5 -5.36,9.49 -10.89,9.49l-5.24 0c-5.52,0 -10.33,-3.98 -10.89,-9.49l-3.08 -29.74 -0.01 0z"
      />
    </svg>
  );
}

/**
 * Pill de duas opções: Arcada de Trabalho / Arcada de Implante.
 */
export function ArcadaModeToggle({ mode, onChange, needsImplantTooth }: Props) {
  const isDark = useIsDark();
  const ACTIVE = isDark ? ACTIVE_DARK : ACTIVE_LIGHT;
  const INACTIVE = isDark ? INACTIVE_DARK : INACTIVE_LIGHT;
  const ACTIVE_ICON = isDark ? ACTIVE_ICON_DARK : ACTIVE_ICON_LIGHT;
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="inline-flex items-center gap-1 rounded-full p-1 bg-[#F8F8F8] border border-[#E6E6E6] dark:bg-white/[0.06] dark:border-white/10"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onChange("work")}
              className={cn("grid h-8 w-8 place-items-center rounded-full transition-all")}
              style={{ backgroundColor: mode === "work" ? ACTIVE : "transparent" }}
              aria-label="Arcada de trabalho"
            >
              <ToothIcon color={mode === "work" ? ACTIVE_ICON : INACTIVE} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Arcada de trabalho</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onChange("implant")}
              className={cn("relative grid h-8 w-8 place-items-center rounded-full transition-all")}
              style={{ backgroundColor: mode === "implant" ? ACTIVE : "transparent" }}
              aria-label="Arcada de implante"
            >
              <ImplantIcon color={mode === "implant" ? ACTIVE_ICON : INACTIVE} />
              {needsImplantTooth && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-black animate-pulse"
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {needsImplantTooth
              ? "Selecione ao menos 1 dente com este sistema de implante"
              : "Arcada de implante"}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
