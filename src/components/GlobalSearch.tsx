import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Loader2, X, Users, LayoutDashboard, FileText, ImageIcon, Settings, SlidersHorizontal, Check, UserCircle, Calendar, Boxes } from "lucide-react";
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
  const debouncedQuery = useDebounce(query, 300);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    enabled: debouncedQuery.length >= 2,
    queryFn: async () => {
      const q = `%${debouncedQuery}%`;
      const promises: Promise<any>[] = [];

      if (activeFilters.includes("cases")) {
        promises.push(
          supabase
            .from("cases")
            .select("*, patient:patients(name), doctor:doctors(name), case_type:case_types(name)")
            .or(`case_label.ilike.${q}`)
            .limit(5)
            .then(r => r)
        );
        promises.push(
          supabase
            .from("case_attachments")
            .select("id, file_name, case_id, kind")
            .ilike("file_name", q)
            .limit(5)
            .then(r => r)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
        promises.push(Promise.resolve({ data: [] }));
      }

      if (activeFilters.includes("patients")) {
        promises.push(
          supabase
            .from("patients")
            .select("*")
            .or(`name.ilike.${q},cpf.ilike.${q}`)
            .limit(5)
            .then(r => r)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (activeFilters.includes("doctors")) {
        promises.push(
          supabase
            .from("doctors")
            .select("*")
            .ilike("name", q)
            .limit(5)
            .then(r => r)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (activeFilters.includes("team")) {
        promises.push(
          supabase
            .from("profiles")
            .select("id, full_name, role")
            .ilike("full_name", q)
            .limit(5)
            .then(r => r)
        );
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const [casesRes, attachmentsRes, patientsRes, doctorsRes, teamRes] = await Promise.all(promises);

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
    if (!activeFilters.includes("settings") || query.length < 2) return [];
    const settingsItems = [
      { id: "pref", label: "Preferências", icon: Settings, to: "/configuracoes" },
      { id: "fluxo", label: "Gestão de Fluxo", icon: SlidersHorizontal, to: "/fluxo" },
      { id: "estoque", label: "Estoque", icon: Boxes, to: "/estoque" },
      { id: "agenda", label: "Agenda", icon: Calendar, to: "/agenda" },
    ];
    return settingsItems.filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
  }, [activeFilters, query]);

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

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Pesquisar no DentalFlow..."
          className="pl-11 pr-12 h-11 w-full rounded-full border-slate-100 dark:border-white/10 bg-white dark:bg-white/5 focus-visible:ring-primary/20 focus-visible:bg-white dark:focus-visible:bg-slate-900 transition-all text-sm font-light shadow-sm"
        />
        
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
        {isOpen && (debouncedQuery.length >= 2 || isLoading) && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full mt-2 w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden z-[100]"
          >
            <div className="max-h-[450px] overflow-y-auto p-2 scrollbar-none">
              {isLoading ? (
                <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs font-light">Pesquisando...</span>
                </div>
              ) : !hasResults ? (
                <div className="p-8 text-center text-slate-400">
                  <span className="text-sm font-light">Nenhum resultado encontrado.</span>
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
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                          >
                            <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                              {c.patient?.name}
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
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group flex items-center gap-3"
                          >
                            <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/5 grid place-items-center text-xs font-medium text-slate-500 overflow-hidden">
                              {p.photo_url ? <img src={p.photo_url} className="h-full w-full object-cover" /> : p.name[0]}
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
                            onClick={() => setIsOpen(false)}
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
                        {staticSettings.map((s) => {
                          const Icon = s.icon;
                          return (
                            <button
                              key={s.id}
                              onClick={() => {
                                window.location.href = s.to;
                                setIsOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group flex items-center gap-3"
                            >
                              <div className="h-8 w-8 rounded-lg bg-primary/5 grid place-items-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                                {s.label}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {results.attachments.length > 0 && (
                    <div>
                      <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <FileText className="h-3 w-3" /> Anexos
                      </h3>
                      <div className="mt-1 space-y-0.5">
                        {results.attachments.map((a) => (
                          <button
                            key={a.id}
                            onClick={async () => {
                              const { data } = await supabase.from("cases").select("*, patient:patients(name), doctor:doctors(name), case_type:case_types(name)").eq("id", a.case_id).single();
                              if (data) {
                                setSelectedCase(data as any);
                                // Trigger deep link to tab after a short delay
                                setTimeout(() => {
                                  const focus = a.kind === "gallery" ? "gallery" : a.kind === "scans" ? "scans" : a.kind === "model" ? "modelos" : "detalhes";
                                  window.location.hash = `case=${a.case_id}&focus=${focus}`;
                                  window.dispatchEvent(new Event('hashchange'));
                                }, 100);
                              }
                              setIsOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group flex items-center gap-3"
                          >
                            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/5 grid place-items-center text-slate-400">
                              {a.kind === "gallery" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                                {a.file_name}
                              </div>
                              <div className="text-[11px] text-slate-400 font-light uppercase tracking-tighter">{a.kind}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CaseDetailDialog
        caseRow={selectedCase}
        open={!!selectedCase}
        onOpenChange={(o) => !o && setSelectedCase(null)}
      />
    </div>
  );
}
