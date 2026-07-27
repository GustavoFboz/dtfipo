import { Pencil, Square, Circle, ArrowUpRight, MessageSquarePlus, Eraser, Camera, Trash2, MousePointer2 } from "lucide-react";
import { TOOL_COLORS, type ToolId } from "./annotation-types";

interface Props {
  tool: ToolId;
  onToolChange: (t: ToolId) => void;
  color: string;
  onColorChange: (c: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
  onCapture: () => void;
  onClear: () => void;
  hasAnnotations: boolean;
}

const TOOLS: { id: ToolId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "none", label: "Mover / rotacionar", icon: MousePointer2 },
  { id: "pen", label: "Caneta", icon: Pencil },
  { id: "rect", label: "Retângulo", icon: Square },
  { id: "circle", label: "Círculo", icon: Circle },
  { id: "arrow", label: "Seta", icon: ArrowUpRight },
  { id: "comment", label: "Comentário", icon: MessageSquarePlus },
  { id: "eraser", label: "Apagar item", icon: Eraser },
];

export function AnnotationToolbar({
  tool, onToolChange, color, onColorChange, width, onWidthChange, onCapture, onClear, hasAnnotations,
}: Props) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 p-1.5 rounded-2xl bg-background/90 backdrop-blur border border-border/60 shadow-lg">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => onToolChange(t.id)}
            className={`h-9 w-9 rounded-lg flex items-center justify-center transition ${
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}

      <div className="h-px bg-border/60 my-1" />

      {/* Paleta de cor */}
      <div className="flex flex-col items-center gap-1">
        {TOOL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onColorChange(c)}
            className={`h-5 w-5 rounded-full border transition ${
              color === c ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border/60"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Espessura */}
      <input
        type="range"
        min={1}
        max={10}
        value={width}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        className="w-9 mt-1 accent-primary"
        title={`Espessura: ${width}px`}
      />

      <div className="h-px bg-border/60 my-1" />

      <button
        type="button"
        title="Capturar JPEG"
        onClick={onCapture}
        className="h-9 w-9 rounded-lg flex items-center justify-center text-foreground/70 hover:bg-muted transition"
      >
        <Camera className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Limpar anotações"
        onClick={onClear}
        disabled={!hasAnnotations}
        className="h-9 w-9 rounded-lg flex items-center justify-center text-foreground/70 hover:bg-muted transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
