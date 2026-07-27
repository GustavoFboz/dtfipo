import { Badge } from "@/components/ui/badge";
import type { Stage } from "@/lib/types";
import { Sparkles } from "lucide-react";

function readableTextColor(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#0a0a0a";
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.65 ? "#1a1a1a" : "#ffffff";
}

export function StageBadge({
  stage,
  pending,
  size = "md",
}: {
  stage: Stage | null;
  pending?: number;
  size?: "sm" | "md";
}) {
  if (!stage) return null;
  const fg = readableTextColor(stage.color);
  return (
    <span className="relative inline-flex">
      <Badge
        className={`rounded-full border-0 font-semibold tracking-wide ${
          size === "sm" ? "px-2.5 py-0.5 text-[10px]" : "px-3.5 py-1 text-xs"
        }`}
        style={{ backgroundColor: stage.color, color: fg }}
      >
        {stage.name}
      </Badge>
      {pending && pending > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 grid place-items-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
          {pending}
        </span>
      ) : null}
    </span>
  );
}
