import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Pill,
  Plus,
  ShieldAlert,
  Stethoscope,
  UserRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { ClinicPageGuard } from "@/components/ClinicPageGuard";
import { PatientAttachments } from "@/components/PatientAttachments";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchPatient } from "@/lib/api";
import {
  fetchClinicAppointments,
  fetchClinicContext,
  fetchClinicPatientEvolutions,
  fetchClinicPatientFinancialEntries,
  fetchClinicPatientTreatments,
  saveClinicPatientEvolution,
  type ClinicPatientEvolution,
  type ClinicPatientTreatment,
} from "@/lib/clinic";

export const Route = createFileRoute("/_authenticated/clinica/pacientes/$patientId")({ component: ClinicPatientDetailPage });

type PatientSection = "overview" | "anamnesis" | "treatments" | "evolution" | "agenda" | "documents" | "images" | "financial";

const SECTIONS: Array<{ id: PatientSection; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "anamnesis", label: "Anamnese" },
  { id: "treatments", label: "Tratamentos" },
  { id: "evolution", label: "Evolução" },
  { id: "agenda", label: "Agenda" },
  { id: "documents", label: "Documentos" },
  { id: "images", label: "Imagens" },
  { id: "financial", label: "Financeiro" },
];

function ClinicPatientDetailPage() {
  return <ClinicPageGuard permission="clinical.patients"><PatientDetail /></ClinicPageGuard>;
}

function PatientDetail() {
  const { patientId } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [section, setSection] = useState<PatientSection>("overview");

  const context = useQuery({ queryKey: ["clinic_context"], queryFn: fetchClinicContext, staleTime: 60_000 });
  const patient = useQuery({ queryKey: ["patient", patientId], queryFn: () => fetchPatient(patientId), staleTime: 60_000 });

  const range = useMemo(() => {
    const start = new Date(); start.setFullYear(start.getFullYear() - 1);
    const end = new Date(); end.setFullYear(end.getFullYear() + 1);
    return { start, end };
  }, []);

  const appointments = useQuery({
    queryKey: ["clinic_appointments", "patient", patientId],
    queryFn: () => fetchClinicAppointments(range.start.toISOString(), range.end.toISOString()),
    enabled: Boolean(context.data?.permissions["clinical.appointments"]),
  });
  const patientAppointments = useMemo(
    () => (appointments.data ?? [])
      .filter((item: any) => item.patient_id === patientId)
      .sort((a: any, b: any) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    [appointments.data, patientId],
  );

  const labIntegrated = Boolean(context.data?.modules.includes("laboratory"));
  const treatments = useQuery({
    queryKey: ["clinic_patient_treatments", patientId],
    queryFn: () => fetchClinicPatientTreatments(patientId),
    enabled: labIntegrated,
  });
  const evolutions = useQuery({
    queryKey: ["clinic_patient_evolutions", patientId],
    queryFn: () => fetchClinicPatientEvolutions(patientId),
  });
  const financial = useQuery({
    queryKey: ["clinic_patient_financial", patientId],
    queryFn: () => fetchClinicPatientFinancialEntries(patientId),
    enabled: Boolean(context.data?.permissions["clinical.financial"]),
  });

  const p: any = patient.data;
  if (patient.isLoading) return <div className="p-10 text-sm font-light text-slate-400">Carregando paciente…</div>;
  if (!p) return <div className="p-10 text-sm font-light text-slate-400">Paciente não encontrado.</div>;

  const age = calculateAge(p.birth_date, p.age);
  const nextAppointment = [...patientAppointments]
    .filter((item: any) => new Date(item.starts_at).getTime() >= Date.now() && item.status !== "cancelled")
    .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  const activeTreatments = (treatments.data ?? []).filter((item) => item.status === "em_andamento");
  const financialRows = financial.data ?? [];
  const revenue = financialRows.filter((item: any) => item.kind === "revenue" && item.status !== "cancelled").reduce((sum: number, item: any) => sum + Number(item.amount_cents || 0), 0);
  const received = financialRows.filter((item: any) => item.kind === "revenue" && item.status === "paid").reduce((sum: number, item: any) => sum + Number(item.amount_cents || 0), 0);
  const pending = financialRows.filter((item: any) => item.kind === "revenue" && item.status === "pending").reduce((sum: number, item: any) => sum + Number(item.amount_cents || 0), 0);

  const alerts = buildAlerts(p, activeTreatments.length, nextAppointment);

  function openWhatsApp() {
    const raw = String(p.phone || "").replace(/\D/g, "");
    if (!raw) return;
    const phone = raw.length <= 11 ? `55${raw}` : raw;
    window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-7 md:px-9 lg:px-12 lg:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/clinica/pacientes" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-[#1e8f87] dark:hover:bg-white/5"><ArrowLeft className="h-4 w-4" /> Pacientes</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setEvolutionOpen(true)} className="h-10 rounded-full bg-[#1e8f87] px-4 text-white hover:bg-[#177a73]"><NotebookPen className="mr-2 h-4 w-4" /> Registrar evolução</Button>
          {context.data?.permissions["clinical.appointments"] && <Link to="/clinica/agenda"><Button variant="outline" className="h-10 rounded-full border-slate-200 bg-white px-4 text-slate-600 dark:border-white/10 dark:bg-slate-950"><CalendarDays className="mr-2 h-4 w-4" /> Novo atendimento</Button></Link>}
          {p.phone && <Button variant="outline" onClick={openWhatsApp} className="h-10 rounded-full border-slate-200 bg-white px-4 text-slate-600 dark:border-white/10 dark:bg-slate-950"><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</Button>}
          <Button variant="ghost" onClick={() => setEditOpen(true)} className="h-10 rounded-full px-4 text-slate-500"><Pencil className="mr-2 h-4 w-4" /> Editar</Button>
        </div>
      </div>

      <section className="relative mt-4 overflow-hidden rounded-[32px] border border-slate-200/70 bg-white p-6 md:p-8 dark:border-white/10 dark:bg-slate-950">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#1e8f87]/[0.045] blur-2xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[30px] bg-[#1e8f87]/8 text-[#1e8f87] shadow-[0_16px_36px_-30px_rgba(15,23,42,.7)]">
            {p.photo_url ? <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" /> : <UserRound className="h-9 w-9 stroke-[1.3]" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1e8f87]"><span>Paciente</span><span className="h-1 w-1 rounded-full bg-slate-200" /><span className="text-emerald-600">Ativo</span></div>
            <h1 className="mt-2 truncate text-3xl font-light tracking-[-0.04em] text-slate-950 md:text-[42px] dark:text-white">{p.name}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5 text-xs font-light text-slate-500">
              <InfoInline icon={CalendarDays} value={p.birth_date ? `${formatDate(p.birth_date)} · ${age}` : age} />
              <InfoInline icon={Phone} value={p.phone || "Telefone não informado"} />
              <InfoInline icon={Mail} value={p.email || "E-mail não informado"} />
              <InfoInline icon={MapPin} value={p.address || "Endereço não informado"} />
            </div>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[390px]">
            <HeaderSignal label="Próximo atendimento" icon={Clock3} value={nextAppointment ? formatAppointment(nextAppointment) : "Sem agendamento futuro"} accent={Boolean(nextAppointment)} />
            <HeaderSignal label="Tratamentos ativos" icon={Stethoscope} value={labIntegrated ? `${activeTreatments.length} em acompanhamento` : "Integração não ativa"} accent={activeTreatments.length > 0} />
          </div>
        </div>
      </section>

      <div className="sticky top-[72px] z-30 -mx-1 mt-4 overflow-x-auto rounded-[20px] border border-slate-200/70 bg-white/94 p-1.5 shadow-[0_10px_34px_-30px_rgba(15,23,42,.55)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0e13]/94">
        <div className="flex min-w-max items-center gap-1">
          {SECTIONS.map((item) => (
            <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`rounded-[14px] px-4 py-2.5 text-[11px] font-medium transition ${section === item.id ? "bg-[#1e8f87]/10 text-[#1e8f87]" : "text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/[0.04] dark:hover:text-slate-200"}`}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {section === "overview" && <OverviewSection patient={p} alerts={alerts} treatments={treatments.data ?? []} labIntegrated={labIntegrated} evolutions={evolutions.data ?? []} nextAppointment={nextAppointment} revenue={revenue} received={received} pending={pending} financialEnabled={Boolean(context.data?.permissions["clinical.financial"])} onOpenEvolution={() => setEvolutionOpen(true)} onGo={(value: PatientSection) => setSection(value)} />}
        {section === "anamnesis" && <AnamnesisSection patient={p} age={age} onEdit={() => setEditOpen(true)} />}
        {section === "treatments" && <TreatmentsSection rows={treatments.data ?? []} loading={treatments.isLoading} integrated={labIntegrated} error={treatments.isError} />}
        {section === "evolution" && <EvolutionSection rows={evolutions.data ?? []} loading={evolutions.isLoading} onCreate={() => setEvolutionOpen(true)} />}
        {section === "agenda" && <AgendaSection rows={patientAppointments} enabled={Boolean(context.data?.permissions["clinical.appointments"])} loading={appointments.isLoading} />}
        {section === "documents" && <SectionCard><PatientAttachments patientId={patientId} kinds={["document", "other"]} defaultKind="document" title="Documentos do paciente" emptyLabel="Nenhum documento enviado para este paciente." /></SectionCard>}
        {section === "images" && <SectionCard><PatientAttachments patientId={patientId} kinds={["scan", "xray", "photo"]} defaultKind="photo" title="Imagens clínicas" emptyLabel="Nenhuma imagem clínica enviada para este paciente." /></SectionCard>}
        {section === "financial" && <FinancialSection rows={financialRows} enabled={Boolean(context.data?.permissions["clinical.financial"])} loading={financial.isLoading} revenue={revenue} received={received} pending={pending} />}
      </div>

      <PatientFormDialog patient={p} open={editOpen} onOpenChange={setEditOpen} />
      <EvolutionDialog open={evolutionOpen} onOpenChange={setEvolutionOpen} clinicId={context.data?.clinicId ?? null} patientId={patientId} treatments={treatments.data ?? []} />
    </div>
  );
}

function OverviewSection({ patient, alerts, treatments, labIntegrated, evolutions, nextAppointment, revenue, received, pending, financialEnabled, onOpenEvolution, onGo }: any) {
  const active = (treatments as ClinicPatientTreatment[]).filter((item) => item.status === "em_andamento");
  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Alertas clínicos</div><div className="mt-1 text-sm font-light text-slate-500">O essencial que merece atenção antes do atendimento.</div></div><button type="button" onClick={() => onGo("anamnesis")} className="text-xs font-medium text-[#1e8f87]">Abrir anamnese</button></div>
        <div className="mt-4 flex flex-wrap gap-2">{alerts.map((alert: any) => <AlertChip key={`${alert.label}-${alert.detail}`} {...alert} />)}</div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Tratamentos</div><h2 className="mt-1 text-xl font-light tracking-tight text-slate-900 dark:text-white">Em acompanhamento</h2></div><button type="button" onClick={() => onGo("treatments")} className="text-xs font-medium text-[#1e8f87]">Ver todos</button></div>
            <div className="mt-5 space-y-2.5">
              {active.slice(0, 4).map((row) => <TreatmentRow key={row.id} row={row} />)}
              {!labIntegrated && <EmptyState icon={Stethoscope} title="Clínica independente" text="A integração com o Laboratório não está ativa nesta conta. O prontuário clínico continua funcionando normalmente." />}
              {labIntegrated && active.length === 0 && <EmptyState icon={CheckCircle2} title="Nenhum tratamento integrado ativo" text="Quando houver um caso laboratorial vinculado a este paciente, ele aparecerá aqui." />}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Evolução clínica</div><h2 className="mt-1 text-xl font-light tracking-tight text-slate-900 dark:text-white">Últimos registros</h2></div><Button onClick={onOpenEvolution} variant="outline" className="h-9 rounded-full border-slate-200 px-4 text-xs"><Plus className="mr-1.5 h-3.5 w-3.5" /> Registrar</Button></div>
            <div className="mt-5"><EvolutionTimeline rows={evolutions.slice(0, 4)} compact /></div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[#1e8f87]" /><h2 className="text-lg font-light text-slate-900 dark:text-white">Resumo clínico</h2></div>
            <div className="mt-5 space-y-3">
              <SummaryLine icon={HeartPulse} label="Histórico médico" value={patient.medical_history} />
              <SummaryLine icon={AlertTriangle} label="Alergias" value={patient.allergies} critical={Boolean(patient.allergies)} />
              <SummaryLine icon={Pill} label="Medicamentos" value={patient.medications} />
              <SummaryLine icon={FileText} label="Observações" value={patient.clinical_notes || patient.notes} />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Próximo atendimento</div>
            {nextAppointment ? <div className="mt-4"><div className="text-2xl font-light tracking-tight text-slate-900 dark:text-white">{new Date(nextAppointment.starts_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</div><div className="mt-1 text-sm font-light text-slate-500">{new Date(nextAppointment.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {nextAppointment.title || "Atendimento clínico"}</div><div className="mt-3 inline-flex rounded-full bg-[#1e8f87]/8 px-3 py-1.5 text-[10px] font-medium text-[#1e8f87]">{statusLabel(nextAppointment.status)}</div></div> : <EmptyState icon={CalendarDays} title="Sem retorno agendado" text="Nenhum atendimento futuro encontrado para este paciente." compact />}
          </section>

          {financialEnabled && <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Financeiro</div><h2 className="mt-1 text-lg font-light text-slate-900 dark:text-white">Resumo do paciente</h2></div><button type="button" onClick={() => onGo("financial")} className="text-xs font-medium text-[#1e8f87]">Detalhes</button></div><div className="mt-5 grid grid-cols-3 gap-2"><MiniMoney label="Total" value={revenue} /><MiniMoney label="Recebido" value={received} /><MiniMoney label="Em aberto" value={pending} warning={pending > 0} /></div></section>}
        </div>
      </div>
    </div>
  );
}

function AnamnesisSection({ patient, age, onEdit }: { patient: any; age: string; onEdit: () => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Dados pessoais</div><h2 className="mt-1 text-xl font-light text-slate-900 dark:text-white">Identificação</h2></div><Button variant="ghost" onClick={onEdit} className="h-9 rounded-full text-xs text-[#1e8f87]"><Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar</Button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <DataField label="Nascimento" value={patient.birth_date ? formatDate(patient.birth_date) : "Não informado"} />
          <DataField label="Idade" value={age} />
          <DataField label="Sexo" value={patient.gender || "Não informado"} />
          <DataField label="CPF" value={patient.cpf || "Não informado"} />
          <DataField label="RG" value={patient.rg || "Não informado"} />
          <DataField label="Telefone" value={patient.phone || "Não informado"} />
          <div className="sm:col-span-2"><DataField label="E-mail" value={patient.email || "Não informado"} /></div>
          <div className="sm:col-span-2"><DataField label="Endereço" value={patient.address || "Não informado"} /></div>
        </div>
      </section>
      <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 dark:border-white/10 dark:bg-slate-950">
        <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-[#1e8f87]" /><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Anamnese</div><h2 className="mt-1 text-xl font-light text-slate-900 dark:text-white">Informações clínicas</h2></div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ClinicalInfoCard icon={HeartPulse} label="Histórico médico" value={patient.medical_history} />
          <ClinicalInfoCard icon={AlertTriangle} label="Alergias" value={patient.allergies} critical={Boolean(patient.allergies)} />
          <ClinicalInfoCard icon={Pill} label="Medicamentos em uso" value={patient.medications} />
          <ClinicalInfoCard icon={NotebookPen} label="Notas clínicas" value={patient.clinical_notes || patient.notes} />
        </div>
      </section>
    </div>
  );
}

function TreatmentsSection({ rows, loading, integrated, error }: { rows: ClinicPatientTreatment[]; loading: boolean; integrated: boolean; error: boolean }) {
  return <SectionCard><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Tratamentos</div><h2 className="mt-1 text-2xl font-light tracking-tight text-slate-900 dark:text-white">Acompanhamento do paciente</h2><p className="mt-2 text-xs font-light text-slate-400">Casos laboratoriais aparecem aqui somente quando a integração entre Clínica e Laboratório está ativa.</p></div><div className="rounded-full bg-[#1e8f87]/8 px-3 py-1.5 text-[10px] font-medium text-[#1e8f87]">{rows.filter((item) => item.status === "em_andamento").length} ativos</div></div><div className="mt-6 space-y-3">{loading && <div className="py-12 text-center text-xs font-light text-slate-400">Carregando tratamentos…</div>}{!integrated && <EmptyState icon={Stethoscope} title="Módulos independentes" text="Esta conta não possui integração Laboratório ↔ Clínica ativa. A Clínica funciona normalmente sem expor dados laboratoriais." />}{integrated && !loading && !error && rows.length === 0 && <EmptyState icon={CheckCircle2} title="Nenhum tratamento integrado" text="Não há casos laboratoriais vinculados a este paciente." />}{error && <EmptyState icon={AlertTriangle} title="Tratamentos indisponíveis" text="Este perfil não possui acesso aos dados integrados do Laboratório." />}{rows.map((row) => <TreatmentRow key={row.id} row={row} expanded />)}</div></SectionCard>;
}

function EvolutionSection({ rows, loading, onCreate }: { rows: ClinicPatientEvolution[]; loading: boolean; onCreate: () => void }) {
  return <SectionCard><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Prontuário</div><h2 className="mt-1 text-2xl font-light tracking-tight text-slate-900 dark:text-white">Evolução clínica</h2><p className="mt-2 text-xs font-light text-slate-400">Registros cronológicos do que foi realizado e observado durante os atendimentos.</p></div><Button onClick={onCreate} className="h-10 rounded-full bg-[#1e8f87] px-4 text-white hover:bg-[#177a73]"><Plus className="mr-2 h-4 w-4" /> Registrar evolução</Button></div><div className="mt-7">{loading ? <div className="py-12 text-center text-xs font-light text-slate-400">Carregando evoluções…</div> : <EvolutionTimeline rows={rows} />}</div></SectionCard>;
}

function AgendaSection({ rows, enabled, loading }: { rows: any[]; enabled: boolean; loading: boolean }) {
  return <SectionCard><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#1e8f87]">Agenda do paciente</div><h2 className="mt-1 text-2xl font-light tracking-tight text-slate-900 dark:text-white">Atendimentos</h2></div>{enabled && <Link to="/clinica/agenda" className="text-xs font-medium text-[#1e8f87]">Abrir agenda completa</Link>}</div><div className="mt-6 space-y-2">{!enabled && <EmptyState icon={CalendarDays} title="Agenda sem permissão" text="Este perfil não possui acesso à agenda clínica." />}{enabled && loading && <div className="py-12 text-center text-xs font-light text-slate-400">Carregando agenda…</div>}{enabled && !loading && rows.length === 0 && <EmptyState icon={CalendarDays} title="Nenhum atendimento" text="Ainda não existem agendamentos para este paciente." />}{enabled && rows.map((item) => <AppointmentRow key={item.id} item={item} />)}</div></SectionCard>;
}

function FinancialSection({ rows, enabled, loading, revenue, received, pending }: { rows: any[]; enabled: boolean; loading: boolean; revenue: number; received: number; pending: number }) {
  if (!enabled) return <SectionCard><EmptyState icon={WalletCards} title="Financeiro sem permissão" text="Este perfil não possui acesso às informações financeiras da Clínica." /></SectionCard>;
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><MoneyStat label="Total lançado" value={revenue} icon={CircleDollarSign} /><MoneyStat label="Recebido" value={received} icon={CheckCircle2} /><MoneyStat label="Em aberto" value={pending} icon={Clock3} warning={pending > 0} /></div><SectionCard><div><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Financeiro</div><h2 className="mt-1 text-2xl font-light tracking-tight text-slate-900 dark:text-white">Movimentações do paciente</h2></div><div className="mt-6 space-y-2">{loading && <div className="py-12 text-center text-xs font-light text-slate-400">Carregando financeiro…</div>}{!loading && rows.length === 0 && <EmptyState icon={WalletCards} title="Sem lançamentos" text="Nenhuma movimentação financeira está vinculada a este paciente." />}{rows.map((item) => <div key={item.id} className="grid gap-2 rounded-2xl border border-slate-100 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center dark:border-white/5"><div><div className="text-sm font-medium text-slate-800 dark:text-white">{item.description}</div><div className="mt-1 text-[10px] font-light text-slate-400">{item.category || (item.kind === "revenue" ? "Receita" : "Despesa")} · {item.due_date ? formatDate(item.due_date) : "Sem vencimento"}</div></div><div className={`text-sm font-medium ${item.kind === "expense" ? "text-rose-500" : "text-slate-700 dark:text-slate-200"}`}>{item.kind === "expense" ? "−" : ""}{money(Number(item.amount_cents || 0))}</div><span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.06em] ${item.status === "paid" ? "bg-emerald-50 text-emerald-600" : item.status === "cancelled" ? "bg-slate-100 text-slate-400" : "bg-amber-50 text-amber-600"}`}>{item.status === "paid" ? "Pago" : item.status === "cancelled" ? "Cancelado" : "Pendente"}</span></div>)}</div></SectionCard></div>;
}

function EvolutionDialog({ open, onOpenChange, clinicId, patientId, treatments }: { open: boolean; onOpenChange: (open: boolean) => void; clinicId: string | null; patientId: string; treatments: ClinicPatientTreatment[] }) {
  const qc = useQueryClient();
  const [procedure, setProcedure] = useState("");
  const [description, setDescription] = useState("");
  const [teeth, setTeeth] = useState("");
  const [caseId, setCaseId] = useState("");

  const save = useMutation({
    mutationFn: () => {
      if (!clinicId) throw new Error("Clínica não identificada.");
      return saveClinicPatientEvolution({ clinic_id: clinicId, patient_id: patientId, case_id: caseId || null, procedure: procedure.trim() || null, description, teeth_numbers: parseTeeth(teeth) });
    },
    onSuccess: () => {
      toast.success("Evolução registrada");
      qc.invalidateQueries({ queryKey: ["clinic_patient_evolutions", patientId] });
      setProcedure(""); setDescription(""); setTeeth(""); setCaseId(""); onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Registrar evolução clínica</DialogTitle><DialogDescription>Registre de forma objetiva o que foi realizado, observado ou orientado neste atendimento.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Procedimento / título</Label><Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="Ex.: Instalação de provisório" /></div><div><Label>Dentes envolvidos</Label><Input value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="Ex.: 11, 12, 21" /></div>{treatments.length > 0 && <div><Label>Vincular caso do Laboratório (opcional)</Label><select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Sem vínculo</option>{treatments.map((item) => <option key={item.id} value={item.id}>Caso {item.case_number ? `#${item.case_number}` : item.id.slice(0, 6)} · {item.case_type?.name || "Tratamento"}</option>)}</select></div>}<div><Label>Evolução *</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder="Descreva o atendimento, achados clínicos, conduta e orientações…" /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !description.trim()} className="bg-[#1e8f87] text-white hover:bg-[#177a73]">{save.isPending ? "Salvando…" : "Registrar evolução"}</Button></DialogFooter></DialogContent></Dialog>;
}

function EvolutionTimeline({ rows, compact = false }: { rows: ClinicPatientEvolution[]; compact?: boolean }) {
  if (rows.length === 0) return <EmptyState icon={NotebookPen} title="Nenhuma evolução registrada" text="O histórico clínico aparecerá aqui conforme os atendimentos forem registrados." compact={compact} />;
  return <div className="relative space-y-0 before:absolute before:bottom-3 before:left-[13px] before:top-3 before:w-px before:bg-slate-100 dark:before:bg-white/8">{rows.map((row, index) => <div key={row.id} className="relative grid grid-cols-[28px_1fr] gap-3 pb-5 last:pb-0"><div className={`relative z-10 mt-1 h-[27px] w-[27px] rounded-full border-4 border-white dark:border-slate-950 ${index === 0 ? "bg-[#1e8f87]" : "bg-slate-200 dark:bg-slate-700"}`} /><div className="rounded-[20px] border border-slate-100 px-4 py-3.5 dark:border-white/5"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-medium text-slate-800 dark:text-white">{row.procedure || "Evolução clínica"}</div><div className="mt-1 text-[10px] font-light text-slate-400">{new Date(row.created_at).toLocaleDateString("pt-BR")} · {new Date(row.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div>{row.teeth_numbers?.length > 0 && <span className="rounded-full bg-[#1e8f87]/8 px-2.5 py-1 text-[9px] font-medium text-[#1e8f87]">Dentes {row.teeth_numbers.join(", ")}</span>}</div><p className={`mt-3 whitespace-pre-line text-xs font-light leading-5 text-slate-500 dark:text-slate-400 ${compact ? "line-clamp-3" : ""}`}>{row.description}</p></div></div>)}</div>;
}

function TreatmentRow({ row, expanded = false }: { row: ClinicPatientTreatment; expanded?: boolean }) {
  const teeth = row.teeth_numbers?.length ? row.teeth_numbers : row.implant_teeth;
  return <div className="rounded-[20px] border border-slate-100 px-4 py-3.5 transition hover:border-[#1e8f87]/15 dark:border-white/5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-medium text-slate-800 dark:text-white">{row.case_type?.name || "Tratamento odontológico"}</div>{row.case_number && <span className="text-[9px] font-medium text-slate-300">#{row.case_number}</span>}</div><div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-light text-slate-400">{teeth?.length ? <span>Dentes {teeth.join(", ")}</span> : <span>Sem dentes informados</span>}{row.current_stage?.name && <><span>·</span><span>{row.current_stage.name}</span></>}{expanded && row.delivery_date && <><span>·</span><span>Entrega {formatDate(row.delivery_date)}</span></>}</div></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.06em] ${row.status === "em_andamento" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20" : "bg-slate-100 text-slate-400 dark:bg-white/5"}`}>{row.status === "em_andamento" ? "Em andamento" : row.status || "Sem status"}</span></div>{expanded && row.notes && <div className="mt-3 border-t border-slate-50 pt-3 text-[11px] font-light leading-5 text-slate-500 dark:border-white/5 dark:text-slate-400">{row.notes}</div>}</div>;
}

function AppointmentRow({ item }: { item: any }) {
  const date = new Date(item.starts_at);
  return <div className="grid gap-3 rounded-[20px] border border-slate-100 px-4 py-3.5 sm:grid-cols-[82px_1fr_auto] sm:items-center dark:border-white/5"><div><div className="text-sm font-medium tabular-nums text-slate-800 dark:text-white">{date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div><div className="mt-0.5 text-[9px] font-light text-slate-400">{date.toLocaleDateString("pt-BR")}</div></div><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.title || "Atendimento clínico"}</div><div className="mt-1 text-[10px] font-light text-slate-400">{item.doctor?.name || "Profissional não informado"}</div></div><span className="w-fit rounded-full bg-slate-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:bg-white/5">{statusLabel(item.status)}</span></div>;
}

function AlertChip({ tone, label, detail }: { tone: string; label: string; detail: string }) {
  const classes = tone === "danger" ? "border-rose-100 bg-rose-50/70 text-rose-700 dark:border-rose-900/20 dark:bg-rose-950/15 dark:text-rose-300" : tone === "warning" ? "border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-900/20 dark:bg-amber-950/15 dark:text-amber-300" : tone === "positive" ? "border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/20 dark:bg-emerald-950/15 dark:text-emerald-300" : tone === "info" ? "border-sky-100 bg-sky-50/70 text-sky-700 dark:border-sky-900/20 dark:bg-sky-950/15 dark:text-sky-300" : "border-slate-100 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400";
  return <div title={detail} className={`max-w-full rounded-full border px-3 py-2 text-[10px] font-medium ${classes}`}><span>{label}</span>{detail && <span className="ml-1.5 max-w-[280px] truncate font-light opacity-75">· {detail}</span>}</div>;
}

function HeaderSignal({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: boolean }) {
  return <div className="rounded-[20px] border border-slate-100 bg-slate-50/45 p-4 dark:border-white/5 dark:bg-white/[0.02]"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400"><Icon className={`h-3.5 w-3.5 ${accent ? "text-[#1e8f87]" : "text-slate-300"}`} />{label}</div><div className="mt-2 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{value}</div></div>;
}

function SummaryLine({ icon: Icon, label, value, critical = false }: { icon: any; label: string; value?: string | null; critical?: boolean }) {
  return <div className={`rounded-[18px] border p-3.5 ${critical ? "border-rose-100 bg-rose-50/45 dark:border-rose-900/20 dark:bg-rose-950/10" : "border-slate-100 bg-slate-50/35 dark:border-white/5 dark:bg-white/[0.02]"}`}><div className="flex items-center gap-2 text-[10px] font-medium text-slate-400"><Icon className={`h-3.5 w-3.5 ${critical ? "text-rose-500" : "text-[#1e8f87]"}`} />{label}</div><div className={`mt-2 line-clamp-3 text-[11px] font-light leading-5 ${critical ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-300"}`}>{value || "Não informado"}</div></div>;
}

function ClinicalInfoCard({ icon: Icon, label, value, critical = false }: { icon: any; label: string; value?: string | null; critical?: boolean }) {
  return <div className={`min-h-[150px] rounded-[22px] border p-4 ${critical ? "border-rose-100 bg-rose-50/35 dark:border-rose-900/20 dark:bg-rose-950/10" : "border-slate-100 bg-slate-50/35 dark:border-white/5 dark:bg-white/[0.02]"}`}><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${critical ? "text-rose-500" : "text-[#1e8f87]"}`} /><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</div></div><div className={`mt-4 whitespace-pre-line text-sm font-light leading-6 ${critical ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-300"}`}>{value || "Não informado"}</div></div>;
}

function DataField({ label, value }: { label: string; value: string }) { return <div className="rounded-[18px] bg-slate-50/55 px-4 py-3.5 dark:bg-white/[0.025]"><div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-300">{label}</div><div className="mt-1.5 break-words text-sm font-light text-slate-700 dark:text-slate-300">{value}</div></div>; }
function InfoInline({ icon: Icon, value }: { icon: any; value: string }) { return <span className="inline-flex min-w-0 items-center gap-1.5"><Icon className="h-3.5 w-3.5 shrink-0 text-slate-300" /><span className="truncate">{value}</span></span>; }
function SectionCard({ children }: { children: React.ReactNode }) { return <section className="rounded-[28px] border border-slate-200/70 bg-white p-6 md:p-7 dark:border-white/10 dark:bg-slate-950">{children}</section>; }
function MiniMoney({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <div className="rounded-[16px] bg-slate-50/60 px-3 py-3 text-center dark:bg-white/[0.025]"><div className="text-[9px] font-light text-slate-400">{label}</div><div className={`mt-1 truncate text-xs font-medium ${warning ? "text-amber-600" : "text-slate-700 dark:text-slate-200"}`}>{money(value)}</div></div>; }
function MoneyStat({ label, value, icon: Icon, warning = false }: { label: string; value: number; icon: any; warning?: boolean }) { return <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-slate-950"><div className="flex items-center gap-2 text-[10px] font-light text-slate-400"><Icon className={`h-4 w-4 ${warning ? "text-amber-500" : "text-[#1e8f87]"}`} />{label}</div><div className={`mt-4 text-2xl font-light tracking-tight ${warning ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>{money(value)}</div></div>; }
function EmptyState({ icon: Icon, title, text, compact = false }: { icon: any; title: string; text: string; compact?: boolean }) { return <div className={`rounded-[20px] border border-dashed border-slate-200/80 bg-slate-50/30 text-center dark:border-white/10 dark:bg-white/[0.015] ${compact ? "px-4 py-7" : "px-5 py-10"}`}><Icon className="mx-auto h-5 w-5 text-slate-200" /><div className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-300">{title}</div><div className="mx-auto mt-1 max-w-md text-[10px] font-light leading-4 text-slate-400">{text}</div></div>; }

function buildAlerts(patient: any, activeTreatments: number, nextAppointment: any) {
  const alerts: Array<{ tone: string; label: string; detail: string }> = [];
  if (patient.allergies?.trim()) alerts.push({ tone: "danger", label: "Alergia", detail: patient.allergies.trim() });
  if (patient.medications?.trim()) alerts.push({ tone: "info", label: "Medicamentos em uso", detail: patient.medications.trim() });
  if (patient.medical_history?.trim()) alerts.push({ tone: "warning", label: "Histórico médico", detail: patient.medical_history.trim() });
  if (!patient.allergies?.trim() && !patient.medications?.trim() && !patient.medical_history?.trim()) alerts.push({ tone: "muted", label: "Anamnese pendente", detail: "Complete as informações clínicas antes do atendimento." });
  if (activeTreatments > 0) alerts.push({ tone: "positive", label: "Tratamento ativo", detail: `${activeTreatments} em acompanhamento` });
  if (nextAppointment) alerts.push({ tone: "info", label: "Próximo retorno", detail: formatAppointment(nextAppointment) });
  return alerts;
}

function calculateAge(birthDate?: string | null, fallbackAge?: number | null) {
  if (!birthDate) return fallbackAge && fallbackAge > 0 ? `${fallbackAge} anos` : "Idade não informada";
  const birth = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) years -= 1;
  return `${Math.max(0, years)} anos`;
}

function parseTeeth(value: string) { return Array.from(new Set(value.split(/[,;\s]+/).map((item) => Number(item.replace(/\D/g, ""))).filter((item) => Number.isFinite(item) && item > 0))).sort((a, b) => a - b); }
function formatDate(value: string) { return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR"); }
function formatAppointment(item: any) { const date = new Date(item.starts_at); return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; }
function statusLabel(status?: string) { return status === "confirmed" ? "Confirmado" : status === "completed" ? "Concluído" : status === "cancelled" ? "Cancelado" : status === "in_progress" ? "Em atendimento" : "Agendado"; }
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100); }
