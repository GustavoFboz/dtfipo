import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Blocos de carregamento (estilo Nubank/Instagram): retângulos com brilho
 * deslizante que ocupam o lugar do conteúdo antes dele ser revelado.
 *
 * Uso:
 *   <SkeletonBlock className="h-4 w-32" />
 *   <SkeletonCircle className="h-12 w-12" />
 *   <SkeletonText lines={2} />
 *   <SkeletonListCard />
 */
export function SkeletonBlock({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("df-shimmer rounded-lg", className)} {...props} />;
}

export function SkeletonCircle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("df-shimmer rounded-full", className)} {...props} />;
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-1/2" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Card com avatar + duas linhas — padrão para listas (pacientes, equipe, casos). */
export function SkeletonListCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl border border-border/60 p-4 flex items-center gap-3",
        className,
      )}
    >
      <SkeletonCircle className="h-12 w-12 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonBlock className="h-3.5 w-2/5" />
        <SkeletonBlock className="h-2.5 w-3/5" />
      </div>
    </div>
  );
}

/** Grade de cards de lista. */
export function SkeletonCardGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListCard key={i} />
      ))}
    </div>
  );
}

/** Linhas de tabela. */
export function SkeletonTableRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-card border border-border/60">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={c}
              className={cn("h-3", c === 0 ? "w-1/4" : "flex-1")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Bloco de imagem/miniatura. */
export function SkeletonImage({ className }: { className?: string }) {
  return <SkeletonBlock className={cn("w-full aspect-square rounded-2xl", className)} />;
}

/**
 * Crossfade entre skeleton e conteúdo: o skeleton se dissolve (fade + blur)
 * enquanto o conteúdo surge de baixo para cima, sem "corte duro".
 */
export function SkeletonSwap({
  loading,
  skeleton,
  children,
  className,
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [showSkeleton, setShowSkeleton] = React.useState(loading);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (loading) {
      setLeaving(false);
      setShowSkeleton(true);
      return;
    }
    if (!showSkeleton) return;
    setLeaving(true);
    const t = window.setTimeout(() => {
      setShowSkeleton(false);
      setLeaving(false);
    }, 380);
    return () => window.clearTimeout(t);
  }, [loading, showSkeleton]);

  return (
    <div className={cn("relative", className)}>
      {showSkeleton && (
        <div className={cn(leaving && "df-skeleton-out", !loading && "absolute inset-0 z-10")}>
          {skeleton}
        </div>
      )}
      {!loading && <div className="df-content-in">{children}</div>}
    </div>
  );
}
