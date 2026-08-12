import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ToothMilling = "" | "zirconia" | "dissilicato";

type Props = {
  open: boolean;
  /** Dente principal (foco atual do painel). */
  tooth: number | null;
  /** Todos os dentes atualmente sendo configurados juntos (inclui `tooth`). */
  configuredTeeth: number[];
  caseTypes: { id: string; name: string }[];
  toothTypeId: string;
  onToothTypeChange: (id: string) => void;
  milling: ToothMilling;
  onMillingChange: (m: ToothMilling) => void;
  /** Enceramento é um extra cumulativo — pode coexistir com o tipo primário. */
  hasEnceramento?: boolean;
  onEnceramentoToggle?: () => void;
  /** Sistema de implante ativo no dente atual (id). Vazio = dente sem implante. */
  activeImplantSystemId?: string;
  hasImplant: boolean;
  onImplantToggle: () => void;
  /**
   * Sistemas de implante disponíveis para escolher neste dente.
   * Em criação/edição: passar apenas os sistemas adicionados ao caso
   * (para permitir escolher entre eles por dente). Vazio = nenhum sistema
   * cadastrado no caso ainda; nesse caso o parent pode passar a lista
   * geral e usar `onImplantSystemPick` para definir também no caso.
   */
  implantSystemOptions?: { id: string; name: string }[];
  onImplantSystemPick?: (id: string) => void;
  onRemoveTooth: () => void;

  onConfirm: () => void;
  onClose: () => void;
  /** Limpa todas as predefinições daquele(s) dente(s) e fecha o painel. */
  onClear: () => void;
};

const EXIT_MS = 220;

export function ToothWorkPanel({
  open, tooth, configuredTeeth, caseTypes, toothTypeId, onToothTypeChange,
  milling, onMillingChange, activeImplantSystemId, hasImplant, onImplantToggle,
  hasEnceramento = false, onEnceramentoToggle,
  implantSystemOptions, onImplantSystemPick,
  onRemoveTooth, onConfirm, onClose, onClear,
}: Props) {

  // Mantém o painel montado durante a animação de saída.
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  // Snapshot dos últimos props visíveis para não sumir conteúdo durante o exit.
  const [snap, setSnap] = useState<{
    tooth: number | null;
    configuredTeeth: number[];
    toothTypeId: string;
    milling: ToothMilling;
    hasImplant: boolean;
  }>({ tooth, configuredTeeth, toothTypeId, milling, hasImplant });

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      setSnap({ tooth, configuredTeeth, toothTypeId, milling, hasImplant });
    } else if (mounted) {
      setExiting(true);
      const t = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mantém o snapshot atualizado enquanto o painel está aberto.
  useEffect(() => {
    if (open) setSnap({ tooth, configuredTeeth, toothTypeId, milling, hasImplant });
  }, [open, tooth, configuredTeeth, toothTypeId, milling, hasImplant]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onClose]);

  if (!mounted) return null;

  const view = exiting ? snap : {
    tooth, configuredTeeth, toothTypeId, milling, hasImplant,
  };

  const extraCount = view.configuredTeeth.length - 1;
  const label = extraCount > 0
    ? `Dentes ${view.tooth ?? "—"} +${extraCount}`
    : `Dente ${view.tooth ?? "—"}`;

  return (
    <div
      className={cn(
        "absolute inset-y-0 left-0 w-full lg:w-[calc(100%/(1+0.8))] z-30 flex flex-col",
        "bg-white/85 backdrop-blur-sm",
        "border border-border rounded-2xl m-2",
        exiting
          ? "pointer-events-none animate-out fade-out slide-out-to-left-2"
          : "animate-in fade-in slide-in-from-left-2",
      )}
      style={{ animationDuration: `${EXIT_MS}ms`, animationFillMode: "both" }}
      role="dialog"
      aria-label="Configurar dente"
    >
      <header className="flex items-start justify-between px-8 pt-8 pb-4">
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight className="h-6 w-6 text-primary shrink-0" strokeWidth={1.5} />
          <h3 className="text-3xl font-extralight tracking-tight leading-none truncate">
            <span className="text-primary">{label}</span>
            <span className="text-foreground/80 ml-3 text-2xl">Tipo de Trabalho</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-muted-foreground hover:text-foreground transition"
          aria-label="Limpar predefinições do dente"
        >
          Limpar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-4 space-y-6">
        {/* Trabalho */}
        <section className="space-y-3">
          <div className="text-base font-normal text-foreground">Trabalho</div>
          {caseTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Adicione tipos de caso no formulário para atribuir por dente.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {caseTypes.map((t) => {
                const active = view.toothTypeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToothTypeChange(active ? "" : t.id)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-light transition border",
                      active
                        ? "bg-white text-foreground border-border shadow-sm"
                        : "bg-transparent text-muted-foreground border-transparent hover:text-foreground",
                    )}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
          {onEnceramentoToggle && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onEnceramentoToggle}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-light transition border inline-flex items-center gap-2",
                  hasEnceramento
                    ? "bg-white text-foreground border-border shadow-sm"
                    : "bg-transparent text-muted-foreground border-dashed border-border/60 hover:text-foreground",
                )}
                aria-pressed={hasEnceramento}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    hasEnceramento ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                Enceramento
              </button>
            </div>
          )}
        </section>

        {/* Implante */}
        <section className="space-y-3">
          <div className="text-base font-normal text-foreground">Implante</div>
          {(implantSystemOptions?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum sistema de implante cadastrado. Cadastre em Ajustes → Implantes.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {implantSystemOptions!.map((opt) => {
                const active = view.hasImplant && activeImplantSystemId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (active) {
                        onImplantToggle();
                      } else {
                        onImplantSystemPick?.(opt.id);
                      }
                    }}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-light transition border",
                      active
                        ? "bg-white text-foreground border-border shadow-sm"
                        : "bg-transparent text-muted-foreground border-transparent hover:text-foreground",
                    )}
                  >
                    {opt.name}
                  </button>
                );
              })}
            </div>
          )}
        </section>


        {/* Material */}
        <section className="space-y-3">
          <div className="text-base font-normal text-foreground">Material</div>
          <div className="flex items-center gap-6">
            {([
              { id: "zirconia", label: "Zirconia", color: "#0C84FA" },
              { id: "dissilicato", label: "Dissilicato", color: "#FF8300" },
            ] as const).map((o) => {
              const active = view.milling === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onMillingChange(active ? "" : o.id)}
                  className="text-xl font-light transition"
                  style={{ color: active ? o.color : "#1F2937" }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="px-8 py-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onRemoveTooth}
          className="text-xs text-destructive/80 hover:text-destructive transition"
        >
          Remover dente do caso
        </button>
        <Button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-10 font-normal shadow-lg shadow-primary/25"
        >
          OK
        </Button>
      </footer>
    </div>
  );
}
