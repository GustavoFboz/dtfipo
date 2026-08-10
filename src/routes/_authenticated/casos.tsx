import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CasesTable } from "@/components/CasesTable";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { DashboardStats } from "@/components/DashboardStats";
import { MobileDashboard } from "@/components/MobileDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/casos")({
  component: Index,
});

function Index() {
  const now = useNow();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [openNewPatient, setOpenNewPatient] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);
  const [caseYear, setCaseYear] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0, em_andamento: 0, finalizados: 0, arquivados: 0, cancelados: 0 });
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      if (sessionStorage.getItem("dentalflow:lab-enter") === "1") {
        sessionStorage.removeItem("dentalflow:lab-enter");
        setEntering(true);
        const t = window.setTimeout(() => setEntering(false), 460);
        return () => window.clearTimeout(t);
      }
    } catch {}
  }, []);


  if (isMobile) return <MobileDashboard />;

  const dt = now
    ? `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} - ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
    : "";

  const openDentes = () => {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => {
      navigate({ to: "/dentes" });
    }, 320);
  };

  return (
    <div className={`h-full max-h-full overflow-hidden flex flex-col font-light max-w-[1600px] mx-auto w-full px-6 md:px-16 ${exiting ? "animate-lab-exit" : entering ? "animate-lab-enter" : ""}`}>

      <header className="pt-10 md:pt-14 pb-8 md:pb-12 space-y-6 shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
          {dt}
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">
          <h1 className="text-4xl lg:text-5xl xl:text-7xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1] flex flex-wrap items-baseline gap-2 md:gap-4">
            <span className="whitespace-nowrap">Controle de</span>
            <span className="text-primary">Casos</span>
            <ChevronRight className="h-6 w-6 md:h-8 md:w-8 xl:h-10 xl:w-10 text-slate-300 dark:text-slate-700 stroke-[1.2px] self-center shrink-0" />
            {caseYear != null && (
              <span className="text-primary whitespace-nowrap">{caseYear}</span>
            )}
          </h1>

          <div className="flex items-center gap-4 w-full lg:w-auto lg:min-w-[300px] justify-end">
            <PatientFormDialog
              open={openNewPatient}
              onOpenChange={setOpenNewPatient}
              trigger={
                <Button variant="ghost" className="h-14 px-8 rounded-full bg-white hover:bg-slate-50 text-slate-400 border border-slate-100 shadow-sm font-normal text-[15px] gap-2 transition-all hover:-translate-y-[1px]">
                  <Plus className="h-4 w-4 stroke-[1.5px]" /> Novo paciente
                </Button>
              }
            />
            <NewCaseDialog
              trigger={
                <Button className="h-14 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 font-normal text-[15px] gap-2 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-[1px]">
                  <Plus className="h-4 w-4 stroke-[1.5px]" /> Nova entrada
                </Button>
              }
            />
          </div>
        </div>
      </header>

      <section className="flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-4 mb-8">
          {[
            { id: "all", label: "Todos" },
            { id: "em_andamento", label: "Em andamento" },
            { id: "finalizados", label: "Finalizados" },
            { id: "arquivados", label: "Arquivados" },
            { id: "cancelados", label: "Cancelados" },
          ].map((t) => {
            const isActive = filter === t.id;
            // Get count for this filter from CasesTable or local state if we had it.
            // For now we'll just implement the visual requested.
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full text-[13px] font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-[#54A8FB] text-white shadow-lg shadow-blue-400/20"
                    : "bg-white dark:bg-white/5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-100 dark:border-white/5"
                }`}
              >
                {t.label}
                <span className={`inline-grid place-items-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-white text-black" : "bg-[#54A8FB] text-white"
                }`}>
                  {counts[t.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <CasesTable hideToolbar minimal hideSearch activeFilter={filter} onFilterChange={setFilter} onYearChange={setCaseYear} onCountsUpdate={setCounts} />
      </section>

      <section className="shrink-0 pt-8 pb-10 md:pb-14 border-t border-slate-200/70 dark:border-slate-800/70 mt-6">
        <DashboardStats onOpenDentes={openDentes} />
      </section>
    </div>
  );
}

