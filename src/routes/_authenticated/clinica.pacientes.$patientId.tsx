import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { PatientAttachments } from "@/components/PatientAttachments";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { Button } from "@/components/ui/button";
import { fetchPatient } from "@/lib/api";
import { fetchClinicAppointments } from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/pacientes/$patientId")({ component: ClinicPatientDetailPage });

function ClinicPatientDetailPage() {
  return <ClinicPageGuard permission="clinical.patients"><PatientDetail /></ClinicPageGuard>;
}

function PatientDetail() {
  const { patientId } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);
  const patient = useQuery({ queryKey: ["patient", patientId], queryFn: () => fetchPatient(patientId), staleTime: 60_000 });

  const range = useMemo(() => {
    const start = new Date(); start.setMonth(start.getMonth() - 3);
    const end = new Date(); end.setMonth(end.getMonth() + 9);
    return { start, end };
  }, []);
  const appointments = useQuery({
    queryKey: ["clinic_appointments", "patient", patientId],
    queryFn: () => fetchClinicAppointments(range.start.toISOString(), range.end.toISOString()),
  });
  const patientAppointments = useMemo(() => (appointments.data ?? []).filter((a: any) => a.patient_id === patientId).sort((a: any, b: any) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()), [appointments.data, patientId]);

  const p: any = patient.data;
  if (patient.isLoading) return <div className="p-10 text-sm font-light text-slate-400">Carregando paciente…</div>;
  if (!p) return <div className="p-10 text-sm font-light text-slate-400">Paciente não encontrado.</div>;

  const nextAppointment = [...patientAppointments].filter((a: any) => new Date(a.starts_at).getTime() >= Date.now() && a.status !== "cancelled").sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  return (
    <div className="mx-auto max-w-[1450px] px-5 py-8 md:px-10 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/clinica/pacientes" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-[#1e8f87] dark:hover:bg-white/5"><ArrowLeft className="h-4 w-4" /> Pacientes</Link>
        <Button variant="outline" onClick={() => setEditOpen(true)} className="h-10 rounded-xl border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300"><Pencil className="mr-2 h-4 w-4" /> Editar cadastro</Button>
      </div>

      <section className="mt-4 rounded-[30px] border border-slate-200/70 bg-white p-6 md:p-8 dark:border-white/10 dark:bg-slate-950">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[28px] bg-[#1e8f87]/8 text-[#1e8f87]">
            {p.photo_url ? <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" /> : <UserRound className="h-9 w-9 stroke-[1.3]" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1e8f87]">Paciente da Clínica</div>
            <h1 className="mt-2 truncate text-3xl font-light tracking-[-0.035em] text-slate-950 md:text-4xl dark:text-white">{p.name}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-light text-slate-500">
              <InfoInline icon={Phone} value={p.phone || "Telefone não informado"} />
              <InfoInline icon={Mail} value={p.email || "E-mail não informado"} />
              <InfoInline icon={MapPin} value={p.address || "Endereço não informado"} />
            </div>
          </div>
          <div className="min-w-[220px] rounded-[22px] bg-slate-50/70 p-4 dark:bg-white/[0.03]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Próximo atendimento</div>
            {nextAppointment ? <><div className="mt-2 text-sm font-medium text-slate-800 dark:text-white">{new Date(nextAppointment.starts_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</div><div className="mt-1 text-xs font-light text-slate-400">{new Date(nextAppointment.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {nextAppointment.title || "Atendimento"}</div></> : <div className="mt-2 text-sm font-light text-slate-400">Nenhum agendamento futuro.</div>}
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#1e8f87]" /><h2 className="text-lg font-light text-slate-900 dark:text-white">Informações clínicas</h2></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InfoBlock label="Histórico médico" value={p.medical_history} />
              <InfoBlock label="Alergias" value={p.allergies} />
              <InfoBlock label="Medicamentos" value={p.medications} />
              <InfoBlock label="Observações clínicas" value={p.clinical_notes || p.notes} />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#1e8f87]" /><h2 className="text-lg font-light text-slate-900 dark:text-white">Documentos e imagens</h2></div>
            <div className="mt-5"><PatientAttachments patientId={patientId} /></div>
          </section>
        </div>

        <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-4">
            <div><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Histórico clínico</div><h2 className="mt-1 text-lg font-light text-slate-900 dark:text-white">Atendimentos</h2></div>
            <Link to="/clinica/agenda" className="text-xs font-medium text-[#1e8f87]">Abrir agenda</Link>
          </div>
          <div className="mt-5 space-y-2">
            {patientAppointments.slice(0, 12).map((a: any) => (
              <div key={a.id} className="flex items-center gap-4 rounded-2xl border border-slate-100 px-4 py-3 dark:border-white/5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1e8f87]/7 text-[#1e8f87]"><CalendarDays className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-slate-800 dark:text-white">{a.title || "Atendimento"}</div><div className="mt-0.5 text-[11px] font-light text-slate-400">{new Date(a.starts_at).toLocaleDateString("pt-BR")} · {new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{a.doctor?.name ? ` · ${a.doctor.name}` : ""}</div></div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:bg-white/5">{a.status}</span>
              </div>
            ))}
            {!appointments.isLoading && patientAppointments.length === 0 && <div className="py-14 text-center text-sm font-light text-slate-400">Ainda não há atendimentos registrados para este paciente.</div>}
          </div>
        </section>
      </div>

      <PatientFormDialog patient={p} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function InfoInline({ icon: Icon, value }: { icon: any; value: string }) {
  return <span className="inline-flex min-w-0 items-center gap-1.5"><Icon className="h-3.5 w-3.5 shrink-0 text-slate-300" /><span className="truncate">{value}</span></span>;
}

function InfoBlock({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-2xl bg-slate-50/70 p-4 dark:bg-white/[0.03]"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-300">{label}</div><div className="mt-2 whitespace-pre-line text-sm font-light leading-relaxed text-slate-600 dark:text-slate-300">{value || "Não informado"}</div></div>;
}
