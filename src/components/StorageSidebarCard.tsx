import { useEffect, useSyncExternalStore } from "react";
import { HardDrive, AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  formatStorageBytes,
  getStorageUsageSnapshot,
  refreshStorageUsage,
  subscribeStorageUsage,
} from "@/lib/storage";

export function StorageSidebarCard({ collapsed = false }: { collapsed?: boolean }) {
  const storage = useSyncExternalStore(subscribeStorageUsage, getStorageUsageSnapshot, getStorageUsageSnapshot);
  const usage = storage.data;

  useEffect(() => {
    void refreshStorageUsage().catch(() => undefined);
    const id = window.setInterval(() => void refreshStorageUsage().catch(() => undefined), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (collapsed) {
    const pct = usage ? Math.min(100, Math.max(0, usage.usage_ratio * 100)) : 0;
    return (
      <Link
        to="/armazenamento"
        title="Armazenamento"
        className="mx-auto mb-3 h-10 w-10 rounded-xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] grid place-items-center relative text-slate-500 hover:text-primary hover:border-primary/20 transition"
      >
        <HardDrive className="h-[19px] w-[19px] stroke-[1.5px]" />
        <span className="absolute -bottom-1 left-1 right-1 h-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <span className="block h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </span>
      </Link>
    );
  }

  const percent = usage ? Math.min(100, Math.max(0, usage.usage_ratio * 100)) : 0;
  const available = usage ? formatStorageBytes(usage.available_bytes) : "—";
  const used = usage ? formatStorageBytes(usage.used_bytes) : "—";
  const limit = usage ? formatStorageBytes(usage.limit_bytes) : "1 GB";
  const warning = !!usage?.almost_full;
  const full = !!usage?.full;

  return (
    <div className="mx-3 mb-3 rounded-[22px] border border-slate-100/90 dark:border-white/[0.07] bg-gradient-to-b from-white to-slate-50/60 dark:from-slate-950 dark:to-slate-900/50 p-4 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0">
          <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90" aria-hidden="true">
            <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100 dark:text-white/10" />
            <circle
              cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4"
              strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 16}`}
              strokeDashoffset={`${2 * Math.PI * 16 * (1 - percent / 100)}`}
              className={full ? "text-rose-500" : warning ? "text-amber-500" : "text-primary"}
            />
          </svg>
          <HardDrive className="absolute inset-0 m-auto h-4 w-4 text-slate-500 dark:text-slate-300 stroke-[1.5px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">
            Armazenamento
            {warning && <AlertTriangle className={`h-3.5 w-3.5 ${full ? "text-rose-500" : "text-amber-500"}`} />}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5 min-w-0">
            <span className="text-[18px] font-light tracking-tight text-slate-900 dark:text-slate-50 truncate">{available}</span>
            <span className="text-[10px] font-medium text-primary whitespace-nowrap">disponível</span>
          </div>
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${full ? "bg-rose-500" : warning ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1.5 text-[10.5px] text-slate-400 dark:text-slate-500">
        {used} de {limit} usados
      </div>

      {warning && (
        <p className={`mt-2 text-[10.5px] leading-snug ${full ? "text-rose-500" : "text-amber-600 dark:text-amber-400"}`}>
          {full ? "Limite atingido. Novos uploads estão bloqueados." : "O armazenamento está próximo do limite."}
        </p>
      )}

      <Link
        to="/armazenamento"
        className="mt-3 h-9 w-full rounded-xl bg-primary text-white text-[11px] font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 active:scale-[0.99] transition"
      >
        Gerenciar armazenamento <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      {usage && !usage.quota_enforced && (
        <p className="mt-2 text-[9.5px] text-slate-400 leading-tight">
          A medição será ativada após a atualização do banco de dados.
        </p>
      )}
    </div>
  );
}
