import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCases, fetchProfile } from "@/lib/api";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Stethoscope, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: AgendaPage,
});

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = iso.length === 10 ? iso + "T00:00:00" : iso;
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function AgendaPage() {
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["cases_agenda"],
    queryFn: () => fetchCases("active"),
  });

  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(new Date());

  // Filter for doctors: only their cases
  const visibleCases = useMemo(() => {
    if (!profile) return [];
    if (profile.role === "DR") {
      // match by name on doctor relation since doctors table has no user_id
      const nameKey = (profile.full_name || "").trim().toLowerCase();
      return cases.filter(c => (c.doctor?.name || "").trim().toLowerCase() === nameKey);
    }
    return cases;
  }, [cases, profile]);

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const startOffset = first.getDay();
    const total = startOffset + last.getDate();
    const rows = Math.ceil(total / 7);
    const cells: Date[] = [];
    for (let i = 0; i < rows * 7; i++) {
      cells.push(new Date(first.getFullYear(), first.getMonth(), i - startOffset + 1));
    }
    return cells;
  }, [cursor]);

  const casesByDay = useMemo(() => {
    const map = new Map<string, typeof visibleCases>();
    visibleCases.forEach((c) => {
      const d = parseDate(c.delivery_date);
      if (!d) return;
      const key = d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    });
    return map;
  }, [visibleCases]);

  const todays = casesByDay.get(selected.toISOString().slice(0, 10)) ?? [];

  return (
    <div className="min-h-screen bg-[#fcfdfe] dark:bg-slate-950 p-6 md:p-10 pb-20">
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-bold text-primary uppercase tracking-[0.08em]">
            <CalendarIcon className="h-3 w-3" /> Agenda
          </div>
          <h1 className="text-4xl md:text-5xl font-extralight text-slate-900 dark:text-slate-100 tracking-tight">
            Sua <span className="text-primary italic font-light">agenda</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-light">
            {profile?.role === "DR"
              ? "Visualize as entregas das próteses dos seus pacientes."
              : profile?.role === "CADISTA"
              ? "Acompanhe as entregas dos seus casos atribuídos."
              : "Acompanhe entregas e marcos dos casos ativos."}
          </p>

        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[160px] text-center capitalize">
            {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { const n = new Date(); setCursor(startOfMonth(n)); setSelected(n); }}>
            Hoje
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-4 md:p-6">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] font-bold tracking-[0.08em] text-slate-400 uppercase text-center py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const key = d.toISOString().slice(0, 10);
              const dayCases = casesByDay.get(key) ?? [];
              const isSelected = sameDay(d, selected);
              const isToday = sameDay(d, new Date());
              return (
                <button
                  key={i}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "relative aspect-square rounded-xl text-sm transition-all p-2 flex flex-col items-start text-left",
                    inMonth ? "text-slate-700 dark:text-slate-200" : "text-slate-300 dark:text-slate-700",
                    isSelected ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    isToday && !isSelected && "ring-1 ring-primary/30"
                  )}
                >
                  <span className={cn("text-xs", isToday && !isSelected && "text-primary font-semibold")}>{d.getDate()}</span>
                  {dayCases.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1">
                      {dayCases.slice(0, 3).map((c) => (
                        <span key={c.id} className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-white" : "bg-primary")} />
                      ))}
                      {dayCases.length > 3 && (
                        <span className={cn("text-[9px] font-bold", isSelected ? "text-white" : "text-primary")}>+{dayCases.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-2">
            {selected.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </div>
          <h3 className="text-2xl font-light text-slate-900 dark:text-slate-100 mb-6">
            {todays.length} entrega{todays.length === 1 ? "" : "s"} prevista{todays.length === 1 ? "" : "s"}
          </h3>
          {isLoading ? (
            <p className="text-sm text-slate-400">Carregando…</p>
          ) : todays.length === 0 ? (
            <p className="text-sm text-slate-400">Sem entregas neste dia.</p>
          ) : (
            <ul className="space-y-3">
              {todays.map((c) => (
                <li key={c.id} className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <User className="h-3 w-3" />
                    <span className="font-medium text-slate-900 dark:text-slate-100">{c.patient?.name || "Paciente"}</span>
                  </div>
                  {c.doctor?.name && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Stethoscope className="h-3 w-3" /> Dentista: {c.doctor.name}
                    </div>
                  )}

                  <div className="mt-2 text-[11px] text-slate-400">
                    {c.case_label || c.case_type?.name || "Caso"} · entrega {parseDate(c.delivery_date)?.toLocaleDateString("pt-BR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
