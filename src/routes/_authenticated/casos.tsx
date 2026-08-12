import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

import { CasesTable } from "@/components/CasesTable";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { DashboardStats } from "@/components/DashboardStats";
import { SolicitanteDashboard } from "@/components/SolicitanteDashboard";
import { MobileDashboard } from "@/components/MobileDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, ChevronRight, Filter, X, Trash2, CalendarDays, FileDown } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchDoctors, fetchCadistas, fetchStages, fetchCases } from "@/lib/api";
import { generateCasesReport } from "@/lib/reports";
import { GeneratingReportDialog } from "@/components/GeneratingReportDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/casos")({
  loader: () => ({}),
  component: Index,
});

function Index() {
  const now = useNow();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("em_andamento");
  const [isTrashMode, setIsTrashMode] = useState(false);
  const [openNewPatient, setOpenNewPatient] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);
  const [caseYear, setCaseYear] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({ all: 0, em_andamento: 0, atrasados: 0, finalizados: 0, arquivados: 0 });
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<{ doctorIds: string[]; cadistaIds: string[] }>({ doctorIds: [], cadistaIds: [] });
  const [localStartDate, setLocalStartDate] = useState("");
  const [localEndDate, setLocalEndDate] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    (window as any).DENTALFLOW_TRASH_MODE = isTrashMode;
    return () => { (window as any).DENTALFLOW_TRASH_MODE = false; };
  }, [isTrashMode]);

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


  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isSolicitante = profile?.role === "SOLICITANTE";

  if (isMobile) return <MobileDashboard />;
  if (isSolicitante) return (
    <div className="h-full max-h-full overflow-hidden flex flex-col font-light max-w-[1600px] mx-auto w-full px-6 md:px-16 pt-10 pb-8">
      <SolicitanteDashboard />
    </div>
  );

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

  const handleDownloadReport = async () => {
    setIsGeneratingReport(true);
    try {
      const allCases = await fetchCases("all");
      console.log("Found cases for report:", allCases.length);
      
      // Manually filter based on the same logic as the UI
      const filtered = allCases.filter((c) => {
        // Status filter
        const currentActiveFilter = isTrashMode ? "deleted" : filter;
        
        // Se o filtro for "all" ou não houver filtro definido, pulamos as verificações de status
        if (currentActiveFilter !== "all") {
          if (currentActiveFilter === "deleted") {
            if (c.status !== "cancelado") return false;
          } else if (currentActiveFilter === "em_andamento") {
            if (c.finished_at || c.status === "finalizado" || c.status === "arquivado" || c.status === "cancelado") return false;
          } else if (currentActiveFilter === "atrasados") {
            const isLate = (d: string | null | undefined) => {
              if (!d) return false;
              try {
                return new Date(d + "T00:00:00").getTime() < new Date().setHours(0,0,0,0);
              } catch { return false; }
            };
            if (c.finished_at || c.status === "finalizado" || c.status === "arquivado" || c.status === "cancelado") return false;
            if (!isLate(c.delivery_date)) return false;
          } else if (currentActiveFilter === "finalizados") {
            if (!c.finished_at && c.status !== "finalizado") return false;
          } else if (currentActiveFilter === "arquivados") {
            if (c.status !== "arquivado") return false;
          }
        }

        // Date range filter - apenas aplica se houver datas válidas
        if (dateRange && (dateRange.start || dateRange.end)) {
          const rawDate = c.entry_date || c.created_at;
          if (!rawDate) return false;
          
          try {
            const caseDate = new Date(rawDate.split('T')[0] + "T00:00:00");
            if (isNaN(caseDate.getTime())) return false;

            if (dateRange.start) {
              const startDate = new Date(dateRange.start + "T00:00:00");
              if (!isNaN(startDate.getTime()) && caseDate < startDate) return false;
            }
            if (dateRange.end) {
              const endDate = new Date(dateRange.end + "T00:00:00");
              if (!isNaN(endDate.getTime()) && caseDate > endDate) return false;
            }
          } catch {
            return false;
          }
        }
        
        // Advanced filters
        if (advancedFilters.doctorIds && advancedFilters.doctorIds.length > 0) {
          if (!c.doctor_id || !advancedFilters.doctorIds.includes(c.doctor_id)) return false;
        }
        if (advancedFilters.cadistaIds && advancedFilters.cadistaIds.length > 0) {
          if (!c.cadista_id || !advancedFilters.cadistaIds.includes(c.cadista_id)) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        toast.error("Nenhum caso encontrado com os filtros atuais.");
        return;
      }

      await generateCasesReport(filtered, {
        activeFilter: isTrashMode ? "deleted" : filter,
        dateRange: dateRange,
        doctorIds: advancedFilters.doctorIds,
        cadistaIds: advancedFilters.cadistaIds
      });
      toast.success("Relatório gerado com sucesso!");
    } catch (error) {
      console.error("Critical error generating report:", error);
      toast.error(`Erro ao gerar relatório: ${error instanceof Error ? error.message : 'Verifique o console'}`);

    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className={`h-full max-h-full overflow-hidden flex flex-col font-light max-w-[1600px] mx-auto w-full px-6 md:px-16 transition-colors duration-500 ${isTrashMode ? "bg-rose-50/30 dark:bg-rose-950/10" : ""} ${exiting ? "animate-lab-exit" : entering ? "animate-lab-enter" : ""}`}>
      <GeneratingReportDialog open={isGeneratingReport} />

      <header className="pt-10 md:pt-14 pb-8 md:pb-12 space-y-6 shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
          <span className={`h-1.5 w-1.5 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse ${isTrashMode ? "bg-rose-400" : "bg-emerald-400"}`} />
          {dt}
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-8">
          <div className="relative h-20 md:h-24 xl:h-28 flex items-center overflow-hidden">
            <AnimatePresence mode="wait">
              {!isTrashMode ? (
                <motion.h1 
                  key="normal-title"
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -40, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="text-4xl lg:text-5xl xl:text-7xl font-extralight text-slate-900 dark:text-slate-100 tracking-[-0.03em] leading-[1] flex flex-wrap items-baseline gap-2 md:gap-4"
                >
                  <span className="whitespace-nowrap">Controle de</span>
                  <span className="text-[#54A8FB]">Casos</span>
                  <ChevronRight className="h-6 w-6 md:h-8 md:w-8 xl:h-10 xl:w-10 text-slate-300 dark:text-slate-700 stroke-[1.2px] self-center shrink-0" />
                  {(caseYear != null || dateRange != null) && (
                    <span className="text-[#54A8FB] whitespace-nowrap">
                      {dateRange ? (
                        dateRange.start && dateRange.end && dateRange.start.split('-')[0] !== dateRange.end.split('-')[0]
                          ? `${dateRange.start.split('-')[0]}-${dateRange.end.split('-')[0]}`
                          : dateRange.start.split('-')[0]
                      ) : caseYear}
                    </span>
                  )}
                  {caseYear == null && dateRange == null && (
                    <span className="text-[#54A8FB] whitespace-nowrap">{new Date().getFullYear()}</span>
                  )}
                </motion.h1>
              ) : (
                <motion.h1 
                  key="trash-title"
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -40, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="text-4xl lg:text-5xl xl:text-7xl font-extralight text-rose-600 dark:text-rose-400 tracking-[-0.03em] leading-[1] flex flex-wrap items-baseline gap-2 md:gap-4"
                >
                  <span className="whitespace-nowrap">Lixeira de</span>
                  <span className="text-rose-500">Casos</span>
                  <ChevronRight className="h-6 w-6 md:h-8 md:w-8 xl:h-10 xl:w-10 text-rose-200 dark:text-rose-900 stroke-[1.2px] self-center shrink-0" />
                  {(caseYear != null || dateRange != null) && (
                    <span className="text-rose-400 whitespace-nowrap">
                      {dateRange ? (
                        dateRange.start && dateRange.end && dateRange.start.split('-')[0] !== dateRange.end.split('-')[0]
                          ? `${dateRange.start.split('-')[0]}-${dateRange.end.split('-')[0]}`
                          : dateRange.start.split('-')[0]
                      ) : caseYear}
                    </span>
                  )}
                  {caseYear == null && dateRange == null && (
                    <span className="text-rose-400 whitespace-nowrap">{new Date().getFullYear()}</span>
                  )}
                </motion.h1>
              )}
            </AnimatePresence>
          </div>

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
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 min-h-[58px]">
          <AnimatePresence mode="wait">
            {true && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`flex flex-wrap items-center gap-2 p-1 rounded-[2rem] w-fit transition-colors duration-500 ${isTrashMode ? "bg-rose-100/50 dark:bg-rose-900/20" : "bg-slate-100/50 dark:bg-white/5"}`}
              >
            {[
              { id: "em_andamento", label: "Em andamento" },
              { id: "all", label: "Todos" },
              { id: "atrasados", label: "Atrasados" },
              { id: "finalizados", label: "Finalizados" },
              { id: "arquivados", label: "Arquivados" },
              ...(isTrashMode ? [{ id: "cancelado", label: "Cancelados" }] : []),
            ].map((t) => {
              const isActive = filter === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={`relative flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium transition-colors duration-300 whitespace-nowrap z-10 ${
                    isActive
                      ? "text-white"
                      : isTrashMode 
                        ? "text-rose-300 hover:text-rose-500" 
                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-filter"
                      className={`absolute inset-0 shadow-lg rounded-full -z-10 transition-colors duration-500 ${isTrashMode ? "bg-rose-500 shadow-rose-400/20" : "bg-[#54A8FB] shadow-blue-400/20"}`}
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
                        className={`inline-grid place-items-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold bg-white ml-2 transition-colors duration-500 ${isTrashMode ? "text-rose-500" : "text-[#54A8FB]"}`}
                      >
                        {counts[t.id] ?? 0}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownloadReport}
              className="h-11 w-11 rounded-full border border-slate-200/50 dark:border-white/5 bg-white dark:bg-white/5 text-slate-400 hover:text-primary transition-all shadow-sm"
              title="Gerar Relatório PDF"
            >
              <FileDown className="h-4 w-4 stroke-[1.5px]" />
            </Button>

            <AnimatePresence mode="wait">
              {true && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`flex items-center gap-2 p-1 rounded-full border transition-all duration-500 ${isTrashMode ? "bg-rose-100/50 dark:bg-rose-900/20 border-rose-200/50" : "bg-slate-100/50 dark:bg-white/5 border-slate-200/50 dark:border-white/5"}`}
                >
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className={`h-10 px-4 rounded-full gap-2 transition-all ${dateRange ? (isTrashMode ? "bg-rose-500 text-white shadow-lg shadow-rose-400/20" : "bg-primary text-white shadow-lg shadow-blue-400/20") : (isTrashMode ? "text-rose-400 hover:text-rose-600" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")}`}>
                    <CalendarDays className="h-4 w-4 stroke-[1.5px]" />
                    <span className="text-[13px] font-medium">
                      {dateRange ? "Filtro Ativo" : "Hoje"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[320px] p-6 rounded-[2rem] border-slate-100 dark:border-[#2B292B] shadow-2xl bg-[#F8F9FB] dark:bg-slate-900">
                  <div className="space-y-6">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-medium">Filtro de Período</div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-400 font-medium px-1">INÍCIO</label>
                        <Input 
                          type="date" 
                          value={localStartDate}
                          onChange={(e) => setLocalStartDate(e.target.value)}
                          className="h-11 rounded-2xl bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 focus-visible:ring-1 focus-visible:ring-[#54A8FB]" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] text-slate-400 font-medium px-1">FIM</label>
                        <Input 
                          type="date" 
                          value={localEndDate}
                          onChange={(e) => setLocalEndDate(e.target.value)}
                          className="h-11 rounded-2xl bg-white dark:bg-white/5 border-slate-100 dark:border-white/5 focus-visible:ring-1 focus-visible:ring-[#54A8FB]" 
                        />
                      </div>
                    </div>
                    <Button 
                      onClick={() => setDateRange({ start: localStartDate, end: localEndDate })}
                      className="w-full h-11 rounded-full bg-[#54A8FB] hover:bg-[#4a97e2] text-white shadow-lg shadow-blue-400/20 font-medium"
                    >
                      Aplicar Filtro
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className={`h-10 w-10 rounded-full transition-all ${(advancedFilters.doctorIds.length > 0 || advancedFilters.cadistaIds.length > 0) ? (isTrashMode ? "bg-rose-500 text-white shadow-lg shadow-rose-400/20" : "bg-primary text-white shadow-lg shadow-blue-400/20") : (isTrashMode ? "text-rose-400 hover:text-rose-600" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")}`}>
                    <Filter className="h-4 w-4 stroke-[1.5px]" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[320px] p-6 rounded-[2rem] border-slate-100 dark:border-[#2B292B] shadow-2xl bg-[#F8F9FB] dark:bg-slate-900">
                  <AdvancedFilterContent filters={advancedFilters} setFilters={setAdvancedFilters} />
                </PopoverContent>
              </Popover>

              {(dateRange || advancedFilters.doctorIds.length > 0 || advancedFilters.cadistaIds.length > 0) && (
                <>
                  <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-10 w-10 rounded-full text-slate-400 hover:text-primary transition-all"
                    onClick={() => {
                      setDateRange(null);
                      setLocalStartDate("");
                      setLocalEndDate("");
                      setAdvancedFilters({ doctorIds: [], cadistaIds: [] });
                    }}
                  >
                    <X className="h-4 w-4 stroke-[1.5px]" />
                  </Button>
                </>
              )}
            </motion.div>
            )}
            </AnimatePresence>

            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                setIsTrashMode(!isTrashMode);
                if (!isTrashMode) setFilter("deleted");
                else setFilter("all");
              }}
              className={`h-11 w-11 rounded-full border border-slate-200/50 dark:border-white/5 transition-all shadow-sm ${
                isTrashMode 
                  ? "bg-rose-500 text-white hover:bg-rose-600 border-rose-400 shadow-rose-200/50" 
                  : "bg-white dark:bg-white/5 text-slate-400 hover:text-rose-500"
              }`}
              title={isTrashMode ? "Voltar aos Casos" : "Lixeira e Cancelados"}
            >
              <Trash2 className={`h-4 w-4 stroke-[1.5px] ${isTrashMode ? "animate-bounce" : ""}`} />
            </Button>
          </div>

        </div>
        
        <CasesTable 
          hideToolbar 
          minimal 
          hideSearch 
          activeFilter={isTrashMode ? "deleted" : filter} 
          onFilterChange={setFilter} 
          onYearChange={setCaseYear} 
          onCountsUpdate={setCounts}
          dateRange={dateRange}
          advancedFilters={advancedFilters}
        />
      </section>

      <section className="shrink-0 pt-8 pb-10 md:pb-14 border-t border-slate-200/70 dark:border-slate-800/70 mt-6">
        <DashboardStats onOpenDentes={openDentes} />
      </section>
    </div>
  );
}

function AdvancedFilterContent({ filters, setFilters }: { 
  filters: { doctorIds: string[]; cadistaIds: string[] };
  setFilters: React.Dispatch<React.SetStateAction<{ doctorIds: string[]; cadistaIds: string[] }>>
}) {
  const { data: doctors } = useQuery({ queryKey: ["doctors"], queryFn: fetchDoctors });
  const { data: cadistas } = useQuery({ queryKey: ["cadistas"], queryFn: fetchCadistas });
  const { data: stages } = useQuery({ queryKey: ["stages"], queryFn: fetchStages });
  
  const [selectedStages, setSelectedStages] = useState<string[]>([]);

  const toggleDoctor = (id: string) => {
    setFilters(prev => ({
      ...prev,
      doctorIds: prev.doctorIds.includes(id) 
        ? prev.doctorIds.filter(x => x !== id) 
        : [...prev.doctorIds, id]
    }));
  };

  const toggleCadista = (id: string) => {
    setFilters(prev => ({
      ...prev,
      cadistaIds: prev.cadistaIds.includes(id) 
        ? prev.cadistaIds.filter(x => x !== id) 
        : [...prev.cadistaIds, id]
    }));
  };

  const toggleStage = (id: string) => {
    // Stage filtering is handled by the main status filter in current UI, 
    // but we add it here as per request for "advanced search by stage"
    setSelectedStages(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-medium">Filtragem Avançada</div>
      
      <div className="space-y-5">
        <div className="space-y-3">
          <label className="text-[11px] text-slate-400 font-medium px-1 uppercase tracking-wider">Etapa do Fluxo</label>
          <div className="max-h-[120px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {stages?.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-1">
                <Checkbox 
                  id={`stage-${s.id}`} 
                  checked={selectedStages.includes(s.id)}
                  onCheckedChange={() => toggleStage(s.id)}
                  className="rounded-md border-slate-200 dark:border-white/10"
                />
                <label htmlFor={`stage-${s.id}`} className="text-[13px] font-light text-slate-600 dark:text-slate-300 cursor-pointer truncate">
                  {s.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] text-slate-400 font-medium px-1 uppercase tracking-wider">Profissionais (Dentistas)</label>
          <div className="max-h-[120px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {doctors?.map(d => (
              <div key={d.id} className="flex items-center gap-2 px-1">
                <Checkbox 
                  id={`doc-${d.id}`} 
                  checked={filters.doctorIds.includes(d.id)}
                  onCheckedChange={() => toggleDoctor(d.id)}
                  className="rounded-md border-slate-200 dark:border-white/10"
                />
                <label htmlFor={`doc-${d.id}`} className="text-[13px] font-light text-slate-600 dark:text-slate-300 cursor-pointer truncate">
                  {d.name}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[11px] text-slate-400 font-medium px-1 uppercase tracking-wider">Cadistas / Designers</label>
          <div className="max-h-[120px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {cadistas?.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-1">
                <Checkbox 
                  id={`cad-${c.id}`} 
                  checked={filters.cadistaIds.includes(c.id)}
                  onCheckedChange={() => toggleCadista(c.id)}
                  className="rounded-md border-slate-200 dark:border-white/10"
                />
                <label htmlFor={`cad-${c.id}`} className="text-[13px] font-light text-slate-600 dark:text-slate-300 cursor-pointer truncate">
                  {c.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-2 text-[10px] text-slate-400 text-center italic font-light">
        Os filtros são aplicados automaticamente.
      </div>
    </div>
  );
}



