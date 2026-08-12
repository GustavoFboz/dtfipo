import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchPatient, fetchPatientCases, reopenCase } from "@/lib/api";
import { StageBadge } from "@/components/StageBadge";
import { CaseDetailDialog } from "@/components/CaseDetailDialog";
import { PatientPhotoUpload } from "@/components/PatientPhotoUpload";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { PatientAttachments } from "@/components/PatientAttachments";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Archive, Activity, Pencil, Plus, Phone, Mail, MapPin, IdCard } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CaseRow } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/patients/$id")({
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const patient = useQuery({ 
    queryKey: ["patient", id], 
    queryFn: () => fetchPatient(id),
    retry: 1,
    meta: { errorMessage: "Erro ao carregar dados do paciente" }
  });
  const cases = useQuery({ 
    queryKey: ["patient_cases", id], 
    queryFn: () => fetchPatientCases(id),
    retry: 1
  });
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const reopen = useMutation({
    mutationFn: (cid: string) => reopenCase(cid),
    onSuccess: () => {
      toast.success("Caso reaberto");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { active, finished } = useMemo(() => {
    const list = cases.data ?? [];
    return {
      active: list.filter((c) => c.status !== "finalizado" && c.status !== "arquivado" && c.status !== "cancelado" && c.status !== "finished"),
      finished: list.filter((c) => c.status === "finalizado" || c.status === "arquivado" || c.status === "finished"),
    };
  }, [cases.data]);

  const p = patient.data;

  if (patient.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-12 w-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-muted-foreground animate-pulse">Carregando dados do paciente...</p>
      </div>
    );
  }

  if (patient.error || (!patient.data && !patient.isFetching)) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-2xl font-light mb-4 text-destructive">Paciente não encontrado</h2>
        <p className="text-muted-foreground mb-6">
          Não foi possível localizar os dados deste paciente ou você não tem permissão para acessá-los.
        </p>
        <Link to="/patients">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar para a lista
          </Button>
        </Link>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="relative pb-24">
        {/* Hero */}
        <div className="relative h-[38vh] min-h-[280px] overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-primary/5">
          {p?.photo_url ? (
            <img src={p.photo_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <div className="h-28 w-28 rounded-full bg-white/70 backdrop-blur grid place-items-center text-4xl font-extralight text-primary">
                {(p?.name?.[0] ?? "?").toUpperCase()}
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white dark:to-slate-950" />
          <Link
            to="/patients"
            className="absolute top-4 left-4 h-10 w-10 rounded-full bg-white/85 backdrop-blur grid place-items-center text-slate-700 shadow-sm active:scale-90 transition-transform"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button
            onClick={() => setEditOpen(true)}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/85 backdrop-blur grid place-items-center text-primary shadow-sm active:scale-90 transition-transform"
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {/* Sheet with info */}
        <div className="relative -mt-10 mx-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.2)] p-5 space-y-4">
          <div>
            <h1 className="text-2xl font-extralight tracking-[-0.02em] text-slate-900 dark:text-slate-100 leading-tight">
              {p?.name ?? "Paciente"}
            </h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {p?.age ? <Chip>{p.age} anos</Chip> : null}
              {p?.gender && <Chip>{p.gender}</Chip>}
              {p?.cpf && <Chip><IdCard className="h-3 w-3 inline mr-1" />{p.cpf}</Chip>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <QuickAction icon={Phone} label="Ligar" disabled={!p?.phone} onClick={() => p?.phone && (window.location.href = `tel:${p.phone}`)} />
            <QuickAction icon={Mail} label="E-mail" disabled={!p?.email} onClick={() => p?.email && (window.location.href = `mailto:${p.email}`)} />
            <QuickAction icon={MapPin} label="Endereço" disabled={!p?.address} onClick={() => p?.address && window.open(`https://maps.google.com/?q=${encodeURIComponent(p.address)}`)} />
          </div>

          {(p?.medical_history || p?.allergies || p?.medications || p?.clinical_notes || p?.notes) && (
            <div className="pt-1 border-t border-slate-100 dark:border-white/5 space-y-2">
              <MobileClinicalField label="Histórico médico" value={p?.medical_history} />
              <MobileClinicalField label="Alergias" value={p?.allergies} />
              <MobileClinicalField label="Medicamentos" value={p?.medications} />
              <MobileClinicalField label="Notas clínicas" value={p?.clinical_notes} />
              <MobileClinicalField label="Observações" value={p?.notes} />
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="mt-4 px-4">
          <PatientAttachments patientId={id} />
        </div>

        {/* Cases */}
        <div className="mt-6 px-4 space-y-6">
          <MobileSection title="Em andamento" icon={Activity} count={active.length}>
            {active.map((c) => (
              <MobileCaseRow key={c.id} c={c} onClick={() => setSelected(c)} />
            ))}
          </MobileSection>
          <MobileSection title="Finalizados" icon={Archive} count={finished.length}>
            {finished.map((c) => (
              <MobileCaseRow key={c.id} c={c} onClick={() => setSelected(c)}
                action={
                  <button
                    onClick={(e) => { e.stopPropagation(); reopen.mutate(c.id); }}
                    className="text-[11px] font-medium text-primary inline-flex items-center gap-1 active:opacity-70"
                  >
                    <RotateCcw className="h-3 w-3" /> Reabrir
                  </button>
                }
              />
            ))}
          </MobileSection>
        </div>

        {p && <PatientFormDialog patient={p} open={editOpen} onOpenChange={setEditOpen} />}
        <NewCaseDialog initialPatientId={id} open={newCaseOpen} onOpenChange={setNewCaseOpen} />

        <button
          onClick={() => setNewCaseOpen(true)}
          aria-label="Novo caso"
          className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-[0_10px_28px_-6px_rgba(31,138,255,0.6)] active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6 stroke-[1.8px]" />
        </button>

        <CaseDetailDialog caseRow={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-[1100px] mx-auto">
      <Link to="/patients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="flex flex-col md:flex-row md:items-start gap-4 mb-8">
        <PatientPhotoUpload patientId={id} photoUrl={p?.photo_url ?? null} patientName={p?.name} size={80} />
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold text-primary tracking-tight">{p?.name ?? "Paciente"}</h1>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {p?.age ? <span>{p.age} anos</span> : null}
            {p?.gender && <span>{p.gender}</span>}
            {p?.cpf && <span className="inline-flex items-center gap-1"><IdCard className="h-3.5 w-3.5" /> {p.cpf}</span>}
            {p?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {p.phone}</span>}
            {p?.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {p.email}</span>}
            {p?.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {p.address}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <NewCaseDialog
            initialPatientId={id}
            trigger={<Button className="gap-2"><Plus className="h-4 w-4" /> Novo caso</Button>}
          />
        </div>
      </div>

      {p && (
        <PatientFormDialog patient={p} open={editOpen} onOpenChange={setEditOpen} />
      )}

      {/* Clinical info */}
      {(p?.medical_history || p?.allergies || p?.medications || p?.clinical_notes || p?.notes) && (
        <section className="mb-8 bg-card rounded-2xl border border-border/60 p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClinicalField label="Histórico médico" value={p?.medical_history} />
          <ClinicalField label="Alergias" value={p?.allergies} />
          <ClinicalField label="Medicamentos em uso" value={p?.medications} />
          <ClinicalField label="Notas clínicas" value={p?.clinical_notes} />
          <ClinicalField label="Observações" value={p?.notes} full />
        </section>
      )}

      <div className="mb-8">
        <PatientAttachments patientId={id} />
      </div>

      <Section
        title="Em andamento"
        icon={Activity}
        count={active.length}
        empty="Nenhum caso em andamento."
      >
        {active.map((c) => (
          <CaseCard key={c.id} c={c} onClick={() => setSelected(c)} />
        ))}
      </Section>

      <div className="h-6" />

      <Section
        title="Finalizados (arquivados)"
        icon={Archive}
        count={finished.length}
        empty="Nenhum caso finalizado ainda."
      >
        {finished.map((c) => (
          <CaseCard
            key={c.id}
            c={c}
            onClick={() => setSelected(c)}
            actionSlot={
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={(e) => { e.stopPropagation(); reopen.mutate(c.id); }}
                disabled={reopen.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir
              </Button>
            }
          />
        ))}
      </Section>

      <CaseDetailDialog caseRow={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function ClinicalField({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function Section({
  title, icon: Icon, count, empty, children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        {title}
        <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
      </h2>
      {count === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed py-8 text-center text-muted-foreground text-sm">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function CaseCard({
  c, onClick, actionSlot,
}: { c: CaseRow; onClick: () => void; actionSlot?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-2xl border border-border/60 p-4 flex flex-col md:flex-row md:items-center gap-3 hover:shadow-[var(--shadow-card)] hover:border-primary/30 transition"
    >
      <div className="flex-1">
        <div className="font-semibold">
          {c.case_type?.name ?? "—"} {c.case_label}{c.tooth_color ? ` · cor ${c.tooth_color.code}` : ""}
        </div>
        <div className="text-xs text-muted-foreground">
          Entrada {c.entry_date} · Entrega {c.delivery_date}
          {c.finished_at && ` · Finalizado ${new Date(c.finished_at).toLocaleDateString("pt-BR")}`}
          {c.reopened_at && ` · Reaberto ${c.reopened_count}x`}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {c.case_stages.map((cs) => <StageBadge key={cs.id} stage={cs.stage} size="sm" />)}
      </div>
      {actionSlot}
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${c.status === "finished" ? "bg-success/15 text-success" : "bg-primary/10 text-primary"}`}>
        {c.status === "finished" ? "Finalizado" : "Ativo"}
      </span>
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-primary/8 text-primary text-[11px] font-medium tracking-tight">
      {children}
    </span>
  );
}

function QuickAction({
  icon: Icon, label, onClick, disabled,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 h-16 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-slate-600 dark:text-slate-300 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
    >
      <Icon className="h-4 w-4 text-primary stroke-[1.6px]" />
      <span className="text-[10.5px] font-medium tracking-tight">{label}</span>
    </button>
  );
}

function MobileClinicalField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-0.5">{label}</div>
      <div className="text-[13px] font-light text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{value}</div>
    </div>
  );
}

function MobileSection({
  title, icon: Icon, count, children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <Icon className="h-3.5 w-3.5 text-primary stroke-[1.6px]" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
        <span className="text-[10px] font-bold text-slate-400 ml-auto">{count}</span>
      </div>
      {count === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 py-6 text-center text-[12px] text-slate-400 font-light">
          Nenhum caso.
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function MobileCaseRow({
  c, onClick, action,
}: { c: CaseRow; onClick: () => void; action?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 p-4 flex items-start gap-3 active:scale-[0.98] transition-transform"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-normal tracking-tight text-slate-900 dark:text-slate-100 truncate">
          {c.case_type?.name ?? "—"} {c.case_label}
        </div>
        <div className="text-[11px] font-light text-slate-400 mt-0.5">
          Entrada {c.entry_date} · Entrega {c.delivery_date}
        </div>
        {c.case_stages.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {c.case_stages.slice(0, 3).map((cs) => (
              <StageBadge key={cs.id} stage={cs.stage} size="sm" />
            ))}
          </div>
        )}
      </div>
      {action}
    </button>
  );
}
