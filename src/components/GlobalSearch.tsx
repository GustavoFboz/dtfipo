import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, Loader2, X, Users, LayoutDashboard, FileText, ImageIcon, Settings, SlidersHorizontal, Check, UserCircle, Calendar, Boxes, SearchX, Command } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { CaseDetailDialog } from "./CaseDetailDialog";
import type { CaseRow, Patient } from "@/lib/types";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocation } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type SearchCategory = "cases" | "patients" | "doctors" | "team" | "settings";

interface SearchResult {
  cases: CaseRow[];
  patients: Patient[];
  attachments: { id: string; file_name: string; case_id: string; kind: string }[];
  doctors: { id: string; name: string }[];
  team: { id: string; full_name: string; role: string }[];
}

const CATEGORIES: { id: SearchCategory; label: string; icon: any }[] = [
  { id: "cases", label: "Casos", icon: LayoutDashboard },
  { id: "patients", label: "Pacientes", icon: Users },
  { id: "doctors", label: "Dentistas", icon: UserCircle },
  { id: "team", label: "Equipe", icon: Users },
  { id: "settings", label: "Configurações", icon: Settings },
];

export function GlobalSearch() {
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500); // Aumentado para 500ms para reduzir carga no banco
  const [isOpen, setIsOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Default filters based on current page
  const initialFilters = useMemo(() => {
    if (pathname.includes("/casos")) return ["cases"] as SearchCategory[];
    if (pathname.includes("/patients")) return ["patients"] as SearchCategory[];
    if (pathname.includes("/equipe")) return ["team"] as SearchCategory[];
    if (pathname.includes("/configuracoes")) return ["settings"] as SearchCategory[];
    return ["cases", "patients"] as SearchCategory[];
  }, [pathname]);

  const [activeFilters, setActiveFilters] = useState<SearchCategory[]>(initialFilters);

  // Reset filters when changing pages
  useEffect(() => {
    setActiveFilters(initialFilters);
  }, [initialFilters]);

  const { data: results, isLoading } = useQuery<SearchResult>({
    queryKey: ["global-search", debouncedQuery, activeFilters],
    enabled: debouncedQuery.length >= 1,
    queryFn: async () => {
      const qContains = `%${debouncedQuery}%`;
      const promises: any[] = [];

      // Fix order to match destructured array [casesRes, attachmentsRes, patientsRes, doctorsRes, teamRes]
      
      // 1. Cases
      if (activeFilters.includes("cases")) {
        promises.push(
          supabase
            .from("cases")
            .select("*, patient:patients(name), doctor:doctors(name), case_type:case_types(name)")
            .or(`case_label.ilike.${qContains},patient_name_denorm.ilike.${qContains},doctor_name_denorm.ilike.${qContains}`)
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // 2. Attachments
      if (activeFilters.includes("cases") || activeFilters.includes("patients")) {
        promises.push(
          supabase
            .from("case_attachments")
            .select("id, file_name, case_id, kind")
            .ilike("file_name", qContains)
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // 3. Patients
      if (activeFilters.includes("patients")) {
        promises.push(
          supabase
            .from("patients")
            .select("*")
            .or(`name.ilike.${qContains},cpf.ilike.${qContains}`)
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // 4. Doctors
      if (activeFilters.includes("doctors")) {
        promises.push(
          supabase
            .from("doctors")
            .select("*")
            .or(`name.ilike.${qContains},crm_cro.ilike.${qContains}`)
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      // 5. Team
      if (activeFilters.includes("team")) {
        promises.push(
          supabase
            .from("profiles")
            .select("id, full_name, role")
            .ilike("full_name", qContains)
            .limit(5)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const rawResults = await Promise.all(promises);
      let resIdx = 0;
      const casesRes = activeFilters.includes("cases") ? rawResults[resIdx++] : { data: [] };
      const attachmentsRes = (activeFilters.includes("cases") || activeFilters.includes("patients")) ? rawResults[resIdx++] : { data: [] };
      const patientsRes = activeFilters.includes("patients") ? rawResults[resIdx++] : { data: [] };
      const doctorsRes = activeFilters.includes("doctors") ? rawResults[resIdx++] : { data: [] };
      const teamRes = activeFilters.includes("team") ? rawResults[resIdx++] : { data: [] };

      return {
        cases: (casesRes?.data || []) as unknown as CaseRow[],
        attachments: (attachmentsRes?.data || []) as any[],
        patients: (patientsRes?.data || []) as unknown as Patient[],
        doctors: (doctorsRes?.data || []) as any[],
        team: (teamRes?.data || []) as any[],
      };
    }
  });

  const staticSettings = useMemo(() => {
    if (!activeFilters.includes("settings") || query.length < 1) return [];
    const settingsItems = [
      { id: "pref", label: "Preferências", icon: Settings, to: "/configuracoes" },
      { id: "fluxo", label: "Gestão de Fluxo", icon: SlidersHorizontal, to: "/fluxo" },
      { id: "estoque", label: "Estoque", icon: Boxes, to: "/estoque" },
      { id: "agenda", label: "Agenda", icon: Calendar, to: "/agenda" },
    ];
    return settingsItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
  }, [activeFilters, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isCommandOpen) {
      setTimeout(() => commandInputRef.current?.focus(), 10);
    } else {
      setQuery("");
    }
  }, [isCommandOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFilter = (cat: SearchCategory) => {
    setActiveFilters(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const hasResults = results && (
    results.cases.length > 0 || 
    results.patients.length > 0 || 
    results.attachments.length > 0 ||
    results.doctors.length > 0 ||
    results.team.length > 0 ||
    staticSettings.length > 0
  );

  const renderResults = useCallback(() => (
    <div className="max-h-[450px] overflow-y-auto p-2 scrollbar-none">
      {isLoading ? (
        <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-xs font-light">Pesquisando...</span>
        </div>
      ) : !hasResults ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="h-16 w-16 rounded-full bg-slate-50 dark:bg-white/5 grid place-items-center text-slate-300">
            <SearchX className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">Nenhum resultado</p>
            <p className="text-sm text-slate-400 font-light max-w-[200px] mx-auto">
              Não encontramos nada para <span className="text-primary font-medium italic">"{debouncedQuery}"</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-1">
          {results.cases.length > 0 && (
            <div>
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <LayoutDashboard className="h-3 w-3" /> Casos
              </h3>
              <div className="mt-1 space-y-0.5">
                {results.cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCase(c);
                      setIsOpen(false);
                      setIsCommandOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                      {c.patient?.name || "Paciente sem nome"}
                    </div>
                    <div className="text-[11px] text-slate-400 font-light flex items-center gap-2">
                      <span>{c.case_type?.name}</span>
                      {c.case_label && <span>• {c.case_label}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.patients.length > 0 && (
            <div>
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="h-3 w-3" /> Pacientes
              </h3>
              <div className="mt-1 space-y-0.5">
                {results.patients.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      window.location.href = `/patients/${p.id}`;
                      setIsOpen(false);
                      setIsCommandOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group flex items-center gap-3"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/5 grid place-items-center text-xs font-medium text-slate-500 overflow-hidden">
                      {p.photo_url ? <img src={p.photo_url} className="h-full w-full object-cover" /> : p.name?.[0]}
                    </div>
                    <div>
                      <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-light">Paciente</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.doctors.length > 0 && (
            <div>
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <UserCircle className="h-3 w-3" /> Dentistas
              </h3>
              <div className="mt-1 space-y-0.5">
                {results.doctors.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setIsOpen(false);
                      setIsCommandOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                      {d.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-light">Profissional Solicitante</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.team.length > 0 && (
            <div>
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="h-3 w-3" /> Equipe
              </h3>
              <div className="mt-1 space-y-0.5">
                {results.team.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      window.location.href = `/equipe`;
                      setIsOpen(false);
                      setIsCommandOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                      {m.full_name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-light uppercase tracking-tighter">{m.role}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {staticSettings.length > 0 && (
            <div>
              <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Settings className="h-3 w-3" /> Configurações
              </h3>
              <div className="mt-1 space-y-0.5">
                {staticSettings.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      window.location.href = s.to;
                      setIsOpen(false);
                      setIsCommandOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group flex items-center gap-3"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/5 grid place-items-center text-slate-500">
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                      {s.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  ), [isLoading, hasResults, results, debouncedQuery, staticSettings]);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Pesquisar no DentalFlow..."
          className="pl-11 pr-24 h-11 w-full rounded-full border-slate-100 dark:border-white/10 bg-white dark:bg-white/5 focus-visible:ring-primary/20 focus-visible:bg-white dark:focus-visible:bg-slate-900 transition-all text-sm font-light shadow-sm"
        />
        
        <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 opacity-60 group-focus-within:opacity-0 transition-opacity pointer-events-none">
          {typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? (
            <Command className="h-2.5 w-2.5 text-slate-500" />
          ) : (
            <span className="text-[10px] font-medium text-slate-500">Ctrl</span>
          )}
          <span className="text-[10px] font-medium text-slate-500">K</span>
        </div>
        
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1.5 text-slate-400 hover:text-primary transition-colors rounded-full hover:bg-slate-50 dark:hover:bg-white/5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-3 rounded-2xl border-slate-100 dark:border-white/10 shadow-xl bg-white dark:bg-slate-900">
              <div className="space-y-2.5">
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Filtrar busca</div>
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const active = activeFilters.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFilter(cat.id);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all",
                        active 
                          ? "bg-primary/10 text-primary font-medium" 
                          : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-slate-400")} />
                        {cat.label}
                      </div>
                      {active && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (debouncedQuery.length >= 1 || isLoading) && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full mt-2 w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden z-[100]"
          >
            {renderResults()}
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-2xl top-[20%] translate-y-0">
          <DialogTitle className="sr-only">Pesquisa Global</DialogTitle>
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden flex flex-col">
            <div className="relative p-4 border-b border-slate-100 dark:border-white/10">
              <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                ref={commandInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="O que você está procurando?"
                className="pl-12 h-14 w-full border-none bg-transparent focus-visible:ring-0 text-lg font-light"
              />
              <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-medium text-slate-400">ESC</div>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {query.length > 0 ? (
                renderResults()
              ) : (
                <div className="p-8 text-center space-y-4">
                  <div className="h-20 w-20 rounded-3xl bg-primary/5 mx-auto grid place-items-center">
                    <Search className="h-10 w-10 text-primary opacity-20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-light text-slate-900 dark:text-slate-100">Pesquisa Inteligente</p>
                    <p className="text-sm text-slate-400 font-light max-w-xs mx-auto">Digite o nome de um paciente, caso ou configuração para encontrar rapidamente.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-w-md mx-auto pt-4">
                    {CATEGORIES.slice(0, 4).map(cat => (
                      <button 
                        key={cat.id}
                        onClick={() => toggleFilter(cat.id)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-2xl border transition-all text-left",
                          activeFilters.includes(cat.id) 
                            ? "bg-primary/5 border-primary/20 text-primary" 
                            : "bg-slate-50 dark:bg-white/5 border-transparent text-slate-500 hover:border-slate-200 dark:hover:border-white/10"
                        )}
                      >
                        <cat.icon className="h-4 w-4" />
                        <span className="text-xs font-medium">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-[10px] font-medium text-slate-400">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">↵</span>
                  <span>Selecionar</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">↑↓</span>
                  <span>Navegar</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span>DentalFlow BR</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>v2.0</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {selectedCase && (
        <CaseDetailDialog 
          caseRow={selectedCase} 
          open={!!selectedCase} 
          onOpenChange={(o) => !o && setSelectedCase(null)} 
        />
      )}
    </div>
  );
}
