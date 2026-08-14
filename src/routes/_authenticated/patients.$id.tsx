import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, useEffect } from "react";
import { fetchPatient, fetchPatientCases, reopenCase } from "@/lib/api";
import { StageBadge } from "@/components/StageBadge";
import { CaseDetailDialog } from "@/components/CaseDetailDialog";
import { PatientPhotoUpload } from "@/components/PatientPhotoUpload";
import { PatientFormDialog } from "@/components/PatientFormDialog";
import { PatientAttachments } from "@/components/PatientAttachments";
import { NewCaseDialog } from "@/components/NewCaseDialog";
import { Button } from "@/components/ui/button";
import { 
  X, RotateCcw, Archive, Activity, Pencil, Plus, Phone, Mail, 
  MapPin, IdCard, Calendar, FileText, ClipboardList, AlertTriangle, 
  ChevronDown, ChevronUp, User, Clock
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CaseRow, Patient } from "@/lib/types";
import { FloatingLog } from "@/components/FloatingLog";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/patients/$id")({
  component: PatientDetailPanel,
});

function PatientDetailPanel() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [showAllInfo, setShowAllInfo] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => {
      const newLogs = [...prev, `${new Date().toLocaleTimeString()} - ${msg}`];
      return newLogs.slice(-50);
    });
  }, []);

  const patient = useQuery({ 
    queryKey: ["patient", id], 
    queryFn: async () => {
      const data = await fetchPatient(id);
      if (data) addLog(`Dados de ${data.name} carregados`);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  
  const cases = useQuery({ 
    queryKey: ["patient_cases", id], 
    queryFn: () => fetchPatientCases(id),
  });

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

  const handleClose = () => {
    navigate({ to: "/patients" });
  };

  const p = patient.data;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-start pointer-events-none">
        {/* Overlay backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] pointer-events-auto"
        />

        {/* Sliding Panel - Left to Right */}
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="relative h-full w-full max-w-[600px] bg-white dark:bg-[#0F172A] shadow-2xl pointer-events-auto flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-8 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-white/5">
            <h2 className="text-sm font-light uppercase tracking-widest text-slate-400">Perfil do Paciente</h2>
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
              <X className="h-5 w-5 text-slate-400" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {patient.isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : !p ? (
              <div className="p-12 text-center text-slate-400 font-light">Paciente não encontrado.</div>
            ) : (
              <div className="p-8 space-y-10">
                {/* Hero section */}
                <div className="flex items-center gap-8">
                  <div className="relative group shrink-0">
                    <PatientPhotoUpload 
                      patientId={id} 
                      photoUrl={p.photo_url} 
                      patientName={p.name} 
                      size={120} 
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-light text-slate-900 dark:text-white tracking-tight mb-2 truncate">{p.name}</h1>
                    <div className="flex items-center gap-2 text-sm text-slate-500 font-light">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Entrada: {p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "Não informada"}</span>
                    </div>
                  </div>
                </div>

                {/* Information blocks */}
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <InfoItem icon={<Phone className="h-4 w-4" />} label="Telefone" value={p.phone || "N/A"} />
                    <InfoItem icon={<Mail className="h-4 w-4" />} label="Email" value={p.email || "N/A"} />
                    <InfoItem icon={<IdCard className="h-4 w-4" />} label="CPF" value={p.cpf || "N/A"} />
                    <InfoItem icon={<Calendar className="h-4 w-4" />} label="Idade" value={p.age ? `${p.age} anos` : "N/A"} />
                  </div>

                  {/* Expanded info */}
                  <AnimatePresence>
                    {showAllInfo && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-slate-100 dark:border-white/5 pt-6 space-y-6"
                      >
                        <div className="grid grid-cols-2 gap-6">
                          <InfoItem icon={<MapPin className="h-4 w-4" />} label="Endereço" value={p.address || "N/A"} />
                          <InfoItem icon={<User className="h-4 w-4" />} label="Gênero" value={p.gender || "N/A"} />
                          <InfoItem icon={<Calendar className="h-4 w-4" />} label="Nascimento" value={p.birth_date || "N/A"} />
                          <InfoItem icon={<IdCard className="h-4 w-4" />} label="RG" value={p.rg || "N/A"} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button 
                    variant="ghost" 
                    className="w-full h-10 rounded-xl text-slate-400 hover:text-primary transition-colors text-xs uppercase tracking-widest font-medium gap-2"
                    onClick={() => setShowAllInfo(!showAllInfo)}
                  >
                    {showAllInfo ? (
                      <>Ocultar informações <ChevronUp className="h-4 w-4" /></>
                    ) : (
                      <>Ver mais informações <ChevronDown className="h-4 w-4" /></>
                    )}
                  </Button>
                </div>

                {/* Tabs Manager */}
                <Tabs defaultValue="casos" className="w-full">
                  <TabsList className="w-full bg-slate-50 dark:bg-white/5 rounded-2xl p-1 h-14 border border-slate-100 dark:border-white/5 mb-8">
                    <TabsTrigger 
                      value="casos" 
                      className="flex-1 rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm text-slate-400 data-[state=active]:text-primary transition-all text-xs uppercase tracking-widest font-semibold"
                    >
                      Casos
                    </TabsTrigger>
                    <TabsTrigger 
                      value="prontuario" 
                      className="flex-1 rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm text-slate-400 data-[state=active]:text-primary transition-all text-xs uppercase tracking-widest font-semibold"
                    >
                      Prontuário
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="casos" className="m-0 focus-visible:outline-none space-y-10">
                    {/* Active Cases */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                          <Activity className="h-3.5 w-3.5 text-primary" /> Em andamento
                        </h3>
                        <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold">
                          {activeCases.length}
                        </div>
                      </div>
                      <div className="space-y-4">
                        {activeCases.map(c => (
                          <CaseCard key={c.id} c={c} onClick={() => setSelectedCase(c)} />
                        ))}
                        {activeCases.length === 0 && (
                          <div className="py-10 text-center text-slate-400 font-light text-sm italic bg-slate-50/50 dark:bg-white/5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                            Nenhum caso em andamento.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Finished Cases */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                          <Archive className="h-3.5 w-3.5" /> Finalizados
                        </h3>
                        <div className="bg-slate-100 dark:bg-white/5 text-slate-500 px-3 py-1 rounded-full text-[10px] font-bold">
                          {historyCases.length}
                        </div>
                      </div>
                      <div className="space-y-4">
                        {historyCases.map(c => (
                          <CaseCard 
                            key={c.id} 
                            c={c} 
                            isHistory 
                            onClick={() => setSelectedCase(c)} 
                            onReopen={() => reopen.mutate(c.id)}
                          />
                        ))}
                        {historyCases.length === 0 && (
                          <div className="py-10 text-center text-slate-400 font-light text-sm italic bg-slate-50/50 dark:bg-white/5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                            Nenhum caso finalizado.
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="prontuario" className="m-0 focus-visible:outline-none space-y-8">
                    <div className="space-y-6">
                      <ProntuarioSection title="Histórico Médico" content={p.medical_history} />
                      <ProntuarioSection title="Alergias" content={p.allergies} highlight />
                      <ProntuarioSection title="Medicamentos" content={p.medications} />
                      <ProntuarioSection title="Notas Clínicas" content={p.clinical_notes} />
                      <ProntuarioSection title="Notas Gerais" content={p.notes} />
                      {!p.medical_history && !p.allergies && !p.medications && !p.clinical_notes && !p.notes && (
                        <div className="py-20 text-center text-slate-400 font-light italic bg-slate-50/50 dark:bg-white/5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                          Prontuário vazio. Adicione informações no perfil.
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          {p && (
            <div className="p-8 bg-slate-50 dark:bg-[#0A0E17] border-t border-slate-100 dark:border-white/5 flex gap-4">
              <Button className="flex-1 h-12 rounded-2xl gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95" onClick={() => setNewCaseOpen(true)}>
                <Plus className="h-4 w-4" /> Novo Caso
              </Button>
              <Button variant="outline" className="flex-1 h-12 rounded-2xl gap-2 border-slate-200 dark:border-white/10 dark:bg-white/5 transition-all active:scale-95" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Editar Perfil
              </Button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Dialogs */}
      <PatientFormDialog patient={p || undefined} open={editOpen} onOpenChange={setEditOpen} />
      <NewCaseDialog initialPatientId={id} open={newCaseOpen} onOpenChange={setNewCaseOpen} />
      <CaseDetailDialog caseRow={selectedCase} open={!!selectedCase} onOpenChange={(o) => !o && setSelectedCase(null)} />
      
      <FloatingLog title="Log de Eventos" logs={logs} />
    </AnimatePresence>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-200 font-light truncate">{value}</div>
    </div>
  );
}

function ProntuarioSection({ title, content, highlight }: { title: string; content?: string | null; highlight?: boolean }) {
  if (!content) return null;
  return (
    <div className="space-y-3 p-6 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] border border-slate-100 dark:border-white/5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{title}</h4>
      <p className={cn(
        "text-sm font-light leading-relaxed",
        highlight ? "text-red-500 dark:text-red-400 font-medium" : "text-slate-600 dark:text-slate-300"
      )}>
        {content}
      </p>
    </div>
  );
}

function CaseCard({ 
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
      className="group p-6 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-3xl cursor-pointer hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors">
              {c.case_type?.name || "Caso"} {c.case_label}
            </div>
            <div className="text-[10px] text-slate-400 font-light tracking-wider uppercase">
              Cor {c.tooth_color?.code || "N/A"}
            </div>
          </div>
        </div>
        <StageBadge stage={c.current_stage} size="sm" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] text-slate-400 font-light">
          <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {c.entry_date}</span>
          {isHistory && c.finished_at && (
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {new Date(c.finished_at).toLocaleDateString("pt-BR")}</span>
          )}
        </div>
        
        {isHistory && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 rounded-full text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary gap-1.5"
            onClick={(e) => { e.stopPropagation(); onReopen?.(); }}
          >
            <RotateCcw className="h-3 w-3" /> Reabrir
          </Button>
        )}
      </div>
    </div>
  );
}
