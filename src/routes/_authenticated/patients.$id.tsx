import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { fetchPatient, fetchPatientCases, reopenCase } from "@/lib/api";
import { StageBadge } from "@/components/StageBadge";
import { CaseDetailDialog } from "@/components/CaseDetailDialog";
import { PatientPhotoUpload } from "@/components/PatientPhotoUpload";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { PatientAttachments } from "@/components/PatientAttachments";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Archive, Activity, Pencil, Plus, Phone, Mail, MapPin, IdCard, Calendar, FileText, ClipboardList, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CaseRow } from "@/lib/types";

import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/patients/$id")({
  component: PatientDetailPage,
});

function PatientDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const searchParams = Route.useSearch() as any;
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  useEffect(() => {
    document.title = "Carregando Paciente...";
  }, [id]);

  const [restoredFromUrl, setRestoredFromUrl] = useState(false);

  const patient = useQuery({ 
    queryKey: ["patient", id], 
    queryFn: async () => {
      const data = await fetchPatient(id);
      if (data) {
        document.title = `${data.name} | DentalFlow`;
      }
      return data;
    },
    staleTime: 0,
    retry: 1,
  });
  
  const cases = useQuery({ 
    queryKey: ["patient_cases", id], 
    queryFn: () => fetchPatientCases(id),
    retry: 1,
  });

  // Restore selected case from URL on mount or param change
  useEffect(() => {
    if (restoredFromUrl || !cases.data) return;
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get("case");
    if (caseId) {
      const c = cases.data.find(item => item.id === caseId);
      if (c) {
        setSelectedCase(c);
        setRestoredFromUrl(true);
      }
    }
  }, [cases.data, restoredFromUrl]);

  const reopen = useMutation({
    mutationFn: (cid: string) => reopenCase(cid),
    onSuccess: () => {
      toast.success("Caso reaberto");
      qc.invalidateQueries({ queryKey: ["patient_cases", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { activeCases, historyCases } = useMemo(() => {
    const list = cases.data ?? [];
    return {
      activeCases: list.filter((c) => !["finalizado", "arquivado", "cancelado", "finished"].includes(c.status)),
      historyCases: list.filter((c) => ["finalizado", "arquivado", "finished"].includes(c.status)),
    };
  }, [cases.data]);

  if (patient.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-primary/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-slate-900 dark:text-slate-100 font-light tracking-tight">Carregando perfil</p>
          <p className="text-slate-400 text-[12px] font-light">Sincronizando registros clínicos...</p>
        </div>
      </div>
    );
  }

  if (patient.isError) {
    return (
      <div className="p-12 text-center max-w-md mx-auto animate-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/10 rounded-full grid place-items-center mx-auto mb-6">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-light mb-2 text-slate-900 dark:text-slate-100">Falha na conexão</h2>
        <p className="text-slate-500 text-sm mb-8 font-light">
          Houve um problema ao sincronizar com o servidor. Verifique sua conexão.
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="outline" className="rounded-full px-8" onClick={() => patient.refetch()}>
            Tentar novamente
          </Button>
          <Button variant="ghost" className="rounded-full px-8" onClick={() => navigate({ to: "/patients" })}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à lista
          </Button>
        </div>
      </div>
    );
  }

  if (!patient.data) {
    return (
      <div className="p-12 text-center max-w-md mx-auto animate-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-slate-50 dark:bg-white/5 rounded-full grid place-items-center mx-auto mb-6">
          <FileText className="h-8 w-8 text-slate-300" />
        </div>
        <h2 className="text-2xl font-light mb-2 text-slate-900 dark:text-slate-100">Paciente não encontrado</h2>
        <p className="text-slate-500 text-sm mb-8 font-light">
          Este registro pode ter sido removido ou você não tem permissão para visualizá-lo.
        </p>
        <Button variant="outline" className="rounded-full px-8" onClick={() => navigate({ to: "/patients" })}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à lista
        </Button>
      </div>
    );
  }

  const p = patient.data;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto w-full px-4 md:px-8 py-8 md:py-10 max-w-[1200px]"
    >
      {/* Navigation Header */}
      <div className="flex items-center gap-4 mb-10">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full h-10 w-10 hover:bg-slate-100 dark:hover:bg-white/10"
          onClick={() => navigate({ to: "/patients" })}
        >
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </Button>
        <div className="h-6 w-[1px] bg-slate-200 dark:bg-white/10" />
        <span className="text-sm font-light text-slate-400">Perfil do Paciente</span>
      </div>

      <Tabs defaultValue="perfil" className="space-y-12">
        {/* Hero Section & Tabs Trigger */}
        <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
          <div className="relative group">
            <PatientPhotoUpload 
              patientId={id} 
              photoUrl={p.photo_url} 
              patientName={p.name} 
              size={120} 
            />
          </div>
          
          <div className="flex-1 space-y-6">
            <div>
              <h1 className="text-4xl font-light text-slate-900 dark:text-slate-100 tracking-tight mb-2">
                {p.name}
              </h1>
              <div className="flex flex-wrap gap-4 text-sm text-slate-500 font-light">
                {p.age && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {p.age} anos</span>}
                {p.cpf && <span className="flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5" /> {p.cpf}</span>}
                {p.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {p.phone}</span>}
                {p.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {p.email}</span>}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <TabsList className="bg-transparent h-auto p-0 gap-8 border-b border-transparent">
                <TabsTrigger value="perfil" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2 text-sm font-light uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white transition-all">
                  Perfil
                </TabsTrigger>
                <TabsTrigger value="casos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2 text-sm font-light uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white transition-all">
                  Casos
                </TabsTrigger>
                <TabsTrigger value="anexos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2 text-sm font-light uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white transition-all">
                  Documentos
                </TabsTrigger>
              </TabsList>

              <div className="flex gap-3">
                <Button className="rounded-full px-6 shadow-lg shadow-primary/20" onClick={() => setNewCaseOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Novo Caso
                </Button>
                <Button variant="outline" className="rounded-full px-6" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Editar Perfil
                </Button>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <TabsContent value="perfil" className="m-0 focus-visible:outline-none">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-12"
            >
              <div className="space-y-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Dados Pessoais</h3>
                <div className="space-y-6 bg-slate-50/50 dark:bg-white/5 rounded-3xl p-8 border border-slate-100 dark:border-white/5">
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nome Completo</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200">{p.name}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">CPF</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200">{p.cpf || "Não informado"}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Telefone</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200">{p.phone || "Não informado"}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">E-mail</div>
                        <div className="text-sm text-slate-700 dark:text-slate-200">{p.email || "Não informado"}</div>
                      </div>
                   </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Histórico Clínico</h3>
                <div className="space-y-6 bg-slate-50/50 dark:bg-white/5 rounded-3xl p-8 border border-slate-100 dark:border-white/5">
                  <ClinicalItem label="Alergias" value={p.allergies} highlight />
                  <ClinicalItem label="Medicamentos" value={p.medications} />
                  <ClinicalItem label="Histórico Médico" value={p.medical_history} />
                  <ClinicalItem label="Notas Gerais" value={p.notes} />
                  {!p.medical_history && !p.allergies && !p.medications && !p.notes && (
                    <p className="text-xs text-slate-400 font-light italic text-center py-4">Nenhum registro clínico detalhado.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="casos" className="m-0 focus-visible:outline-none">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              {/* Active Cases */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <Activity className="h-3 w-3 text-primary" /> Casos em Andamento
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                    {activeCases.length}
                  </span>
                </div>

                <div className="space-y-px border-y border-slate-100 dark:border-white/5">
                  {activeCases.map(c => (
                    <CaseRowItem key={c.id} c={c} onClick={() => setSelectedCase(c)} />
                  ))}
                  {activeCases.length === 0 && (
                    <div className="py-12 text-center text-slate-400 font-light text-sm italic">
                      Nenhum caso ativo no momento.
                    </div>
                  )}
                </div>
              </div>

              {/* History Cases */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <Archive className="h-3 w-3" /> Histórico de Casos
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                    {historyCases.length}
                  </span>
                </div>

                <div className="space-y-px border-y border-slate-100 dark:border-white/5">
                  {historyCases.map(c => (
                    <CaseRowItem 
                      key={c.id} 
                      c={c} 
                      isHistory 
                      onClick={() => setSelectedCase(c)} 
                      onReopen={() => reopen.mutate(c.id)}
                    />
                  ))}
                  {historyCases.length === 0 && (
                    <div className="py-12 text-center text-slate-400 font-light text-sm italic">
                      O histórico de casos finalizados aparecerá aqui.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="anexos" className="m-0 focus-visible:outline-none">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Documentos e Exames</h3>
              <PatientAttachments patientId={id} />
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      {/* Dialogs */}
      <PatientFormDialog patient={p} open={editOpen} onOpenChange={setEditOpen} />
      <NewCaseDialog initialPatientId={id} open={newCaseOpen} onOpenChange={setNewCaseOpen} />
      <CaseDetailDialog caseRow={selectedCase} open={!!selectedCase} onOpenChange={(o) => {
        if (!o) {
          setSelectedCase(null);
          // CaseDetailDialog now handles URL cleanup itself, but we ensure consistency
        }
      }} />
      
      
    </motion.div>
  );
}

function ClinicalItem({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className={`text-sm font-light leading-relaxed ${highlight ? "text-red-500 dark:text-red-400 font-medium" : "text-slate-600 dark:text-slate-300"}`}>
        {value}
      </div>
    </div>
  );
}

function CaseRowItem({ 
  c, 
  onClick, 
  isHistory, 
  onReopen 
}: { 
  c: CaseRow; 
  onClick: () => void; 
  isHistory?: boolean;
  onReopen?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className="group py-8 flex items-center gap-8 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors border-b last:border-b-0 border-slate-100 dark:border-white/5"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-lg font-light text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors">
            {c.case_type?.name || "Tipo não definido"} {c.case_label}
          </span>
          {c.tooth_color && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 uppercase tracking-wider">
              Cor {c.tooth_color.code}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 font-light tracking-wide flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Entrada: {c.entry_date}</span>
          {isHistory && c.finished_at && (
            <span className="flex items-center gap-1.5">
              <ClipboardList className="h-3 w-3" /> Finalizado: {new Date(c.finished_at).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex gap-1">
          {c.case_stages.slice(0, 2).map((cs) => (
            <StageBadge key={cs.id} stage={cs.stage} size="sm" />
          ))}
          {c.case_stages.length > 2 && (
            <span className="text-[9px] text-slate-400 font-mono self-center">+{c.case_stages.length - 2}</span>
          )}
        </div>
        
        {isHistory ? (
          <Button 
            variant="ghost" 
            size="sm" 
            className="rounded-full text-[11px] font-light h-8 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onReopen?.(); }}
          >
            <RotateCcw className="h-3 w-3" /> Reabrir
          </Button>
        ) : (
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        )}
      </div>
    </div>
  );
}
