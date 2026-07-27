import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCases, fetchPhases, fetchStages, setCurrentStage, setCurrentPhase, finishCase, deleteCase } from "@/lib/api";
import { CaseDetailDialog } from "./CaseDetailDialog";
import { EditCaseDialog } from "./EditCaseDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronRight, Sparkles, AlertCircle, Clock, MoreVertical, Pencil, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CaseRow, Phase, Stage } from "@/lib/types";

function fmtBR(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isLate(deliveryISO: string) {
  const d = new Date(deliveryISO + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}
const archLabel = (a: string | null) =>
  a === "superior" ? "Sup" : a === "inferior" ? "Inf" : a === "both" ? "Sup+Inf" : "";

const NEW_KEY = "__new__";

export function PhasesBoard() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<CaseRow | null>(null);
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState<CaseRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const cases = useQuery({ queryKey: ["cases", "active"], queryFn: () => fetchCases("active") });
  const phases = useQuery({ queryKey: ["phases"], queryFn: fetchPhases });
  const stages = useQuery({ queryKey: ["stages"], queryFn: fetchStages });

  const stagesByPhase = useMemo(() => {
    const m = new Map<string, Stage[]>();
    (stages.data ?? []).forEach((s) => {
      const k = s.phase_id ?? "__unassigned__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    });
    return m;
  }, [stages.data]);

  // Group cases by phase (uses current_phase_id, falls back to current_stage.phase_id)
  const casesByPhase = useMemo(() => {
    const m = new Map<string, CaseRow[]>();
    m.set(NEW_KEY, []);
    (phases.data ?? []).forEach((p) => m.set(p.id, []));
    (cases.data ?? []).forEach((c) => {
      const phaseId = c.current_phase_id ?? c.current_stage?.phase_id ?? null;
      if (phaseId && m.has(phaseId)) m.get(phaseId)!.push(c);
      else m.get(NEW_KEY)!.push(c);
    });
    return m;
  }, [cases.data, phases.data]);

  const moveStage = useMutation({
    mutationFn: ({ caseId, stageId }: { caseId: string; stageId: string | null }) => setCurrentStage(caseId, stageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });
  const movePhase = useMutation({
    mutationFn: ({ caseId, phaseId }: { caseId: string; phaseId: string | null }) => setCurrentPhase(caseId, phaseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });
  const finish = useMutation({
    mutationFn: (id: string) => finishCase(id),
    onSuccess: () => { toast.success("Caso finalizado"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCase(id),
    onMutate: (id: string) => {
      setDeleting(null);
      const prev = qc.getQueriesData<any[]>({ queryKey: ["cases"] });
      qc.setQueriesData<any[]>({ queryKey: ["cases"] }, (old) =>
        Array.isArray(old) ? old.filter((r) => r.id !== id) : old,
      );
      return { prev };
    },
    onError: (e: Error, _id, ctx: any) => {
      if (ctx?.prev) for (const [k, d] of ctx.prev) qc.setQueryData(k, d);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });


  // when dropped on a phase column → move case to that phase directly
  const handleDrop = (phaseKey: string) => {
    if (!dragId) return;
    movePhase.mutate({ caseId: dragId, phaseId: phaseKey === NEW_KEY ? null : phaseKey });
    setDragId(null);
  };

  const columns: Array<{ key: string; phase: Phase | null }> = [
    { key: NEW_KEY, phase: null },
    ...(phases.data ?? []).map((p) => ({ key: p.id, phase: p })),
  ];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3 min-w-max">
          {columns.map(({ key, phase }) => {
            const list = casesByPhase.get(key) ?? [];
            const color = phase?.color ?? "#22c55e";
            const name = phase?.name ?? "Novo caso";
            return (
              <div
                key={key}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={() => handleDrop(key)}
                className="w-[260px] shrink-0 rounded-2xl bg-muted/40 border border-border/60 flex flex-col"
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <h3 className="font-semibold text-sm truncate">{name}</h3>
                  </div>
                  <span className="text-[11px] text-muted-foreground bg-card px-1.5 py-0.5 rounded-full font-bold">
                    {list.length}
                  </span>
                </div>

                <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto min-h-[80px]">
                  {list.length === 0 && (
                    <div className="text-[11px] text-muted-foreground/60 text-center py-4">
                      Solte um caso aqui
                    </div>
                  )}
                  {list.map((c) => {
                    const late = isLate(c.delivery_date);
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setDetail(c)}
                        className="bg-card rounded-xl p-2.5 border border-border/60 hover:border-primary/40 hover:shadow-sm transition cursor-grab active:cursor-grabbing"
                        style={{ borderLeft: `3px solid ${c.current_stage?.color ?? "#22c55e"}` }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="h-7 w-7 rounded-full bg-muted grid place-items-center text-[10px] overflow-hidden shrink-0">
                            {c.patient?.photo_url ? (
                              <img src={c.patient.photo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (c.patient?.name?.[0] ?? "?").toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold truncate">
                              {c.patient?.name ?? "—"}
                              {c.arch && <span className="ml-1 text-[9px] font-bold text-primary/70">[{archLabel(c.arch)}]</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {c.case_type?.abbreviation ?? c.case_type?.name ?? "—"}
                              {c.case_label && ` ${c.case_label}`}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${late ? "text-destructive" : "text-success"}`}>
                            {late ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {fmtBR(c.delivery_date)}
                          </span>
                          {c.current_stage ? (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold truncate max-w-[110px]"
                              style={{ background: c.current_stage.color, color: "#fff" }}
                            >
                              {c.current_stage.name}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-success text-success-foreground inline-flex items-center gap-0.5">
                              <Sparkles className="h-2.5 w-2.5" /> Novo
                            </span>
                          )}
                        </div>

                        {/* manual move dropdown + actions menu */}
                        <div className="mt-1.5 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5">
                                Mover <ChevronRight className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-[60vh] overflow-y-auto">
                              <DropdownMenuItem onClick={() => moveStage.mutate({ caseId: c.id, stageId: null })}>
                                <span className="h-2.5 w-2.5 rounded-full mr-2 bg-success" /> Novo caso
                              </DropdownMenuItem>
                              {(phases.data ?? []).map((p) => {
                                const ps = stagesByPhase.get(p.id) ?? [];
                                if (ps.length === 0) return null;
                                return (
                                  <div key={p.id}>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">{p.name}</DropdownMenuLabel>
                                    {ps.map((s) => (
                                      <DropdownMenuItem key={s.id} onClick={() => moveStage.mutate({ caseId: c.id, stageId: s.id })}>
                                        <span className="h-2.5 w-2.5 rounded-full mr-2" style={{ background: s.color }} />
                                        {s.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </div>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="text-muted-foreground hover:text-primary p-0.5 rounded hover:bg-accent">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(c)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => finish.mutate(c.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Finalizar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleting(c)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CaseDetailDialog
        caseRow={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
      />

      <EditCaseDialog
        caseRow={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir caso definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O caso de <b>{deleting?.patient?.name}</b> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && remove.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
