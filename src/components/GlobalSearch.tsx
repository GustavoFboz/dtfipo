import { PrivateImage } from "@/components/PrivateImage";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Activity,
  Boxes,
  Calendar,
  Check,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Search,
  SearchX,
  Settings,
  SlidersHorizontal,
  UserCircle,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CaseDetailDialog } from "./CaseDetailDialog";
import type { CaseRow, Doctor, Patient } from "@/lib/types";
import { useDebounce } from "@/hooks/use-debounce";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetchCaseById, fetchCases, fetchDoctors, fetchPatients } from "@/lib/api";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import {
  caseSearchLabel,
  groupActiveCasesByPatient,
  normalizeSearchText,
  rankPatientsForSearch,
  type QuickCaseSummary,
} from "@/lib/global-search";

type AdvancedCategory = "cases" | "doctors" | "team" | "settings";

type PatientSearchBundle = {
  patients: Array<Patient & { __searchExact?: boolean }>;
  activeCasesByPatient: Record<string, QuickCaseSummary[]>;
};

type AdvancedResults = {
  cases: QuickCaseSummary[];
  doctors: Array<{ id: string; name: string; crm_cro?: string | null }>;
  team: Array<{ id: string; full_name: string; role: string }>;
  settings: Array<{ id: string; label: string; to: string; icon: typeof Settings }>;
};

const ADVANCED_CATEGORIES: Array<{ id: AdvancedCategory; label: string; icon: typeof Search }> = [
  { id: "cases", label: "Casos", icon: LayoutDashboard },
  { id: "doctors", label: "Dentistas", icon: UserCircle },
  { id: "team", label: "Equipe", icon: Users },
  { id: "settings", label: "Configurações", icon: Settings },
];

const STATIC_SETTINGS: AdvancedResults["settings"] = [
  { id: "pref", label: "Preferências", icon: Settings, to: "/configuracoes" },
  { id: "fluxo", label: "Gestão de Fluxo", icon: SlidersHorizontal, to: "/fluxo" },
  { id: "estoque", label: "Estoque", icon: Boxes, to: "/estoque" },
  { id: "agenda", label: "Agenda", icon: Calendar, to: "/agenda" },
];

const PATIENT_RESULT_LIMIT = 8;

function searchCaseRows(rows: CaseRow[], query: string, limit = 6): QuickCaseSummary[] {
  const q = normalizeSearchText(query);
  return rows
    .filter((row) => {
      const haystack = normalizeSearchText([
        row.case_number,
        row.case_label,
        row.patient?.name,
        row.doctor?.name,
        row.case_type?.name,
      ].filter(Boolean).join(" "));
      return haystack.includes(q);
    })
    .slice(0, limit)
    .map((row) => row as QuickCaseSummary);
}

function searchDoctorsLocal(rows: Doctor[], query: string, limit = 6) {
  const q = normalizeSearchText(query);
  return rows
    .filter((doctor) => normalizeSearchText(doctor.name).includes(q))
    .slice(0, limit)
    .map((doctor) => ({ id: doctor.id, name: doctor.name, crm_cro: null }));
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 160);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedCategory[]>(["cases"]);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [openingCaseId, setOpeningCaseId] = useState<string | null>(null);
  const [photoPatient, setPhotoPatient] = useState<Patient | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = normalizeSearchText(debouncedQuery);

  useEffect(() => {
    const open = () => setIsCommandOpen(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsCommandOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("dentalflow:open-global-search", open);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("dentalflow:open-global-search", open);
    };
  }, []);

  useEffect(() => {
    if (isCommandOpen) {
      window.setTimeout(() => commandInputRef.current?.focus(), 20);
      return;
    }
    setQuery("");
    setAdvanced(false);
    setActiveIndex(0);
  }, [isCommandOpen]);

  const patientSearch = useQuery<PatientSearchBundle>({
    queryKey: ["global-patient-search", normalizedQuery],
    enabled: normalizedQuery.length >= 1,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      let patients: Array<Patient & { __searchExact?: boolean }>;

      const cachedPatients = queryClient.getQueryData<Patient[]>(["patients"]);
      if (Array.isArray(cachedPatients) && cachedPatients.length) {
        patients = rankPatientsForSearch(cachedPatients, normalizedQuery, PATIENT_RESULT_LIMIT);
      } else if (isDentalFlowDesktop()) {
        patients = rankPatientsForSearch(await fetchPatients(), normalizedQuery, PATIENT_RESULT_LIMIT);
      } else {
        const { data, error } = await supabase
          .from("patients")
          .select("id,name,photo_url,phone,email,cpf,created_at")
          .ilike("name", `%${debouncedQuery.trim()}%`)
          .limit(16);
        if (error) throw error;
        patients = rankPatientsForSearch((data ?? []) as unknown as Patient[], normalizedQuery, PATIENT_RESULT_LIMIT);
      }

      const patientIds = patients.map((patient) => patient.id);
      if (!patientIds.length) return { patients, activeCasesByPatient: {} };

      let activeCases: QuickCaseSummary[] = [];
      const cachedActive = queryClient.getQueryData<CaseRow[]>(["cases", "active"]);
      if (Array.isArray(cachedActive) && cachedActive.length) {
        activeCases = cachedActive
          .filter((row) => patientIds.includes(row.patient_id))
          .map((row) => row as QuickCaseSummary);
      } else if (isDentalFlowDesktop()) {
        const rows = await fetchCases("active");
        activeCases = rows
          .filter((row) => patientIds.includes(row.patient_id))
          .map((row) => row as QuickCaseSummary);
      } else {
        const { data, error } = await supabase
          .from("cases")
          .select("id,patient_id,case_number,case_label,status,entry_date,delivery_date,case_type:case_types!cases_case_type_id_fkey(name),current_stage:stages!cases_current_stage_id_fkey(name,color,position)")
          .in("patient_id", patientIds)
          .in("status", ["em_andamento", "active"])
          .order("entry_date", { ascending: false })
          .limit(40);
        if (error) throw error;
        activeCases = (data ?? []) as unknown as QuickCaseSummary[];
      }

      return {
        patients,
        activeCasesByPatient: groupActiveCasesByPatient(activeCases, patientIds),
      };
    },
  });

  const advancedSearch = useQuery<AdvancedResults>({
    queryKey: ["global-advanced-search", normalizedQuery, [...advancedFilters].sort()],
    enabled: advanced && normalizedQuery.length >= 1 && advancedFilters.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const output: AdvancedResults = { cases: [], doctors: [], team: [], settings: [] };
      const qContains = `%${debouncedQuery.trim().replace(/,/g, " ")}%`;

      await Promise.all([
        (async () => {
          if (!advancedFilters.includes("cases")) return;
          const cachedAll = queryClient.getQueryData<CaseRow[]>(["cases", "all"]);
          if (Array.isArray(cachedAll) && cachedAll.length) {
            output.cases = searchCaseRows(cachedAll, normalizedQuery);
            return;
          }
          if (isDentalFlowDesktop()) {
            output.cases = searchCaseRows(await fetchCases("all"), normalizedQuery);
            return;
          }
          const { data, error } = await supabase
            .from("cases")
            .select("id,patient_id,case_number,case_label,status,entry_date,delivery_date,patient:patients(name),case_type:case_types!cases_case_type_id_fkey(name),current_stage:stages!cases_current_stage_id_fkey(name,color,position)")
            .or(`case_label.ilike.${qContains},patient_name_denorm.ilike.${qContains},doctor_name_denorm.ilike.${qContains}`)
            .order("updated_at", { ascending: false })
            .limit(6);
          if (error) { console.warn("[DentalFlow Search] Busca avançada de casos indisponível", error); return; }
          output.cases = (data ?? []) as unknown as QuickCaseSummary[];
        })(),
        (async () => {
          if (!advancedFilters.includes("doctors")) return;
          const cachedDoctors = queryClient.getQueryData<Doctor[]>(["doctors"]);
          if (Array.isArray(cachedDoctors) && cachedDoctors.length) {
            output.doctors = searchDoctorsLocal(cachedDoctors, normalizedQuery);
            return;
          }
          if (isDentalFlowDesktop()) {
            output.doctors = searchDoctorsLocal(await fetchDoctors(), normalizedQuery);
            return;
          }
          const { data, error } = await supabase
            .from("doctors")
            .select("id,name,crm_cro")
            .ilike("name", qContains)
            .limit(6);
          if (error) { console.warn("[DentalFlow Search] Busca avançada de dentistas indisponível", error); return; }
          output.doctors = (data ?? []) as AdvancedResults["doctors"];
        })(),
        (async () => {
          if (!advancedFilters.includes("team")) return;
          if (typeof navigator !== "undefined" && navigator.onLine === false) return;
          const { data, error } = await supabase
            .from("profiles")
            .select("id,full_name,role")
            .ilike("full_name", qContains)
            .limit(6);
          if (error) { console.warn("[DentalFlow Search] Busca avançada de equipe indisponível", error); return; }
          output.team = (data ?? []) as AdvancedResults["team"];
        })(),
      ]);

      if (advancedFilters.includes("settings")) {
        output.settings = STATIC_SETTINGS.filter((item) =>
          normalizeSearchText(item.label).includes(normalizedQuery)
        );
      }

      return output;
    },
  });

  const patients = patientSearch.data?.patients ?? [];
  const activeCasesByPatient = patientSearch.data?.activeCasesByPatient ?? {};
  const advancedResults = advancedSearch.data ?? { cases: [], doctors: [], team: [], settings: [] };

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery, patients.length]);

  const loading = patientSearch.isFetching || (advanced && advancedSearch.isFetching);
  const hasAdvancedResults =
    advancedResults.cases.length > 0 ||
    advancedResults.doctors.length > 0 ||
    advancedResults.team.length > 0 ||
    advancedResults.settings.length > 0;
  const hasResults = patients.length > 0 || hasAdvancedResults;

  function toggleAdvancedFilter(category: AdvancedCategory) {
    setAdvancedFilters((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  }

  function openPatient(patient: Patient) {
    setIsCommandOpen(false);
    void navigate({ to: "/patients/$id", params: { id: patient.id } } as any);
  }

  async function openCase(caseId: string) {
    if (openingCaseId) return;
    setOpeningCaseId(caseId);
    try {
      const row = await queryClient.fetchQuery({
        queryKey: ["case", caseId],
        queryFn: () => fetchCaseById(caseId),
        staleTime: 15_000,
      });
      if (!row) throw new Error("Caso não encontrado ou sem permissão.");
      setSelectedCase(row);
      setIsCommandOpen(false);
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível abrir o caso.");
    } finally {
      setOpeningCaseId(null);
    }
  }

  function handleCommandKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!patients.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % patients.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + patients.length) % patients.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const patient = patients[activeIndex];
      if (patient) openPatient(patient);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsCommandOpen(true)}
        aria-label="Buscar paciente"
        title="Buscar paciente · Ctrl K"
        className="group h-9 w-9 grid place-items-center rounded-full text-slate-300 hover:text-primary hover:bg-white dark:hover:bg-white/5 transition-all active:scale-95"
      >
        <Search className="h-[17px] w-[17px] stroke-[1.45px] transition-transform group-hover:scale-105" />
      </button>

      <Dialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-2xl top-[12%] translate-y-0">
          <DialogTitle className="sr-only">Busca rápida por paciente</DialogTitle>
          <div className="overflow-hidden rounded-[26px] border border-slate-200/70 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl shadow-[0_30px_90px_-28px_rgba(15,23,42,.38)]">
            <div className="relative border-b border-slate-100 dark:border-white/10 px-5 py-4">
              <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                ref={commandInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleCommandKeyDown}
                placeholder="Digite o nome do paciente…"
                autoComplete="off"
                className="h-14 w-full border-none bg-transparent pl-12 pr-16 text-lg font-light tracking-tight focus-visible:ring-0"
              />
              <div className="absolute right-7 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2 py-1 text-[9px] font-medium text-slate-400">
                ESC
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-white/10 px-5 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Busca principal</div>
                <div className="mt-0.5 text-xs font-light text-slate-500">Pacientes primeiro, com correspondência exata priorizada.</div>
              </div>
              <button
                type="button"
                onClick={() => setAdvanced((current) => !current)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all",
                  advanced
                    ? "border-primary/25 bg-primary/8 text-primary"
                    : "border-slate-200 dark:border-white/10 text-slate-400 hover:text-primary"
                )}
              >
                Busca avançada
              </button>
            </div>

            {advanced && (
              <div className="flex flex-wrap gap-2 border-b border-slate-100 dark:border-white/10 px-5 py-3">
                {ADVANCED_CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const active = advancedFilters.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleAdvancedFilter(category.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-all",
                        active
                          ? "border-primary/20 bg-primary/8 text-primary"
                          : "border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {category.label}
                      {active && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="max-h-[62vh] overflow-y-auto p-2 scrollbar-none">
              {!query.trim() ? (
                <div className="px-8 py-14 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-primary/[0.05]">
                    <Search className="h-7 w-7 text-primary/35" />
                  </div>
                  <p className="mt-5 text-base font-light text-slate-800 dark:text-slate-100">Encontre um paciente em segundos</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm font-light leading-relaxed text-slate-400">
                    Comece digitando o nome. A busca ocorre enquanto você escreve, sem carregar telas ou módulos inteiros.
                  </p>
                </div>
              ) : loading && !hasResults ? (
                <div className="flex items-center justify-center gap-2 px-8 py-14 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-light">Localizando…</span>
                </div>
              ) : patientSearch.isError && !hasResults ? (
                <div className="px-8 py-14 text-center">
                  <SearchX className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">Busca temporariamente indisponível</p>
                  <p className="mt-1 text-xs font-light text-slate-400">Verifique a conexão e tente novamente em instantes.</p>
                </div>
              ) : !hasResults ? (
                <div className="px-8 py-14 text-center">
                  <SearchX className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">Nenhum resultado</p>
                  <p className="mt-1 text-xs font-light text-slate-400">Tente outra parte do nome ou ative a busca avançada.</p>
                </div>
              ) : (
                <div className="space-y-5 p-1">
                  {patients.length > 0 && (
                    <section>
                      <div className="flex items-center justify-between px-3 pb-1 pt-1">
                        <h3 className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Pacientes</h3>
                        {patientSearch.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />}
                      </div>
                      <div className="space-y-1">
                        {patients.map((patient, index) => {
                          const patientCases = activeCasesByPatient[patient.id] ?? [];
                          return (
                            <PatientResultRow
                              key={patient.id}
                              patient={patient}
                              cases={patientCases}
                              active={index === activeIndex}
                              openingCaseId={openingCaseId}
                              onHover={() => setActiveIndex(index)}
                              onPhoto={() => patient.photo_url && setPhotoPatient(patient)}
                              onProfile={() => openPatient(patient)}
                              onCase={(caseId) => void openCase(caseId)}
                            />
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {advanced && advancedResults.cases.length > 0 && (
                    <section>
                      <h3 className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Casos</h3>
                      <div className="space-y-1">
                        {advancedResults.cases.map((caseRow) => (
                          <button
                            key={caseRow.id}
                            type="button"
                            onClick={() => void openCase(caseRow.id)}
                            className="group flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-slate-800 dark:text-slate-100">{caseSearchLabel(caseRow)}</div>
                              <div className="mt-0.5 text-[11px] font-light text-slate-400">{caseRow.current_stage?.name || "Caso"}</div>
                            </div>
                            {openingCaseId === caseRow.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary" />}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {advanced && advancedResults.doctors.length > 0 && (
                    <section>
                      <h3 className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Dentistas</h3>
                      <div className="space-y-1">
                        {advancedResults.doctors.map((doctor) => (
                          <div key={doctor.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400"><UserCircle className="h-4 w-4" /></div>
                            <div>
                              <div className="text-sm text-slate-800 dark:text-slate-100">{doctor.name}</div>
                              <div className="text-[11px] font-light text-slate-400">{doctor.crm_cro || "Dentista"}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {advanced && advancedResults.team.length > 0 && (
                    <section>
                      <h3 className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Equipe</h3>
                      <div className="space-y-1">
                        {advancedResults.team.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => { setIsCommandOpen(false); void navigate({ to: "/equipe" } as any); }}
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                          >
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400"><Users className="h-4 w-4" /></div>
                            <div>
                              <div className="text-sm text-slate-800 dark:text-slate-100">{member.full_name}</div>
                              <div className="text-[10px] uppercase tracking-wider text-slate-400">{member.role}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {advanced && advancedResults.settings.length > 0 && (
                    <section>
                      <h3 className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Configurações</h3>
                      <div className="space-y-1">
                        {advancedResults.settings.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => { setIsCommandOpen(false); void navigate({ to: item.to as any } as any); }}
                              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                            >
                              <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400"><Icon className="h-4 w-4" /></div>
                              <div className="text-sm text-slate-800 dark:text-slate-100">{item.label}</div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.025] px-5 py-3 text-[10px] text-slate-400">
              <div className="flex items-center gap-4">
                <span><kbd className="mr-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-1.5 py-0.5">↑↓</kbd> navegar</span>
                <span><kbd className="mr-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-1.5 py-0.5">↵</kbd> perfil</span>
              </div>
              <span>Ctrl K · pacientes</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!photoPatient} onOpenChange={(open) => !open && setPhotoPatient(null)}>
        <DialogContent className="max-w-lg border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Foto do paciente</DialogTitle>
          {photoPatient?.photo_url && (
            <div className="overflow-hidden rounded-[28px] border border-white/30 bg-white/90 p-2 shadow-2xl backdrop-blur-xl dark:bg-slate-950/90">
              <PrivateImage
                src={photoPatient.photo_url}
                alt={photoPatient.name}
                className="max-h-[74vh] w-full rounded-[22px] object-contain bg-slate-50 dark:bg-slate-900"
              />
              <div className="px-3 pb-2 pt-3 text-center text-sm font-medium text-slate-700 dark:text-slate-200">{photoPatient.name}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedCase && (
        <CaseDetailDialog
          caseRow={selectedCase}
          open={!!selectedCase}
          onOpenChange={(open) => !open && setSelectedCase(null)}
        />
      )}
    </>
  );
}

function PatientResultRow({
  patient,
  cases,
  active,
  openingCaseId,
  onHover,
  onPhoto,
  onProfile,
  onCase,
}: {
  patient: Patient & { __searchExact?: boolean };
  cases: QuickCaseSummary[];
  active: boolean;
  openingCaseId: string | null;
  onHover: () => void;
  onPhoto: () => void;
  onProfile: () => void;
  onCase: (caseId: string) => void;
}) {
  return (
    <div
      onMouseEnter={onHover}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-3 py-3 transition-all",
        active
          ? "border-primary/15 bg-primary/[0.035]"
          : "border-transparent hover:bg-slate-50 dark:hover:bg-white/[0.035]"
      )}
    >
      <button
        type="button"
        onClick={onPhoto}
        disabled={!patient.photo_url}
        aria-label={patient.photo_url ? `Ampliar foto de ${patient.name}` : `Paciente ${patient.name} sem foto`}
        className={cn(
          "h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-100 dark:border-white/10 bg-slate-100 dark:bg-white/5 grid place-items-center text-sm font-medium text-slate-400",
          patient.photo_url && "cursor-zoom-in hover:ring-2 hover:ring-primary/15"
        )}
      >
        {patient.photo_url ? (
          <PrivateImage src={patient.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{patient.name?.[0]?.toUpperCase() || "?"}</span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onProfile}
            className="truncate text-left text-sm font-medium text-slate-850 dark:text-slate-100 hover:text-primary"
          >
            {patient.name}
          </button>
          {patient.__searchExact && (
            <span className="shrink-0 rounded-full bg-primary/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">Exato</span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-light text-slate-400">
          <span>Paciente</span>
          {patient.phone && <><span>•</span><span className="truncate">{patient.phone}</span></>}
          {patient.email && <><span>•</span><span className="max-w-[180px] truncate">{patient.email}</span></>}
        </div>
        {cases.length > 0 && (
          <div className="mt-1.5">
            <CasesAction
              cases={cases}
              openingCaseId={openingCaseId}
              onCase={onCase}
              variant="inline"
            />
          </div>
        )}
      </div>

      <CasesAction
        cases={cases}
        openingCaseId={openingCaseId}
        onCase={onCase}
        variant="button"
      />
    </div>
  );
}

function CasesAction({
  cases,
  openingCaseId,
  onCase,
  variant,
}: {
  cases: QuickCaseSummary[];
  openingCaseId: string | null;
  onCase: (caseId: string) => void;
  variant: "inline" | "button";
}) {
  const label = variant === "inline"
    ? `${cases.length} ${cases.length === 1 ? "caso em andamento" : "casos em andamento"}`
    : `Casos ${cases.length}`;

  const classes = variant === "inline"
    ? "inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80"
    : "shrink-0 inline-flex min-w-[74px] items-center justify-center gap-1 rounded-full border border-slate-200 dark:border-white/10 px-3 py-2 text-[11px] font-medium text-slate-500 hover:border-primary/20 hover:text-primary disabled:cursor-default disabled:opacity-45";

  if (cases.length === 0) {
    return <button type="button" disabled className={classes}>{label}</button>;
  }

  if (cases.length === 1) {
    const loading = openingCaseId === cases[0].id;
    return (
      <button type="button" onClick={() => onCase(cases[0].id)} className={classes}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : variant === "inline" ? <Activity className="h-3 w-3" /> : null}
        {label}
        {!loading && variant === "button" && <ChevronRight className="h-3 w-3" />}
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={classes}>
          {variant === "inline" && <Activity className="h-3 w-3" />}
          {label}
          {variant === "button" && <ChevronRight className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 rounded-2xl border-slate-200/70 dark:border-white/10 p-2 shadow-2xl">
        <div className="px-2 pb-2 pt-1">
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Casos em andamento</div>
          <div className="mt-0.5 text-xs font-light text-slate-500">Selecione o caso que deseja abrir.</div>
        </div>
        <div className="space-y-1">
          {cases.map((caseRow) => (
            <button
              key={caseRow.id}
              type="button"
              onClick={() => onCase(caseRow.id)}
              className="group flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{caseSearchLabel(caseRow)}</div>
                <div className="mt-0.5 text-[10px] font-light text-slate-400">
                  {caseRow.current_stage?.name || "Em andamento"}{caseRow.delivery_date ? ` · entrega ${caseRow.delivery_date}` : ""}
                </div>
              </div>
              {openingCaseId === caseRow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
