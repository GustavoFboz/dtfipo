import { useState, useEffect, useRef } from "react";
import { Search, Loader2, X, Users, LayoutDashboard, FileText, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { CaseDetailDialog } from "./CaseDetailDialog";
import type { CaseRow, Patient } from "@/lib/types";
import { useDebounce } from "@/hooks/use-debounce";

interface SearchResult {
  cases: CaseRow[];
  patients: Patient[];
  attachments: { id: string; file_name: string; case_id: string; kind: string }[];
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results, isLoading } = useQuery<SearchResult>({
    queryKey: ["global-search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: async () => {
      const q = `%${debouncedQuery}%`;

      const [casesRes, patientsRes, attachmentsRes] = await Promise.all([
        supabase
          .from("cases")
          .select("*, patient:patients(name), doctor:doctors(name), case_type:case_types(name)")
          .or(`case_label.ilike.${q}`)
          .limit(5),
        supabase
          .from("patients")
          .select("*")
          .or(`name.ilike.${q},cpf.ilike.${q}`)
          .limit(5),
        supabase
          .from("case_attachments")
          .select("id, file_name, case_id, kind")
          .ilike("file_name", q)
          .limit(5)
      ]);

      return {
        cases: (casesRes.data || []) as unknown as CaseRow[],
        patients: (patientsRes.data || []) as unknown as Patient[],
        attachments: (attachmentsRes.data || []) as any[]
      };
    }
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasResults = results && (results.cases.length > 0 || results.patients.length > 0 || results.attachments.length > 0);

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
          placeholder="Buscar caso, paciente, profissional..."
          className="pl-11 pr-10 h-11 w-full rounded-full border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 focus-visible:ring-primary/20 focus-visible:bg-white dark:focus-visible:bg-slate-900 transition-all text-sm font-light"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (debouncedQuery.length >= 2 || isLoading) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full mt-2 w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 overflow-hidden z-[100]"
          >
            <div className="max-h-[400px] overflow-y-auto p-2 scrollbar-none">
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
