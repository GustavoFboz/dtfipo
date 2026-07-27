import { useQuery } from "@tanstack/react-query";
import { fetchCases } from "@/lib/api";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { CountUp } from "@/components/CountUp";

export function DashboardStats({ onOpenDentes }: { onOpenDentes?: () => void }) {
  const { data: active } = useQuery({
    queryKey: ["cases", "active"],
    queryFn: () => fetchCases("active"),
  });
  const { data: finished } = useQuery({
    queryKey: ["cases", "finished"],
    queryFn: () => fetchCases("finished"),
  });

  const stats = useMemo(() => {
    const list = [...(active ?? []), ...(finished ?? [])];
    const total = list.length;
    const finishedCount = list.filter((c) => !!c.finished_at).length;
    const activeCount = total - finishedCount;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const late = list.filter((c) => {
      if (c.finished_at) return false;
      const delivery = new Date(c.delivery_date + "T00:00:00");
      return delivery < today;
    }).length;

    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonth = list.filter((c) => {
      const d = new Date((c.entry_date ?? "") + "T00:00:00");
      return !isNaN(d.getTime()) && d >= firstOfMonth;
    }).length;

    return [
      { value: activeCount, label: "Casos Ativos" },
      { value: late, label: "Casos Atrasados" },
      { value: thisMonth, label: "Casos este Mês" },
      { value: finishedCount, label: "Finalizados" },
    ];
  }, [active, finished]);

  return (
    <div className="flex items-center gap-8 md:gap-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 flex-1">
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="text-6xl md:text-7xl font-extralight text-primary leading-none tracking-tight tabular-nums">
            <CountUp value={s.value} />
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 font-light">
            {s.label}
          </div>
        </div>
      ))}
      </div>
      {onOpenDentes ? (
        <button
          type="button"
          onClick={onOpenDentes}
          aria-label="Abrir contador de dentes"
          className="shrink-0 inline-flex items-center justify-center h-14 w-14 rounded-full border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-primary hover:border-primary/30 transition-colors bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm"
        >
          <Plus className="h-5 w-5 stroke-[1.5px]" />
        </button>
      ) : (
        <Link
          to="/dentes"
          aria-label="Abrir contador de dentes"
          className="shrink-0 inline-flex items-center justify-center h-14 w-14 rounded-full border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-primary hover:border-primary/30 transition-colors bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm"
        >
          <Plus className="h-5 w-5 stroke-[1.5px]" />
        </Link>
      )}
    </div>
  );
}

