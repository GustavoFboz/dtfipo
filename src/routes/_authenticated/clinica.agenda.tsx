import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  List,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fetchDoctors, fetchPatients } from "@/lib/api";
import { cancelClinicAppointment, fetchClinicAppointments, fetchClinicContext, saveClinicAppointment } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/agenda")({ component: ClinicAgendaPage });

type ViewMode = "day" | "week" | "list";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

function localDateKey(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function localInputDate(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function fromDateKey(key: string) {
  return new Date(`${key}T12:00:00`);
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const weekday = d.getDay() || 7;
  d.setDate(d.getDate() - weekday + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, amount: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function ClinicAgendaPage() {
  return <ClinicPageGuard permission="clinical.appointments"><Agenda /></ClinicPageGuard>;
}

function Agenda() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => localDateKey(new Date()));
  const [view, setView] = useState<ViewMode>("day");
  const [query, setQuery] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editing, setEditing] = useState<any | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const anchorDate = fromDateKey(anchor);
  const range = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchorDate);
      return { start, end: addDays(start, 7) };
    }
    if (view === "list") {
      const start = new Date(`${anchor}T00:00:00`);
      return { start, end: addDays(start, 30) };
    }
    const start = new Date(`${anchor}T00:00:00`);
    return { start, end: addDays(start, 1) };
  }, [anchor, view]);

  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext });
  const appointments = useQuery({
    queryKey: ["clinic_appointments", view, localDateKey(range.start), localDateKey(range.end)],
    queryFn: () => fetchClinicAppointments(range.start.toISOString(), range.end.toISOString()),
  });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients, staleTime: 60_000 });
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: fetchDoctors, staleTime: 60_000 });

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...(appointments.data ?? [])]
      .filter((a: any) => doctorFilter === "all" || String(a.doctor_id ?? "none") === doctorFilter)
      .filter((a: any) => statusFilter === "all" || (statusFilter === "active" ? a.status !== "cancelled" : a.status === statusFilter))
      .filter((a: any) => !term || [a.patient?.name, a.doctor?.name, a.title].filter(Boolean).join(" ").toLowerCase().includes(term))
      .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [appointments.data, doctorFilter, statusFilter, query]);

  const counts = useMemo(() => {
    const all = appointments.data ?? [];
    return {
      active: all.filter((a: any) => a.status !== "cancelled").length,
      confirmed: all.filter((a: any) => a.status === "confirmed").length,
      completed: all.filter((a: any) => a.status === "completed").length,
    };
  }, [appointments.data]);

  const cancel = useMutation({
    mutationFn: cancelClinicAppointment,
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      qc.invalidateQueries({ queryKey: ["clinic_appointments"] });
      setSheetOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function newAppointment() {
    setEditing(null);
    setSheetOpen(true);
  }

  function editAppointment(appointment: any) {
    setEditing(appointment);
    setSheetOpen(true);
  }

  function shiftPeriod(direction: number) {
    const delta = view === "week" ? 7 : view === "list" ? 30 : 1;
    setAnchor(localDateKey(addDays(anchorDate, direction * delta)));
  }

  const heading = view === "week"
    ? `${range.start.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${addDays(range.end, -1).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`
    : view === "list"
      ? `Próximos 30 dias · ${anchorDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`
      : anchorDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-8 md:px-10 lg:px-12">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1e8f87]">Rotina clínica</div>
          <h1 className="mt-2 text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">Agenda</h1>
          <p className="mt-2 text-sm font-light text-slate-500">O dia inteiro em uma leitura simples. Menos ruído, mais decisão.</p>
        </div>
        <Button onClick={newAppointment} className="h-11 self-start rounded-full bg-[#1e8f87] px-5 text-white hover:bg-[#177a73] lg:self-auto">
          <Plus className="mr-2 h-4 w-4" /> Novo agendamento
        </Button>
      </div>

      <div className="mt-7 rounded-[26px] border border-slate-200/70 bg-white p-3 shadow-[0_12px_35px_-30px_rgba(15,23,42,.45)] dark:border-white/10 dark:bg-slate-950">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shiftPeriod(-1)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setAnchor(localDateKey(new Date()))} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">Hoje</button>
            <button onClick={() => shiftPeriod(1)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
            <div className="ml-1 min-w-[210px] text-sm font-medium capitalize text-slate-700 dark:text-slate-200">{heading}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ViewButton active={view === "day"} onClick={() => setView("day")} icon={Columns3} label="Dia" />
            <ViewButton active={view === "week"} onClick={() => setView("week")} icon={CalendarRange} label="Semana" />
            <ViewButton active={view === "list"} onClick={() => setView("list")} icon={List} label="Lista" />
          </div>
        </div>

        <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-[minmax(240px,1fr)_190px_170px_auto] dark:border-white/5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Paciente, profissional ou procedimento" className="h-10 rounded-xl border-slate-100 bg-slate-50/60 pl-10 shadow-none dark:border-white/10 dark:bg-white/[0.03]" />
          </div>
          <Select value={doctorFilter} onValueChange={setDoctorFilter}>
            <SelectTrigger className="h-10 rounded-xl border-slate-100 shadow-none dark:border-white/10"><SelectValue placeholder="Profissional" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os profissionais</SelectItem><SelectItem value="none">Sem profissional</SelectItem>{(doctors.data ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 rounded-xl border-slate-100 shadow-none dark:border-white/10"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Ativos</SelectItem><SelectItem value="all">Todos</SelectItem>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center justify-end gap-3 px-2 text-[11px] text-slate-400"><span>{counts.active} ativos</span><span className="h-1 w-1 rounded-full bg-slate-200" /><span>{counts.confirmed} confirmados</span><span className="hidden 2xl:inline">· {counts.completed} concluídos</span></div>
        </div>
      </div>

      <div className="mt-5">
        {appointments.isLoading ? (
          <div className="rounded-[28px] border border-slate-200/60 bg-white py-20 text-center text-sm font-light text-slate-400 dark:border-white/10 dark:bg-slate-950">Carregando agenda…</div>
        ) : view === "day" ? (
          <DayView appointments={visible} onOpen={editAppointment} />
        ) : view === "week" ? (
          <WeekView start={range.start} appointments={visible} onOpen={editAppointment} />
        ) : (
          <ListView appointments={visible} onOpen={editAppointment} />
        )}
      </div>

      <AppointmentSheet
        key={`${editing?.id ?? "new"}:${sheetOpen ? "open" : "closed"}:${anchor}`}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        appointment={editing}
        defaultDay={anchor}
        clinicId={context.data?.clinicId ?? null}
        patients={patients.data ?? []}
        doctors={doctors.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["clinic_appointments"] })}
        onCancel={(id: string) => cancel.mutate(id)}
        cancelling={cancel.isPending}
      />
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return <button onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition ${active ? "bg-[#1e8f87]/10 text-[#1e8f87]" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-white/5"}`}><Icon className="h-4 w-4 stroke-[1.5]" />{label}</button>;
}

function AppointmentCard({ appointment, compact = false, onOpen }: { appointment: any; compact?: boolean; onOpen: (a: any) => void }) {
  const cancelled = appointment.status === "cancelled";
  const time = new Date(appointment.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <button onClick={() => onOpen(appointment)} className={`w-full rounded-2xl border text-left transition hover:-translate-y-px hover:shadow-sm ${compact ? "p-3" : "p-4"} ${cancelled ? "border-slate-100 bg-slate-50/50 opacity-55 dark:border-white/5 dark:bg-white/[0.02]" : "border-slate-200/70 bg-white hover:border-[#1e8f87]/25 dark:border-white/10 dark:bg-slate-950"}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 min-w-[44px] text-xs font-semibold tabular-nums text-[#1e8f87]">{time}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{appointment.patient?.name || "Paciente"}</div>
          <div className="mt-1 truncate text-[11px] font-light text-slate-400">{appointment.title || "Atendimento"}{appointment.doctor?.name ? ` · ${appointment.doctor.name}` : ""}</div>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "confirmed" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300" : status === "completed" ? "bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-300" : status === "cancelled" ? "bg-slate-100 text-slate-400 dark:bg-white/5" : status === "no_show" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/20" : "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function DayView({ appointments, onOpen }: { appointments: any[]; onOpen: (a: any) => void }) {
  const hours = Array.from({ length: 14 }, (_, i) => i + 7);
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
      {hours.map((hour) => {
        const rows = appointments.filter((a: any) => new Date(a.starts_at).getHours() === hour);
        return (
          <div key={hour} className="grid min-h-[72px] grid-cols-[66px_1fr] border-b border-slate-100 last:border-0 dark:border-white/5">
            <div className="border-r border-slate-100 px-3 pt-4 text-right text-[11px] tabular-nums text-slate-300 dark:border-white/5">{String(hour).padStart(2, "0")}:00</div>
            <div className="space-y-2 p-2.5">
              {rows.map((a: any) => <AppointmentCard key={a.id} appointment={a} onOpen={onOpen} compact />)}
            </div>
          </div>
        );
      })}
      {appointments.length === 0 && <div className="px-6 py-14 text-center text-sm font-light text-slate-400">Nenhum atendimento para os filtros selecionados.</div>}
    </div>
  );
}

function WeekView({ start, appointments, onOpen }: { start: Date; appointments: any[]; onOpen: (a: any) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="overflow-x-auto rounded-[28px] border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
      <div className="grid min-w-[980px] grid-cols-7 divide-x divide-slate-100 dark:divide-white/5">
        {days.map((day) => {
          const key = localDateKey(day);
          const rows = appointments.filter((a: any) => localDateKey(new Date(a.starts_at)) === key);
          const today = key === localDateKey(new Date());
          return (
            <div key={key} className="min-h-[540px] p-3">
              <div className={`mb-3 rounded-2xl px-3 py-2 ${today ? "bg-[#1e8f87]/8" : "bg-slate-50/70 dark:bg-white/[0.03]"}`}>
                <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{day.toLocaleDateString("pt-BR", { weekday: "short" })}</div>
                <div className={`mt-1 text-xl font-light ${today ? "text-[#1e8f87]" : "text-slate-800 dark:text-white"}`}>{day.getDate()}</div>
              </div>
              <div className="space-y-2">{rows.map((a: any) => <AppointmentCard key={a.id} appointment={a} onOpen={onOpen} compact />)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ appointments, onOpen }: { appointments: any[]; onOpen: (a: any) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const appointment of appointments) {
      const key = localDateKey(new Date(appointment.starts_at));
      map.set(key, [...(map.get(key) ?? []), appointment]);
    }
    return Array.from(map.entries());
  }, [appointments]);
  if (groups.length === 0) return <div className="rounded-[28px] border border-dashed border-slate-200 py-20 text-center text-sm font-light text-slate-400 dark:border-white/10">Nenhum agendamento encontrado.</div>;
  return <div className="space-y-5">{groups.map(([key, rows]) => <section key={key}><div className="mb-2 px-1 text-xs font-medium capitalize text-slate-400">{fromDateKey(key).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div><div className="space-y-2">{rows.map((a) => <AppointmentCard key={a.id} appointment={a} onOpen={onOpen} />)}</div></section>)}</div>;
}

function AppointmentSheet({ open, onOpenChange, appointment, defaultDay, clinicId, patients, doctors, onSaved, onCancel, cancelling }: any) {
  const baseStart = appointment ? new Date(appointment.starts_at) : new Date(`${defaultDay}T09:00:00`);
  const baseEnd = appointment ? new Date(appointment.ends_at) : new Date(baseStart.getTime() + 30 * 60_000);
  const [patientId, setPatientId] = useState(appointment?.patient_id ?? "");
  const [doctorId, setDoctorId] = useState(appointment?.doctor_id ?? "none");
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [startsAt, setStartsAt] = useState(localInputDate(baseStart));
  const [endsAt, setEndsAt] = useState(localInputDate(baseEnd));
  const [status, setStatus] = useState(appointment?.status ?? "scheduled");

  const save = useMutation({
    mutationFn: () => {
      if (!clinicId || !patientId) throw new Error("Selecione um paciente.");
      if (!startsAt || !endsAt) throw new Error("Informe início e fim.");
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error("O término deve ser depois do início.");
      return saveClinicAppointment({ id: appointment?.id, clinic_id: clinicId, patient_id: patientId, doctor_id: doctorId === "none" ? null : doctorId, title: title.trim() || null, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), status });
    },
    onSuccess: () => {
      toast.success(appointment ? "Agendamento atualizado" : "Agendamento criado");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-slate-100 bg-white p-0 sm:max-w-[520px] dark:border-white/10 dark:bg-[#0b0e13]">
        <div className="border-b border-slate-100 px-6 py-6 dark:border-white/5">
          <SheetHeader>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1e8f87]">Agenda clínica</div>
            <SheetTitle className="text-2xl font-light tracking-tight">{appointment ? "Detalhes do agendamento" : "Novo agendamento"}</SheetTitle>
            <SheetDescription className="font-light">Preencha apenas o necessário. Você pode complementar depois.</SheetDescription>
          </SheetHeader>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="space-y-1.5"><Label>Paciente</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione o paciente" /></SelectTrigger><SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Profissional</Label><Select value={doctorId} onValueChange={setDoctorId}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem profissional definido</SelectItem>{doctors.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Atendimento</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Avaliação, retorno, profilaxia…" className="h-11 rounded-xl" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Início</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-11 rounded-xl" /></div><div className="space-y-1.5"><Label>Fim</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="h-11 rounded-xl" /></div></div>
          <div className="space-y-1.5"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        </div>

        <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-6 py-5 backdrop-blur dark:border-white/5 dark:bg-[#0b0e13]/95">
          <div>{appointment && appointment.status !== "cancelled" && <Button variant="ghost" disabled={cancelling} onClick={() => onCancel(appointment.id)} className="rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20">Cancelar agendamento</Button>}</div>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl"><X className="mr-1 h-4 w-4" /> Fechar</Button><Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl bg-[#1e8f87] text-white hover:bg-[#177a73]">{save.isPending ? "Salvando…" : "Salvar"}</Button></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
