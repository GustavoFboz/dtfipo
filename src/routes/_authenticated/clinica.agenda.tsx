import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchDoctors, fetchPatients } from "@/lib/api";
import { cancelClinicAppointment, fetchClinicAppointments, fetchClinicContext, saveClinicAppointment } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/agenda")({ component: ClinicAgendaPage });

function localInputDate(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function ClinicAgendaPage() { return <ClinicPageGuard permission="clinical.appointments"><Agenda /></ClinicPageGuard>; }

function Agenda() {
  const qc = useQueryClient();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const start = new Date(`${day}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 1);

  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext });
  const appointments = useQuery({ queryKey: ["clinic_appointments", day], queryFn: () => fetchClinicAppointments(start.toISOString(), end.toISOString()) });
  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: fetchDoctors });

  const visible = useMemo(() => [...(appointments.data ?? [])].sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [appointments.data]);

  function newAppointment() { setEditing(null); setOpen(true); }
  function editAppointment(a: any) { setEditing(a); setOpen(true); }

  const cancel = useMutation({
    mutationFn: cancelClinicAppointment,
    onSuccess: () => { toast.success("Agendamento cancelado"); qc.invalidateQueries({ queryKey: ["clinic_appointments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1450px] px-6 py-10 md:px-12">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/70">Clínica</div><h1 className="mt-2 text-4xl font-extralight tracking-tight text-slate-950 dark:text-white">Agenda de pacientes</h1><p className="mt-2 text-sm font-light text-slate-500">Consultas e compromissos clínicos, separados das entregas do laboratório.</p></div>
        <Button onClick={newAppointment} className="h-11 rounded-full px-5"><Plus className="mr-2 h-4 w-4" /> Novo agendamento</Button>
      </div>

      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 dark:border-white/10 dark:bg-slate-950">
        <CalendarDays className="ml-2 h-4 w-4 text-primary" /><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="max-w-[190px] border-0 shadow-none" />
        <span className="text-xs font-light text-slate-400">{visible.filter((a: any) => a.status !== "cancelled").length} agendamento(s)</span>
      </div>

      <div className="mt-5 space-y-3">
        {visible.map((a: any) => (
          <div key={a.id} className={`flex flex-col gap-4 rounded-[24px] border p-5 md:flex-row md:items-center ${a.status === "cancelled" ? "border-slate-100 bg-slate-50/50 opacity-55 dark:border-white/5 dark:bg-white/[0.02]" : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950"}`}>
            <div className="flex min-w-[100px] items-center gap-2 text-primary"><Clock className="h-4 w-4" /><span className="text-lg font-light">{new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div>
            <div className="min-w-0 flex-1"><div className="truncate text-base font-medium text-slate-900 dark:text-white">{a.patient?.name || "Paciente"}</div><div className="mt-1 text-xs font-light text-slate-400">{a.title || "Atendimento"}{a.doctor?.name ? ` · Dr(a). ${a.doctor.name}` : ""}</div></div>
            <span className="self-start rounded-full bg-slate-100 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-white/5 md:self-auto">{a.status}</span>
            {a.status !== "cancelled" && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => editAppointment(a)}>Editar</Button><Button variant="ghost" size="sm" className="text-rose-500" onClick={() => cancel.mutate(a.id)}>Cancelar</Button></div>}
          </div>
        ))}
        {!appointments.isLoading && visible.length === 0 && <div className="rounded-[28px] border border-dashed border-slate-200 py-16 text-center text-sm font-light text-slate-400 dark:border-white/10">Nenhum agendamento neste dia.</div>}
      </div>

      <AppointmentDialog open={open} onOpenChange={setOpen} appointment={editing} clinicId={context.data?.clinicId ?? null} patients={patients.data ?? []} doctors={doctors.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["clinic_appointments"] })} />
    </div>
  );
}

function AppointmentDialog({ open, onOpenChange, appointment, clinicId, patients, doctors, onSaved }: any) {
  const initialStart = appointment ? localInputDate(new Date(appointment.starts_at)) : localInputDate(new Date(Date.now() + 60 * 60_000));
  const initialEnd = appointment ? localInputDate(new Date(appointment.ends_at)) : localInputDate(new Date(Date.now() + 90 * 60_000));
  const [patientId, setPatientId] = useState(appointment?.patient_id ?? "");
  const [doctorId, setDoctorId] = useState(appointment?.doctor_id ?? "none");
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [status, setStatus] = useState(appointment?.status ?? "scheduled");

  // Radix preserves the component between openings; synchronize when the selected appointment changes.
  const key = `${appointment?.id ?? "new"}:${open ? "open" : "closed"}`;
  return <AppointmentDialogBody key={key} {...{ open, onOpenChange, appointment, clinicId, patients, doctors, onSaved, patientId, setPatientId, doctorId, setDoctorId, title, setTitle, startsAt, setStartsAt, endsAt, setEndsAt, status, setStatus }} />;
}

function AppointmentDialogBody(props: any) {
  const { open, onOpenChange, appointment, clinicId, patients, doctors, onSaved } = props;
  const [patientId, setPatientId] = useState(appointment?.patient_id ?? "");
  const [doctorId, setDoctorId] = useState(appointment?.doctor_id ?? "none");
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [startsAt, setStartsAt] = useState(appointment ? localInputDate(new Date(appointment.starts_at)) : localInputDate(new Date(Date.now() + 60 * 60_000)));
  const [endsAt, setEndsAt] = useState(appointment ? localInputDate(new Date(appointment.ends_at)) : localInputDate(new Date(Date.now() + 90 * 60_000)));
  const [status, setStatus] = useState(appointment?.status ?? "scheduled");
  const save = useMutation({
    mutationFn: () => {
      if (!clinicId || !patientId) throw new Error("Selecione um paciente.");
      return saveClinicAppointment({ id: appointment?.id, clinic_id: clinicId, patient_id: patientId, doctor_id: doctorId === "none" ? null : doctorId, title: title || null, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), status });
    },
    onSuccess: () => { toast.success(appointment ? "Agendamento atualizado" : "Agendamento criado"); onSaved(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg rounded-[26px]"><DialogHeader><DialogTitle className="font-light text-2xl">{appointment ? "Editar agendamento" : "Novo agendamento"}</DialogTitle></DialogHeader><div className="grid gap-4 py-2">
    <div className="space-y-1.5"><Label>Paciente</Label><Select value={patientId} onValueChange={setPatientId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{patients.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label>Dentista</Label><Select value={doctorId} onValueChange={setDoctorId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem dentista definido</SelectItem>{doctors.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label>Descrição</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Consulta, retorno, avaliação…" /></div>
    <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Início</Label><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div><div className="space-y-1.5"><Label>Fim</Label><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div></div>
    <div className="space-y-1.5"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="scheduled">Agendado</SelectItem><SelectItem value="confirmed">Confirmado</SelectItem><SelectItem value="completed">Concluído</SelectItem><SelectItem value="no_show">Não compareceu</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem></SelectContent></Select></div>
  </div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}><X className="mr-1 h-4 w-4" /> Fechar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button></div></DialogContent></Dialog>;
}
