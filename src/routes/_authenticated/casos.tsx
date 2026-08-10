import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";


import { CasesTable } from "@/components/CasesTable";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { DashboardStats } from "@/components/DashboardStats";
import { MobileDashboard } from "@/components/MobileDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, ChevronRight, Filter, X } from "lucide-react";
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
  const [caseYear, setCaseYear] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0, em_andamento: 0, finalizados: 0, arquivados: 0, cancelados: 0 });
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [localStartDate, setLocalStartDate] = useState("");
  const [localEndDate, setLocalEndDate] = useState("");
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
        <div className="relative flex items-center p-1 bg-slate-100/50 dark:bg-white/5 rounded-full w-fit mb-8 overflow-visible">
          {[
            { id: "all", label: "Todos" },
            { id: "em_andamento", label: "Em andamento" },
            { id: "finalizados", label: "Finalizados" },
            { id: "arquivados", label: "Arquivados" },
            { id: "cancelados", label: "Cancelados" },
          ].map((t) => {
            const isActive = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`relative flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium transition-colors duration-300 whitespace-nowrap z-10 ${
                  isActive
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-filter"
                    className="absolute inset-0 bg-[#54A8FB] shadow-lg shadow-blue-400/20 rounded-full -z-10"
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }}
                  />
                )}
                {t.label}
                <AnimatePresence mode="popLayout">
                  {isActive && (
                    <motion.span
                      key={`count-${t.id}`}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 600, 
                        damping: 25,
                      }}
                      className="inline-grid place-items-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold bg-white text-[#54A8FB] ml-2"
                    >
                      {counts[t.id] ?? 0}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
        
        <div className="flex justify-end mb-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={`h-10 px-4 rounded-full border gap-2 transition-all ${dateRange ? "bg-primary/10 text-primary border-primary/20" : "bg-white dark:bg-white/5 text-slate-400 hover:text-slate-600 border-slate-100 dark:border-white/5"}`}>
                <Filter className="h-4 w-4 stroke-[1.5px]" />
                <span className="font-light">{dateRange ? "Filtro Ativo" : "Personalizado"}</span>
                {dateRange && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDateRange(null);
                      setLocalStartDate("");
                      setLocalEndDate("");
                    }}
                    className="ml-1 hover:text-primary/70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-6 rounded-[2rem] border-slate-100 dark:border-[#2B292B] shadow-[20px_20px_60px_#d1d9e6,-20px_-20px_60px_#ffffff] dark:shadow-none bg-[#F8F9FB] dark:bg-slate-900">
              <div className="space-y-6">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-medium">Filtro de Período</div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400 font-medium px-1">INÍCIO</label>
                    <Input 
                      type="date" 
                      value={localStartDate}
                      onChange={(e) => setLocalStartDate(e.target.value)}
                      className="h-11 rounded-2xl bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 focus-visible:ring-1 focus-visible:ring-[#54A8FB] font-light" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400 font-medium px-1">FIM</label>
                    <Input 
                      type="date" 
                      value={localEndDate}
                      onChange={(e) => setLocalEndDate(e.target.value)}
                      className="h-11 rounded-2xl bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 focus-visible:ring-1 focus-visible:ring-[#54A8FB] font-light" 
                    />
                  </div>
                </div>

                <Button 
                  onClick={() => setDateRange({ start: localStartDate, end: localEndDate })}
                  className="w-full h-11 rounded-full bg-[#54A8FB] hover:bg-[#4a97e2] text-white shadow-lg shadow-blue-400/20 font-medium transition-all"
                >
                  Aplicar Filtro
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <CasesTable 
          hideToolbar 
          minimal 
          hideSearch 
          activeFilter={filter} 
          onFilterChange={setFilter} 
          onYearChange={setCaseYear} 
          onCountsUpdate={setCounts}
          dateRange={dateRange}
        />
      </section>

      <section className="shrink-0 pt-8 pb-10 md:pb-14 border-t border-slate-200/70 dark:border-slate-800/70 mt-6">
        <DashboardStats onOpenDentes={openDentes} />
      </section>
    </div>
  );
}

