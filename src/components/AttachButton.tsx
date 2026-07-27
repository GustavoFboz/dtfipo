import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ícone customizado "Anexar arquivos" (clipe) — cor via currentColor. */
export function AttachFilesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 182.94 167.85"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M59.8 134.67c6.48,0 11.89,-2.99 15.65,-6.01l64.83 -69.26c2.65,-4.14 2.5,-12.37 -7.27,-12.37 -4.71,0 -18.41,17.33 -22.43,21.9 -1.57,1.78 -2.92,2.94 -4.63,4.65l-35.57 37.64c-2.43,2.44 -6.64,7.99 -10.57,7.99 -6.31,0 -12.69,-8.42 -4.4,-16.77 2.62,-2.64 2.91,-3.58 5.18,-6.16l43.8 -47.96c11.89,-11.69 24.26,-32.21 37.9,-32.21 7.77,0 11.92,0.16 17.83,5.88 8.78,8.49 9.22,22.21 2.96,30.38 -1.08,1.41 -1.72,1.79 -2.95,3.24l-23.27 25.19c-3,2.97 -3.61,4.04 -6.23,7.18l-53.59 56.73c-13.52,11.05 -36.63,10.41 -50.52,-3.57 -16.87,-16.97 -13.25,-39.31 3.65,-56.71l38.66 -42.8c2.83,-2.78 3.27,-3.75 5.71,-6.66 4.48,-5.35 21.35,-21.04 21.35,-26.08 0,-5.44 -8.66,-12.15 -15.93,-2.53l-41.56 46.08c-2.09,2.37 -4.04,3.85 -6.19,6.18 -15.29,16.52 -32.21,32.88 -32.21,55.43 0,20.79 12.63,39.71 28.5,47.8 17.57,8.95 41.7,8.04 56.78,-3.76 14.45,-11.31 39.61,-42.76 55.21,-58.21 1.7,-1.69 3.07,-2.86 4.59,-4.69 1.9,-2.27 1.95,-2.84 4.15,-5.13l27.11 -29.6c8.06,-11.06 9.21,-29.47 0.84,-42.13l-5.59 -6.78c-7.6,-7.6 -19.36,-13.16 -31.5,-11.12 -15.95,2.69 -23.42,10.11 -33.74,23.04l-49.4 53.71c-5.65,6.11 -19.04,20.45 -20.61,26.84 -3.92,15.91 7.8,30.65 23.46,30.65z"
      />
    </svg>
  );
}

/** Ícone customizado "Anexar imagens" — cor via currentColor. */
export function AttachImagesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 38.2 38.36"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M36.4 18.33c-1.41,-0.24 -4.74,0.03 -6.24,0.15 -3.4,0.27 -7.5,1.06 -10.59,2.36 -0.97,0.41 -3.76,1.69 -4.2,2.26 1.35,0.88 3.35,0.88 7.83,4.51 0.22,0.17 0.29,0.18 0.49,0.39 0.24,0.24 0.27,0.29 0.49,0.49 0.74,0.64 2.83,3 3.05,4 0.22,1 -0.45,1.94 -1.23,2.16 -2.86,0.81 -1.84,-3.77 -10.36,-7.43 -3,-1.29 -5.35,-1.75 -8.67,-1.9 -1.03,-0.05 -2.6,0.11 -3.45,0.01l0 -18.07c0.06,-0.72 0.37,-1.12 0.8,-1.45 0.47,-0.37 1.23,-0.32 1.9,-0.32l13.75 0 -0.01 -3.62 -0.22 0c-4.16,0.08 -8.57,0.01 -12.82,0l-1.1 0 -0 0c-3.21,0 -5.83,2.62 -5.83,5.83l0 24.84c0,2.94 2.21,5.39 5.05,5.78 0.54,0.04 1.15,0.05 1.86,0.05l21.28 0 2.38 0c3.02,0 5.53,-2.33 5.81,-5.28 0.01,-0.18 0.02,-0.36 0.02,-0.56 0,-0.55 0.01,-1.09 0.01,-1.64l0 -6.94c-0,-1.87 -0.01,-3.75 -0.01,-5.61z"
      />
      <path
        fill="currentColor"
        d="M10.88 9.26c-6.15,1.33 -4.06,10.12 1.79,8.91 2.35,-0.49 4.07,-2.5 3.55,-5.36 -0.41,-2.27 -2.61,-4.14 -5.34,-3.55z"
      />
      <path
        fill="currentColor"
        d="M25.42 5.49l3.71 0 0 -3.71c0,-0.98 0.8,-1.79 1.79,-1.79 0.98,0 1.79,0.8 1.79,1.79l0 3.71 3.71 0c0.98,0 1.79,0.8 1.79,1.79 0,0.98 -0.8,1.79 -1.79,1.79l-3.71 0 0 3.71c0,0.98 -0.8,1.79 -1.79,1.79 -0.98,0 -1.79,-0.8 -1.79,-1.79l0 -3.71 -3.71 0c-0.98,0 -1.79,-0.8 -1.79,-1.79 0,-0.98 0.8,-1.79 1.79,-1.79z"
      />
    </svg>
  );
}

type Props = {
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * Botão de anexo grande com 3 estados visuais:
 * - idle: fundo azul muito claro, texto/ícone em azul
 * - active (tem anexos): fundo sólido azul, texto/ícone brancos
 * - hover: transição intermediária
 */
export function AttachButton({ icon, label, count, active, onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-14 w-full items-center justify-center gap-3 rounded-2xl border transition-all",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25"
          : "bg-primary/[0.08] text-primary border-transparent hover:bg-primary/[0.14]",
        className,
      )}
    >
      <span className="h-6 w-6 shrink-0 grid place-items-center">{icon}</span>
      <span className="text-[15px] font-normal">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
            active ? "bg-white/25 text-primary-foreground" : "bg-primary/15 text-primary",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
