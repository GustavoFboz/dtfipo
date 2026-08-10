import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SkeletonBlock, SkeletonCircle, SkeletonSwap, useListReveal } from "@/components/ui/skeleton-blocks";

import { useState, useMemo, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  fetchCases, fetchStages, finishCase, updateCase, setCurrentStage, deleteCase, fetchProfile
} from "@/lib/api";
import { openFolderLink, copyToClipboard } from "@/lib/folder";
import { normalizeText } from "@/lib/utils";
import { StageBadge } from "./StageBadge";
import { CaseProfessionals } from "./CaseProfessionals";

import { EditCaseDialog } from "./EditCaseDialog";
import { CaseDetailDialog } from "./CaseDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Search, Filter, Check, X, Clock, AlertCircle, MoreHorizontal,
  CheckCircle2, FolderOpen, FolderCog, Pencil, ArrowUp, ArrowDown,
  Copy, Trash2, Link2,
} from "lucide-react";
import { ModelIcon } from "./icons/ModelIcon";
import { ScanIcon } from "./icons/ScanIcon";
import { toast } from "sonner";
import type { CaseRow } from "@/lib/types";

const monthAbbr = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function fmtDayMonth(iso: string) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${monthAbbr[d.getMonth()]}`;
}
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

function ToggleIcon({
  done, onClick, label, Icon,
}: { done: boolean; onClick: (e: React.MouseEvent) => void; label: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title={`${label}: ${done ? "concluído" : "pendente"}`}
      className={`group relative grid place-items-center h-10 w-10 rounded-xl transition-all duration-300 ${
        done ? "bg-emerald-50 text-emerald-600 shadow-sm" : "bg-slate-50 text-slate-300 hover:bg-slate-100 hover:text-slate-400"
      }`}
    >
      <Icon className={`h-5 w-5 transition-transform duration-500 ${done ? "scale-100" : "scale-90 group-hover:scale-100"}`} />
      <div className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white grid place-items-center transition-all duration-500 ${
        done ? "bg-emerald-500 scale-100 rotate-0" : "bg-slate-200 scale-75 opacity-0 group-hover:opacity-100 group-hover:scale-90"
      }`}>
        {done ? <Check className="h-2 w-2 text-white" /> : <X className="h-2 w-2 text-white" />}
      </div>
    </button>
  );
}


type SortKey = "patient" | "entry_date" | "delivery_date" | "stage" | "created_at";
type SortDir = "asc" | "desc";

function SortHeader({
  label, k, sort, setSort,
}: { label: string; k: SortKey; sort: { key: SortKey; dir: SortDir }; setSort: (s: { key: SortKey; dir: SortDir }) => void }) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => setSort({ key: k, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      className={`flex items-center gap-2 group transition-all duration-300 ${active ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}
    >
      <span className="font-black text-[11px] uppercase tracking-wider">{label}</span>
      <div className={`transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 group-hover:opacity-30 group-hover:translate-y-0"}`}>
        {sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </div>
    </button>
  );
}
function SortHeaderMinimal({
  label, k, sort, setSort,
}: { label: string; k: SortKey; sort: { key: SortKey; dir: SortDir }; setSort: (s: { key: SortKey; dir: SortDir }) => void }) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => setSort({ key: k, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      className={`inline-flex items-center gap-1.5 transition-colors ${active ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}
    >
      <span className="font-medium text-[11px] uppercase tracking-[0.14em]">{label}</span>
      {active && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
}



export function CasesTable({
  externalSearch,
  hideToolbar,
  minimal,
  hideSearch,
  activeFilter = "all",
  onFilterChange,
  onYearChange,
  onCountsUpdate,
}: { 
  externalSearch?: string; 
  hideToolbar?: boolean; 
  minimal?: boolean; 
  hideSearch?: boolean;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  onYearChange?: (year: string | null) => void;
  onCountsUpdate?: (counts: Record<string, number>) => void;
} = {}) {
  const qc = useQueryClient();
  const [internalSearch, setSearch] = useState("");
  const search = hideSearch ? "" : (externalSearch !== undefined ? externalSearch : internalSearch);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "late" | "ontime">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "created_at", dir: "desc" });
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [detail, setDetail] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState<CaseRow | null>(null);
  const [folderEdit, setFolderEdit] = useState<{ row: CaseRow; url: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "finish" | "delete">(null);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isCadista = profile?.role === "CADISTA";

  const cases = useQuery({
    queryKey: ["cases", "active"],
    queryFn: () => fetchCases("active"),
    // Realtime (useCasesRealtime) mantém a lista atualizada — sem polling.
    staleTime: 60_000,
  });

  const reveal = useListReveal("cases-table", cases.isLoading);

  const stages = useQuery({ queryKey: ["stages"], queryFn: fetchStages });

  const toggle = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: "model_done" | "scan_done" | "folder_done"; value: boolean }) =>
      updateCase(id, { [field]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });

  const finish = useMutation({
    mutationFn: (id: string) => finishCase(id),
    onSuccess: () => { toast.success("Caso finalizado"); qc.invalidateQueries(); },
  });

  const changeStage = useMutation({
    mutationFn: ({ caseId, stageId }: { caseId: string; stageId: string | null }) => setCurrentStage(caseId, stageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });

  const optimisticRemoveIds = (ids: string[]) => {
    const set = new Set(ids);
    const prevCases = qc.getQueriesData<CaseRow[]>({ queryKey: ["cases"] });
    const prevTasks = qc.getQueryData<CaseRow[]>(["my_tasks"]);
    qc.setQueriesData<CaseRow[]>({ queryKey: ["cases"] }, (old) =>
      Array.isArray(old) ? old.filter((r) => !set.has(r.id)) : old,
    );
    qc.setQueryData<CaseRow[]>(["my_tasks"], (old) =>
      Array.isArray(old) ? old.filter((r) => !set.has(r.id)) : old,
    );
    return { prevCases, prevTasks };
  };
  const rollback = (ctx: any) => {
    if (ctx?.prevCases) for (const [key, data] of ctx.prevCases) qc.setQueryData(key, data);
    if (ctx?.prevTasks !== undefined) qc.setQueryData(["my_tasks"], ctx.prevTasks);
  };

  const remove = useMutation({
    mutationFn: (id: string) => deleteCase(id),
    onMutate: (id: string) => { setDeleting(null); return optimisticRemoveIds([id]); },
    onError: (e: Error, _id, ctx) => { rollback(ctx); toast.error(e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });

  const saveFolder = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => updateCase(id, { folder_url: url || null }),
    onSuccess: () => { toast.success("Pasta salva"); qc.invalidateQueries({ queryKey: ["cases"] }); setFolderEdit(null); },
  });

  const bulkFinish = useMutation({
    mutationFn: async (ids: string[]) => { for (const id of ids) await finishCase(id); },
    onSuccess: () => { toast.success(`${selected.size} caso(s) finalizado(s)`); qc.invalidateQueries(); setSelected(new Set()); setBulkAction(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => { for (const id of ids) await deleteCase(id); },
    onMutate: (ids: string[]) => { setBulkAction(null); setSelected(new Set()); return optimisticRemoveIds(ids); },
    onError: (e: Error, _ids, ctx) => { rollback(ctx); toast.error(e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });


  const toggleSelected = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtered = useMemo<CaseRow[]>(() => {
    const list = cases.data ?? [];
    const f = list.filter((c) => {
      // Apply the new status-based tag filter
      if (activeFilter === "em_andamento") {
        if (c.finished || c.status === "finalizado" || c.status === "arquivado" || c.status === "cancelado") return false;
      } else if (activeFilter === "finalizados") {
        if (!c.finished && c.status !== "finalizado") return false;
      } else if (activeFilter === "arquivados") {
        if (c.status !== "arquivado") return false;
      } else if (activeFilter === "cancelados") {
        if (c.status !== "cancelado") return false;
      }

      if (search) {
        const q = normalizeText(search);
        const haystack = normalizeText([
          c.patient?.name, c.doctor?.name, c.cadista?.name, c.case_type?.name,
          c.tooth_color?.code, c.case_label, c.case_number, c.entry_date, c.delivery_date,
        ].filter(Boolean).join(" "));
        if (!haystack.includes(q)) return false;
      }
      if (stageFilter !== "all") {
        if (stageFilter === "__none__") {
          if (c.current_stage_id) return false;
        } else if (c.current_stage_id !== stageFilter) return false;
      }
      if (statusFilter === "late" && !isLate(c.delivery_date)) return false;
      if (statusFilter === "ontime" && isLate(c.delivery_date)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    f.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      switch (sort.key) {
        case "patient": av = a.patient?.name?.toLowerCase() ?? ""; bv = b.patient?.name?.toLowerCase() ?? ""; break;
        case "entry_date": av = a.entry_date; bv = b.entry_date; break;
        case "delivery_date": av = a.delivery_date; bv = b.delivery_date; break;
        case "stage":
          av = a.current_stage?.position ?? -1;
          bv = b.current_stage?.position ?? -1;
          break;
        case "created_at":
          av = a.created_at ? new Date(a.created_at).getTime() : 0;
          bv = b.created_at ? new Date(b.created_at).getTime() : 0;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // Tie-breaker: full created_at timestamp (most recent first within same day)
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return (bt - at) * (sort.key === "entry_date" || sort.key === "created_at" ? dir : 1);
    });
    return f;
  }, [cases.data, search, stageFilter, statusFilter, sort]);

  useEffect(() => {
    if (!onCountsUpdate || !cases.data) return;
    const list = cases.data;
    const counts = {
      all: list.length,
      em_andamento: list.filter(c => !c.finished && c.status !== "finalizado").length,
      finalizados: list.filter(c => c.finished || c.status === "finalizado").length,
      arquivados: 0, // Placeholder
      cancelados: 0, // Placeholder
    };
    onCountsUpdate(counts);
  }, [cases.data, onCountsUpdate]);

  useEffect(() => {
    if (!onYearChange) return;
    if (filtered.length === 0) {
      onYearChange(null);
      return;
    }
    const years = filtered
      .map((c) => new Date((c.entry_date || c.created_at || "").split('T')[0] + "T00:00:00").getFullYear())
      .filter((y) => !Number.isNaN(y));
    
    if (years.length === 0) {
      onYearChange(null);
      return;
    }

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    
    if (minYear === maxYear) {
      onYearChange(String(minYear));
    } else {
      onYearChange(`${minYear}-${maxYear}`);
    }
  }, [filtered, onYearChange]);

  const handleOpenFolder = async (c: CaseRow) => {
    if (!c.folder_url) {
      setFolderEdit({ row: c, url: "" });
      return;
    }
    const r = await openFolderLink(c.folder_url);
    if (r.ok) return;
    if (r.copied) {
      toast.success("Caminho copiado!", {
        description: r.message,
        duration: 8000,
      });
    } else {
      toast.error(r.message ?? "Não foi possível abrir a pasta.", {
        action: { label: "Copiar link", onClick: () => copyToClipboard(c.folder_url!).then((ok) => ok && toast.success("Link copiado")) },
        duration: 8000,
      });
    }
  };

  if (minimal) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Sticky column header */}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_40px] gap-6 px-2 pb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 border-b border-slate-200/70 dark:border-slate-800/70">
          <SortHeaderMinimal label="Paciente" k="patient" sort={sort} setSort={setSort} />
          <div>Profissionais</div>
          <SortHeaderMinimal label="Entrada" k="entry_date" sort={sort} setSort={setSort} />
          <SortHeaderMinimal label="Entrega" k="delivery_date" sort={sort} setSort={setSort} />
          <SortHeaderMinimal label="Etapa" k="stage" sort={sort} setSort={setSort} />
          <div />
        </div>

        {/* Scrollable list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <SkeletonSwap
          loading={cases.isLoading}
          animateContent={false}
          skeleton={
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <SkeletonCircle className="h-10 w-10 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <SkeletonBlock className="h-3 w-2/5" />
                    <SkeletonBlock className="h-2.5 w-3/5" />
                  </div>
                  <SkeletonBlock className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          }
        >
          <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-400 font-light text-sm">Nenhum caso encontrado.</div>
          ) : filtered.map((c, i) => {
            const late = isLate(c.delivery_date);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetail(c)}
                style={reveal.itemProps(i).style}
                className={`${reveal.itemProps(i).className} grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_40px] gap-6 items-center px-2 py-5 cursor-pointer transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40`}
              >
                {/* Paciente */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500 text-sm font-light overflow-hidden shrink-0">
                    {c.patient?.photo_url ? (
                      <img src={c.patient.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.patient?.name?.[0] ?? "?").toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[17px] font-normal text-slate-900 dark:text-slate-100 truncate leading-tight">
                      {c.patient?.name ?? "—"}
                    </div>
                    <div className="text-[13px] font-light text-slate-400 truncate mt-0.5">
                      {c.case_type?.name ?? "—"}
                      {c.arch ? ` · ${archLabel(c.arch)}` : ""}
                    </div>
                  </div>
                </div>

                {/* Profissionais */}
                <div className="min-w-0">
                  <CaseProfessionals caseRow={c} />
                </div>


                {/* Entrada */}
                <div className={`text-[15px] font-light tabular-nums ${late ? "text-slate-500" : "text-slate-500"}`}>
                  {fmtDayMonth(c.entry_date)}
                </div>

                {/* Entrega */}
                <div className={`text-[15px] font-light tabular-nums ${late ? "text-rose-500" : "text-slate-500"}`}>
                  {fmtDayMonth(c.delivery_date)}
                </div>

                {/* Etapa */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button>
                        <StageBadge stage={c.current_stage} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="rounded-2xl border-slate-100 shadow-2xl p-2 min-w-[200px]">
                      <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 tracking-[0.08em] mb-1">
                        {isCadista ? "Status do Caso" : "Mover Etapa"}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {stages.data?.map((s) => (
                        <DropdownMenuItem key={s.id} onClick={() => changeStage.mutate({ caseId: c.id, stageId: s.id })} className="rounded-xl font-medium text-xs uppercase py-2.5 mt-1">
                          <span className="h-2.5 w-2.5 rounded-full mr-3" style={{ background: s.color }} />
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Menu */}
                <div className="justify-self-end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-8 w-8 grid place-items-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetail(c)}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Ver detalhes
                      </DropdownMenuItem>
                      {!isCadista && (
                        <>
                          <DropdownMenuItem onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar caso
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenFolder(c)}>
                            <FolderOpen className="h-4 w-4 mr-2" /> Abrir pasta
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => finish.mutate(c.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar caso
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleting(c)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir caso
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
          </div>
        </SkeletonSwap>
        </div>


        <CaseDetailDialog caseRow={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
        <EditCaseDialog caseRow={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir caso definitivamente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O caso de <b>{deleting?.patient?.name}</b>
                {deleting?.arch ? ` (${archLabel(deleting.arch)})` : ""} será removido permanentemente.
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

  return (
    <div className="space-y-6">
      {!hideToolbar && (
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Procure por caso, paciente, doutor, data..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 rounded-2xl bg-slate-50 border-slate-100 shadow-none focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all text-sm font-medium"
          />
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-12 rounded-2xl border-slate-100 bg-slate-50 min-w-[180px] font-bold text-xs uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-primary" />
                <SelectValue placeholder="Etapa" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
              <SelectItem value="all" className="text-xs font-bold uppercase tracking-wider">Todas etapas</SelectItem>
              <SelectItem value="__none__" className="text-xs font-bold uppercase tracking-wider text-rose-500">Novo caso</SelectItem>
              {stages.data?.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as never)}>
            <SelectTrigger className="h-12 rounded-2xl border-slate-100 bg-slate-50 min-w-[140px] font-bold text-xs uppercase tracking-wider">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
              <SelectItem value="all" className="text-xs font-bold uppercase tracking-wider">Todos</SelectItem>
              <SelectItem value="late" className="text-xs font-bold uppercase tracking-wider text-rose-500">Atrasados</SelectItem>
              <SelectItem value="ontime" className="text-xs font-bold uppercase tracking-wider text-emerald-500">No prazo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      )}

      {selected.size > 0 && !isCadista && (
        <div className="flex items-center justify-between gap-3 px-6 py-3 bg-slate-900 text-white rounded-[1.5rem] shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-sm font-bold flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-emerald-500 text-[10px] grid place-items-center">
              {selected.size}
            </div>
            Itens selecionados
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="text-white hover:bg-white/10 rounded-xl font-bold text-xs uppercase">
              Limpar
            </Button>
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold text-xs uppercase gap-2" onClick={() => setBulkAction("finish")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
            </Button>
            <Button variant="destructive" size="sm" className="rounded-xl font-bold text-xs uppercase gap-2" onClick={() => setBulkAction("delete")}>
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          </div>
        </div>
      )}

      <div className="hidden md:grid grid-cols-[48px_2.5fr_1.5fr_1fr_1fr_1.5fr_1.5fr_0.5fr] gap-4 px-6 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 items-center border-b border-slate-100 pb-4">
        <div className="flex justify-center">
          {!isCadista && (
            <Checkbox
              checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
              onCheckedChange={(v) => {
                if (v) setSelected(new Set(filtered.map((c) => c.id)));
                else setSelected(new Set());
              }}
              className="rounded-md border-slate-200"
            />
          )}
        </div>
        <SortHeader label="Paciente" k="patient" sort={sort} setSort={setSort} />
        <div>Caso / Cor</div>
        <SortHeader label="Entrada" k="entry_date" sort={sort} setSort={setSort} />
        <SortHeader label="Entrega" k="delivery_date" sort={sort} setSort={setSort} />
        <SortHeader label="Etapa" k="stage" sort={sort} setSort={setSort} />
        <div className="text-center">Checks</div>
        <div></div>
      </div>

      <SkeletonSwap
        loading={cases.isLoading}
        animateContent={false}
        skeleton={
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-200/70 dark:border-neutral-800 bg-card px-5 py-4">
                <SkeletonCircle className="h-11 w-11 shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <SkeletonBlock className="h-3.5 w-1/3" />
                  <SkeletonBlock className="h-2.5 w-1/2" />
                </div>
                <SkeletonBlock className="hidden md:block h-3 w-24" />
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        }
      >
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-200">
            <div className="h-16 w-16 bg-slate-100 rounded-3xl grid place-items-center mx-auto mb-4">
              <Search className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-bold uppercase tracking-wider text-sm">Nenhum caso encontrado.</p>
            <Button variant="link" onClick={() => { setSearch(""); setStageFilter("all"); setStatusFilter("all"); }} className="mt-2 text-primary font-bold">Limpar filtros</Button>
          </div>
        ) : filtered.map((c, i) => {
          const late = isLate(c.delivery_date);
          const isSel = selected.has(c.id);
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetail(c)}
              style={reveal.itemProps(i).style}
              className={`${reveal.itemProps(i).className} group md:grid md:grid-cols-[48px_2.5fr_1.5fr_1fr_1fr_1.5fr_1.5fr_0.5fr] md:items-center gap-4 px-6 py-6 bg-white rounded-[2rem] border-2 transition-all duration-700 cursor-pointer ${
                isSel 
                  ? "border-primary ring-[8px] ring-primary/5 shadow-xl translate-x-1" 
                  : "border-transparent hover:border-slate-100 hover:shadow-[0_20px_50px_rgba(0,0,0,0.04)] hover:scale-[1.008]"
              }`}
            >
              <div onClick={(e) => e.stopPropagation()} className="flex justify-center items-center">
                {!isCadista && (
                  <Checkbox checked={isSel} onCheckedChange={() => toggleSelected(c.id)} className="rounded-md h-5 w-5 border-slate-200" />
                )}
              </div>
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative group/avatar">
                  <div className={`h-12 w-12 rounded-2xl bg-slate-100 border-2 border-white shadow-sm grid place-items-center text-slate-400 text-sm font-black overflow-hidden shrink-0 transition-all duration-500 group-hover/avatar:scale-110 group-hover/avatar:rotate-3 ${isSel ? "border-primary/20" : ""}`}>
                    {c.patient?.photo_url ? (
                      <img src={c.patient.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.patient?.name?.[0] ?? "?").toUpperCase()
                    )}
                  </div>
                  {late && <div className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-rose-500 border-2 border-white rounded-full animate-pulse" />}
                </div>
                <div className="min-w-0">
                  <div
                    className="font-black text-[15px] text-slate-900 truncate block font-outfit"
                  >
                    {c.patient?.name ?? "—"}
                    {c.arch && <span className="ml-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">[{archLabel(c.arch)}]</span>}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                    {c.doctor?.name ?? "—"}
                    {c.sibling_case_id && <Link2 className="h-3 w-3 text-primary/60" />}
                  </div>
                </div>
              </div>

              <div className="text-sm md:py-0 py-2">
                <div className="font-bold text-slate-700">
                  {c.case_type?.abbreviation ?? c.case_type?.name ?? "—"}{" "}
                  {c.case_number != null && <span className="text-slate-400 font-medium ml-1">#{c.case_number}</span>}
                </div>
                {c.tooth_color && (
                  <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Cor {c.tooth_color.code}
                  </div>
                )}
              </div>

              <div className="md:block flex items-center gap-2 text-[13px] font-bold text-slate-500">
                <span className="md:hidden text-xs text-slate-400 uppercase tracking-[0.08em] mr-2">Entrada</span>
                {fmtDayMonth(c.entry_date)}
              </div>

              <div className="md:block flex items-center gap-2">
                <span className="md:hidden text-xs text-slate-400 uppercase tracking-[0.08em] mr-2">Entrega</span>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-black transition-colors ${
                  late ? "bg-rose-50 text-rose-600 shadow-sm" : "bg-emerald-50 text-emerald-600 shadow-sm"
                }`}>
                  {late ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {fmtDayMonth(c.delivery_date)}
                </div>
              </div>

              <div onClick={(e) => e.stopPropagation()} className="flex justify-start md:justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hover:scale-105 transition-transform duration-300">
                      <StageBadge stage={c.current_stage} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="rounded-2xl border-slate-100 shadow-2xl p-2 min-w-[200px]">
                    <DropdownMenuLabel className="text-[10px] font-black uppercase text-slate-400 tracking-[0.08em] mb-1">
                      {isCadista ? "Status do Caso" : "Mover Etapa"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {stages.data?.map((s) => (
                      <DropdownMenuItem key={s.id} onClick={() => changeStage.mutate({ caseId: c.id, stageId: s.id })} className="rounded-xl font-bold text-xs uppercase py-2.5 mt-1">
                        <span className="h-2.5 w-2.5 rounded-full mr-3 shadow-md" style={{ background: s.color }} />
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                <ToggleIcon
                  done={c.model_done}
                  onClick={() => toggle.mutate({ id: c.id, field: "model_done", value: !c.model_done })}
                  label="Modelo"
                  Icon={ModelIcon}
                />
                <ToggleIcon
                  done={c.scan_done}
                  onClick={() => toggle.mutate({ id: c.id, field: "scan_done", value: !c.scan_done })}
                  label="Scan"
                  Icon={ScanIcon}
                />
                <ToggleIcon
                  done={c.folder_done}
                  onClick={() => toggle.mutate({ id: c.id, field: "folder_done", value: !c.folder_done })}
                  label="Pasta"
                  Icon={FolderOpen}
                />
                {!isCadista && (
                  <>
                    <div className="w-[1px] h-4 bg-slate-100 mx-1" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenFolder(c); }}
                      title={c.folder_url ? `Abrir: ${c.folder_url}` : "Configurar link da pasta"}
                      className="grid place-items-center h-9 w-9 rounded-md hover:bg-accent transition text-muted-foreground/70 hover:text-primary"
                    >
                      <FolderCog className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              <div className="md:justify-self-end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDetail(c)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Ver detalhes
                    </DropdownMenuItem>
                    {!isCadista && (
                      <>
                        <DropdownMenuItem onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar caso
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFolderEdit({ row: c, url: c.folder_url ?? "" })}>
                          <FolderCog className="h-4 w-4 mr-2" /> Configurar pasta
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => finish.mutate(c.id)}>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar caso
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleting(c)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir caso
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
      </SkeletonSwap>


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

      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "delete" ? "Excluir casos selecionados?" : "Finalizar casos selecionados?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "delete"
                ? `Esta ação não pode ser desfeita. ${selected.size} caso(s) serão removidos permanentemente.`
                : `${selected.size} caso(s) serão marcados como finalizados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ids = Array.from(selected);
                if (bulkAction === "delete") bulkDelete.mutate(ids);
                else bulkFinish.mutate(ids);
              }}
              className={bulkAction === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {bulkAction === "delete" ? "Excluir definitivamente" : "Finalizar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir caso definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O caso de <b>{deleting?.patient?.name}</b>
              {deleting?.arch ? ` (${archLabel(deleting.arch)})` : ""} será removido permanentemente,
              junto com seu histórico de etapas e componentes.
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

      <Dialog open={!!folderEdit} onOpenChange={(o) => !o && setFolderEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar pasta do caso</DialogTitle>
            <DialogDescription>{folderEdit?.row.patient?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Link da pasta</Label>
            <Input
              autoFocus
              value={folderEdit?.url ?? ""}
              onChange={(e) => setFolderEdit((s) => (s ? { ...s, url: e.target.value } : s))}
              placeholder="\\192.168.1.110\Consultório\Trabalhos\..."
            />
            <p className="text-[11px] text-muted-foreground">
              Aceita caminhos UNC (\\servidor\compartilhamento\...), file:// e http(s)://
            </p>
            {folderEdit?.row.folder_url && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => folderEdit.row.folder_url && copyToClipboard(folderEdit.row.folder_url).then((ok) => ok && toast.success("Link copiado"))}
              >
                <Copy className="h-3.5 w-3.5" /> Copiar link atual
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderEdit(null)}>Cancelar</Button>
            <Button
              onClick={() => folderEdit && saveFolder.mutate({ id: folderEdit.row.id, url: folderEdit.url })}
              disabled={saveFolder.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
