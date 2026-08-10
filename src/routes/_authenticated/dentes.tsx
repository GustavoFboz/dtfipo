import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCadistas, fetchDoctors } from "@/lib/api";
import type { CaseRow } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, ChevronRight, SlidersHorizontal, Download, X, Check, CalendarDays, ChevronDown } from "lucide-react";
import { cn, normalizeText } from "@/lib/utils";
import { ToothCaseDialog } from "@/components/teeth/ToothCaseDialog";

import { TOOTH_WORK_TYPES, ENCERAMENTO_ID, splitToothTypes } from "@/lib/case-types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountUp } from "@/components/CountUp";

export const Route = createFileRoute("/_authenticated/dentes")({
  component: TeethDashboard,
});

const CASE_SELECT = `
  id, case_number, case_label, status, entry_date, delivery_date, finished_at,
  teeth_numbers, teeth_zirconia, teeth_dissilicato, implant_teeth,
  notes, reopened_count, tooth_case_types, tooth_ti_bases, tooth_implant_systems,
  patient:patients(*),
  doctor:doctors(*),
  cadista:cadistas(*),
  case_type:case_types!cases_case_type_id_fkey(*),
  tooth_color:tooth_colors(*),
  current_stage:stages!cases_current_stage_id_fkey(*),
  case_components(id, qty, notes, component:components(*))
`;

type StatusFilter = "all" | "active" | "finished" | "cancelled" | "reopened";
type MaterialFilter = "all" | "zirconia" | "dissilicato";
type ProfKind = "doctor" | "cadista";
type ProfSel = { kind: ProfKind; id: string; name: string };

const PROF_TAG: Record<ProfKind, { label: string; cls: string }> = {
  doctor:  { label: "Dr.", cls: "bg-[#0C84FA]/10 text-[#0C84FA]" },
  cadista: { label: "CAD", cls: "bg-slate-900/5 text-slate-700" },
};

function TeethDashboard() {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const [search, setSearch] = useState("");

  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [materialF, setMaterialF] = useState<MaterialFilter>("all");
  const [professionals, setProfessionals] = useState<ProfSel[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [priceMode, setPriceMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("dentes:priceMode") === "1";
  });
  const [rate, setRate] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("dentes:rate") ?? 0);
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profPickerOpen, setProfPickerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("dentes:priceMode", priceMode ? "1" : "0");
  }, [priceMode]);
  useEffect(() => {
    localStorage.setItem("dentes:rate", String(rate));
  }, [rate]);

  const doctorsQ = useQuery({ queryKey: ["doctors"], queryFn: fetchDoctors });
  const cadistasQ = useQuery({ queryKey: ["cadistas"], queryFn: fetchCadistas });

  const casesQ = useQuery({
    queryKey: ["dentes_cases", statusF, from, to, professionals.map((p) => `${p.kind}:${p.id}`).join(",")],
    queryFn: async () => {
      let q = supabase.from("cases").select(CASE_SELECT);
      if (statusF === "active") q = q.eq("status", "active");
      else if (statusF === "finished") q = q.eq("status", "finished");
      else if (statusF === "cancelled") q = q.in("status", ["cancelled", "canceled"]);
      else if (statusF === "reopened") q = q.gt("reopened_count", 0);
      if (from) q = q.gte("entry_date", from);
      if (to) q = q.lte("entry_date", to);
      const docIds = professionals.filter((p) => p.kind === "doctor").map((p) => p.id);
      const cadIds = professionals.filter((p) => p.kind === "cadista").map((p) => p.id);
      if (docIds.length) q = q.in("doctor_id", docIds);
      if (cadIds.length) q = q.in("cadista_id", cadIds);
      const { data, error } = await q.order("entry_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as CaseRow[];
    },
  });

  const cases = casesQ.data ?? [];

  const activeFilterCount =
    (statusF !== "all" ? 1 : 0) +
    (materialF !== "all" ? 1 : 0) +
    (professionals.length > 0 ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return cases.filter((c) => {
      if (materialF === "zirconia" && !(c.teeth_zirconia?.length)) return false;
      if (materialF === "dissilicato" && !(c.teeth_dissilicato?.length)) return false;
      
      if (!q) return true;
      const hay = normalizeText([
        c.patient?.name, c.doctor?.name, c.cadista?.name,
        c.case_type?.name, c.case_number, c.case_label,
      ].filter(Boolean).join(" "));
      return hay.includes(q);
    });
  }, [cases, search, materialF]);

  const totals = useMemo(() => {
    let teeth = 0, zir = 0, dis = 0, imp = 0;
    let active = 0, finished = 0, cancelled = 0;
    let enceramento = 0;
    const byType: Record<string, number> = {};
    for (const t of TOOTH_WORK_TYPES) byType[t.id] = 0;
    for (const c of filtered) {
      teeth += c.teeth_numbers?.length ?? 0;
      zir += c.teeth_zirconia?.length ?? 0;
      dis += c.teeth_dissilicato?.length ?? 0;
      imp += c.implant_teeth?.length ?? 0;
      if (c.status === "active") active += 1;
      else if (c.status === "finished") finished += 1;
      else if (c.status === "cancelled" || c.status === "canceled") cancelled += 1;
      const tct = (c.tooth_case_types ?? {}) as Record<string, string[]>;
      for (const arr of Object.values(tct)) {
        const s = splitToothTypes(arr);
        if (s.primary && byType[s.primary] != null) byType[s.primary] += 1;
        if (s.hasEnceramento) enceramento += 1;
      }
    }
    return { teeth, zir, dis, imp, active, finished, cancelled, enceramento, byType };
  }, [filtered]);

  const goBackToLab = () => {
    if (exiting) return;
    setExiting(true);
    try { sessionStorage.setItem("dentalflow:lab-enter", "1"); } catch {}
    window.setTimeout(() => {
      navigate({ to: "/casos" });
    }, 320);
  };

  return (
    <div className={cn("h-full max-h-full flex flex-col overflow-hidden font-light w-full", exiting ? "animate-dentes-exit" : "animate-dentes-enter")}>
     <div className="max-w-[1600px] mx-auto w-full px-6 md:px-16 flex flex-col flex-1 min-h-0 overflow-hidden">
      <header className="pt-10 md:pt-14 pb-8 space-y-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBackToLab}
            aria-label="Voltar para o Laboratório"
            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 transition-colors bg-white/60 backdrop-blur-sm"
          >
            <ArrowLeft className="h-4 w-4 stroke-[1.5px]" />
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
            Controle de dentes
          </div>
        </div>



        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6">
          <h1 className="min-w-0 text-4xl md:text-7xl font-extralight text-slate-900 tracking-[-0.03em] leading-[1] flex items-baseline gap-4 flex-wrap">
            <span>Contador de</span>
            <span className="text-primary">Dentes</span>
            <ChevronRight className="h-8 w-8 md:h-10 md:w-10 text-slate-300 stroke-[1.2px] self-center shrink-0" />
          </h1>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
              Total no filtro
            </div>
            <div className="text-5xl md:text-6xl font-extralight tabular-nums text-primary">
              {priceMode
                ? <CountUp value={totals.teeth * rate} format={brl} />
                : <CountUp value={totals.teeth} />}
            </div>
            {priceMode && (
              <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                <CountUp value={totals.teeth} /> dentes × {brl(rate)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <section className="flex flex-wrap items-center gap-2 pb-6">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar caso, paciente, doutor…"
            className="pl-10 h-11 rounded-full border-slate-200 focus-visible:ring-1 focus-visible:ring-[#0C84FA] focus-visible:ring-offset-0"
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "relative inline-flex items-center gap-2 h-11 px-4 rounded-full border text-[12px] transition-colors",
                activeFilterCount > 0
                  ? "border-[#0C84FA]/30 bg-[#0C84FA]/5 text-[#0C84FA]"
                  : "border-slate-200 bg-white text-slate-600 hover:text-slate-900",
              )}
              aria-label="Filtros"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 stroke-[1.5px]" />
              <span className="font-light">Filtros</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 inline-grid place-items-center h-5 min-w-5 px-1.5 rounded-full bg-[#0C84FA] text-white text-[10px] tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[420px] p-0 rounded-3xl border-slate-100 dark:border-[#2B292B] shadow-xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-50 dark:border-[#2B292B]">

              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-medium">Filtros</div>
              <button
                onClick={() => {
                  setStatusF("all"); setMaterialF("all"); setProfessionals([]);
                  setFrom(""); setTo("");
                }}
                className="text-[11px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> limpar
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {/* Situação */}
              <FilterBlock label="Situação">
                <Select value={statusF} onValueChange={(v) => setStatusF(v as StatusFilter)}>
                  <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-0 px-4 text-[12px] font-light text-slate-700 hover:bg-slate-100/70 focus:ring-0 focus:ring-offset-0 shadow-none">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Em andamento</SelectItem>
                    <SelectItem value="finished">Finalizados</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                    <SelectItem value="reopened">Reabertos</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBlock>

              {/* Tipo de material */}
              <FilterBlock label="Tipo de material">
                <Select value={materialF} onValueChange={(v) => setMaterialF(v as MaterialFilter)}>
                  <SelectTrigger className="h-11 rounded-2xl bg-slate-50 border-0 px-4 text-[12px] font-light text-slate-700 hover:bg-slate-100/70 focus:ring-0 focus:ring-offset-0 shadow-none">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="zirconia">Zircônia</SelectItem>
                    <SelectItem value="dissilicato">Dissilicato</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBlock>

              {/* Profissional multi-select */}
              <FilterBlock label="Profissional">
                <ProfessionalPicker
                  open={profPickerOpen}
                  onOpenChange={setProfPickerOpen}
                  selected={professionals}
                  onChange={setProfessionals}
                  doctors={(doctorsQ.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
                  cadistas={(cadistasQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
                />
              </FilterBlock>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <FilterBlock label="De">
                  <CalendarField value={from} onChange={setFrom} placeholder="Data inicial" />
                </FilterBlock>
                <FilterBlock label="Até">
                  <CalendarField value={to} onChange={setTo} placeholder="Data final" />
                </FilterBlock>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-50 dark:border-[#2B292B] bg-slate-50/40 dark:bg-white/[0.02] rounded-b-3xl space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] text-slate-800 font-normal">Valor por dente</div>
                  <div className="text-[11px] text-slate-400 font-light">Calcula valor por caso e total</div>
                </div>
                <Switch checked={priceMode} onCheckedChange={setPriceMode} />
              </div>
              {priceMode && (
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={rate || ""}
                    onChange={(e) => setRate(Number(e.target.value) || 0)}
                    placeholder="0,00"
                    className="pl-10 h-11 rounded-full border-slate-200 focus-visible:ring-1 focus-visible:ring-[#0C84FA] focus-visible:ring-offset-0 text-right font-light"
                  />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          onClick={() => downloadReport(filtered, { priceMode, rate })}
          className="h-11 rounded-full border-slate-200 text-slate-600 hover:text-slate-900 font-light gap-2"
        >
          <Download className="h-3.5 w-3.5 stroke-[1.5px]" />
          Relatório
        </Button>

        {professionals.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap basis-full mt-1">
            {professionals.map((p) => (
              <span
                key={`${p.kind}:${p.id}`}
                className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-full bg-white border border-slate-100 shadow-sm text-[12px] text-slate-700"
              >
                <span className={cn("inline-grid place-items-center h-5 px-1.5 rounded-full text-[9px] font-semibold tracking-wide", PROF_TAG[p.kind].cls)}>
                  {PROF_TAG[p.kind].label}
                </span>
                <span className="font-light">{p.name}</span>
                <button
                  onClick={() => setProfessionals(professionals.filter((x) => !(x.kind === p.kind && x.id === p.id)))}
                  className="ml-0.5 text-slate-300 hover:text-slate-600"
                  aria-label={`Remover ${p.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 pb-6 shrink-0">
        <Kpi label="Casos" value={filtered.length} />
        <Kpi label="Em andamento" value={totals.active} />
        <Kpi label="Finalizados" value={totals.finished} />
        <Kpi label="Cancelados" value={totals.cancelled} />
        <Kpi label="Zircônia" value={totals.zir} tint="#0C84FA" />
        <Kpi label="Dissilicato" value={totals.dis} tint="#FF8300" />
        <Kpi label="Implante" value={totals.imp} tint="#111827" />
      </section>

      {/* Breakdown por tipo de trabalho */}
      <section className="pb-6 shrink-0">
        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 mb-3">
          Por tipo de trabalho
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {TOOTH_WORK_TYPES.map((t) => (
            <Kpi key={t.id} label={t.name} value={totals.byType[t.id] ?? 0} />
          ))}
          <Kpi label="Enceramento" value={totals.enceramento} tint="#0C84FA" />
        </div>
      </section>

      {/* Table — única área com scroll */}
      <section className="rounded-3xl border border-slate-100 bg-white dark:bg-transparent dark:border-white/5 flex flex-col flex-1 min-h-0 overflow-hidden mb-6">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={{ scrollbarGutter: "stable" }}>
        <div className={cn(
          "sticky top-0 z-10 bg-white dark:bg-background grid items-center gap-3 px-6 py-3 text-[10px] uppercase tracking-[0.08em] text-slate-400 border-b border-slate-100 dark:border-white/5",

          priceMode
            ? "grid-cols-[minmax(0,1fr)_72px_110px_170px_170px_110px_110px]"
            : "grid-cols-[minmax(0,1fr)_72px_170px_170px_110px_110px]",
        )}>
          <div>Caso</div>
          <div className="text-right">Dentes</div>
          {priceMode && <div className="text-right">Valor</div>}
          <div>Doutor</div>
          <div>Cadista</div>
          <div>Entrega</div>
          <div>Status</div>
        </div>
        {casesQ.isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Nenhum caso corresponde ao filtro.</div>
        ) : (
          <ul>
            {filtered.map((c) => {
              const n = c.teeth_numbers?.length ?? 0;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c)}
                    className={cn(
                      "w-full grid items-center gap-3 px-6 py-3.5 border-b border-slate-50 dark:border-white/[0.04] hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors text-left",
                      priceMode
                        ? "grid-cols-[minmax(0,1fr)_72px_110px_170px_170px_110px_110px]"
                        : "grid-cols-[minmax(0,1fr)_72px_170px_170px_110px_110px]",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] text-slate-900 truncate">
                        {c.case_number != null && <span className="text-slate-400 mr-2">#{c.case_number}</span>}
                        {c.patient?.name ?? "—"}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{c.case_type?.name ?? ""}</div>
                    </div>
                    <div className="text-[13px] text-slate-900 tabular-nums text-right"><CountUp value={n} /></div>
                    {priceMode && (
                      <div className="text-[13px] tabular-nums text-right text-primary">
                        <CountUp value={n * rate} format={brl} />
                      </div>
                    )}
                    <div className="text-[12px] text-slate-600 truncate">{c.doctor?.name ?? "—"}</div>
                    <div className="text-[12px] text-slate-600 truncate">{c.cadista?.name ?? "—"}</div>
                    <div className="text-[12px] text-slate-500 tabular-nums">{fmtBR(c.delivery_date)}</div>
                    <div><StatusPill status={c.status} /></div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </section>

      {priceMode && (
        <div className="shrink-0 border-t border-slate-100 bg-white/85 backdrop-blur-lg -mx-6 md:-mx-16 px-6 md:px-16 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Dentes</div>
              <div className="text-2xl font-extralight text-slate-900 tabular-nums"><CountUp value={totals.teeth} /></div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Casos</div>
              <div className="text-2xl font-extralight text-slate-900 tabular-nums"><CountUp value={filtered.length} /></div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Valor/dente</div>
              <div className="text-2xl font-extralight text-slate-900 tabular-nums">{brl(rate)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Total</div>
            <div className="text-3xl font-extralight tabular-nums text-primary">
              <CountUp value={totals.teeth * rate} format={brl} />
            </div>
          </div>
        </div>
      )}

      <ToothCaseDialog
        caseRow={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
     </div>
    </div>
  );
}


function PillGroup<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-slate-50 border border-slate-100">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "px-3.5 h-8 rounded-full text-[12px] transition-colors",
            value === o.v ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CalendarField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + "T00:00:00") : undefined;
  const label = date
    ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
    : placeholder;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full h-10 rounded-2xl bg-slate-50 hover:bg-slate-100/70 transition-colors px-4 text-left text-[12px] font-light inline-flex items-center gap-2",
            date ? "text-slate-800" : "text-slate-400",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
          <span className="flex-1 truncate">{label}</span>
          {date && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="text-slate-300 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="p-2 rounded-3xl border-0 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] bg-white"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              onChange(iso);
            }
            setOpen(false);
          }}
          className="pointer-events-auto [--cell-size:2.25rem]"
          classNames={{
            day: "rounded-full",
            day_button: "rounded-full hover:bg-slate-100",
            selected:
              "!bg-[#0C84FA] !text-white rounded-full [&_button]:!bg-[#0C84FA] [&_button]:!text-white [&_button]:rounded-full",
            today: "text-[#0C84FA] font-medium",
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function ProfessionalPicker({
  open,
  onOpenChange,
  selected,
  onChange,
  doctors,
  cadistas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selected: ProfSel[];
  onChange: (v: ProfSel[]) => void;
  doctors: { id: string; name: string }[];
  cadistas: { id: string; name: string }[];
}) {
  const isSelected = (kind: ProfKind, id: string) =>
    selected.some((p) => p.kind === kind && p.id === id);
  const toggle = (p: ProfSel) => {
    if (isSelected(p.kind, p.id)) {
      onChange(selected.filter((x) => !(x.kind === p.kind && x.id === p.id)));
    } else {
      onChange([...selected, p]);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full min-h-10 rounded-2xl bg-slate-50 hover:bg-slate-100/70 transition-colors px-3 py-1.5 text-left inline-flex items-center gap-1.5 flex-wrap"
        >
          {selected.length === 0 ? (
            <span className="text-[12px] font-light text-slate-400 px-1">Selecionar profissionais…</span>
          ) : (
            selected.map((p) => (
              <span
                key={`${p.kind}:${p.id}`}
                className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-full bg-white border border-slate-100 text-[11px] text-slate-700"
              >
                <span className={cn("inline-grid place-items-center h-5 px-1.5 rounded-full text-[9px] font-semibold", PROF_TAG[p.kind].cls)}>
                  {PROF_TAG[p.kind].label}
                </span>
                <span className="font-light">{p.name}</span>
              </span>
            ))
          )}
          <ChevronDown className={cn("ml-auto h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[360px] p-0 rounded-3xl border-0 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)] bg-white"
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-medium">Profissionais</div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="text-[11px] text-slate-400 hover:text-slate-700"
            >
              limpar
            </button>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto px-2 pb-3">
          <ProfGroup label="Dentistas" kind="doctor" items={doctors} isSelected={isSelected} toggle={toggle} />
          <ProfGroup label="Cadistas" kind="cadista" items={cadistas} isSelected={isSelected} toggle={toggle} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProfGroup({
  label,
  kind,
  items,
  isSelected,
  toggle,
}: {
  label: string;
  kind: ProfKind;
  items: { id: string; name: string }[];
  isSelected: (kind: ProfKind, id: string) => boolean;
  toggle: (p: ProfSel) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="pt-2">
      <div className="px-3 py-1 text-[9px] uppercase tracking-[0.14em] text-slate-300">{label}</div>
      <div className="flex flex-col">
        {items.map((it) => {
          const on = isSelected(kind, it.id);
          return (
            <button
              key={it.id}
              onClick={() => toggle({ kind, id: it.id, name: it.name })}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-2xl text-[13px] transition-colors",
                on ? "bg-[#0C84FA]/5 text-slate-900" : "hover:bg-slate-50 text-slate-700",
              )}
            >
              <span
                className={cn(
                  "inline-grid place-items-center h-6 w-6 rounded-full border transition-colors",
                  on ? "bg-[#0C84FA] border-[#0C84FA] text-white" : "border-slate-200 text-transparent",
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className={cn("inline-grid place-items-center h-5 px-1.5 rounded-full text-[9px] font-semibold", PROF_TAG[kind].cls)}>
                {PROF_TAG[kind].label}
              </span>
              <span className="font-light">{it.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="text-3xl font-extralight tabular-nums mt-1" style={tint ? { color: tint } : undefined}>
        <CountUp value={value} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Em andamento", cls: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" },
    finished: { label: "Finalizado", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" },
    cancelled: { label: "Cancelado", cls: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300" },
    canceled: { label: "Cancelado", cls: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300" };

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 h-6 text-[10px] font-medium", s.cls)}>
      {s.label}
    </span>
  );
}

function fmtBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function brl(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-slate-400 font-medium mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function statusLabelPt(s: string) {
  switch (s) {
    case "active": return "Em andamento";
    case "finished": return "Finalizado";
    case "cancelled":
    case "canceled": return "Cancelado";
    default: return s;
  }
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadReport(rows: CaseRow[], opts: { priceMode: boolean; rate: number }) {
  const header = [
    "Caso", "Paciente", "Tipo", "Doutor", "Cadista",
    "Dentes (qtd)", "Dentes (nums)", "Entrega", "Status",
    ...(opts.priceMode ? ["Valor/dente", "Valor caso"] : []),
  ];
  const lines = [header.map(csvCell).join(",")];
  let totalTeeth = 0;
  for (const c of rows) {
    const n = c.teeth_numbers?.length ?? 0;
    totalTeeth += n;
    const row = [
      c.case_number ?? "",
      c.patient?.name ?? "",
      c.case_type?.name ?? "",
      c.doctor?.name ?? "",
      c.cadista?.name ?? "",
      n,
      (c.teeth_numbers ?? []).join(" "),
      c.delivery_date ?? "",
      statusLabelPt(c.status),
      ...(opts.priceMode ? [opts.rate.toFixed(2), (n * opts.rate).toFixed(2)] : []),
    ];
    lines.push(row.map(csvCell).join(","));
  }
  if (opts.priceMode) {
    lines.push("");
    lines.push(["TOTAL", "", "", "", "", totalTeeth, "", "", "", opts.rate.toFixed(2), (totalTeeth * opts.rate).toFixed(2)].map(csvCell).join(","));
  } else {
    lines.push("");
    lines.push(["TOTAL", "", "", "", "", totalTeeth, "", "", ""].map(csvCell).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `dentes-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}