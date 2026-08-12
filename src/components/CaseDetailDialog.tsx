import { onAttachmentFocus } from "@/lib/attachment-focus";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

import { Calendar, Clock, X, Download, Printer, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CaseRow } from "@/lib/types";
import { TeethSelector, IMPLANT_COLOR_SCALE } from "./TeethSelector";
import { ArcadaModeToggle, type ArcadaMode } from "./ArcadaModeToggle";
import { sortTeeth } from "@/lib/teeth";
import { StageBadge } from "./StageBadge";
import { CaseAttachments } from "./CaseAttachments";
import { CaseComments } from "./CaseComments";
import { fetchCaseActivity } from "@/lib/case-activity";
import { fetchImplantSystems, fetchCases, updateCase, fetchProfile } from "@/lib/api";
import { downloadCaseZip, downloadCaseSectionZip } from "@/lib/download-case";
import { printWorkOrder } from "@/lib/work-order";
import { PrintNoteButton } from "@/components/PrintNoteButton";
import { CaseWorkflowBar } from "./CaseWorkflowBar";
import { useBlockedActionDialog } from "@/components/BlockedActionDialog";
import { useStageRequirements } from "@/lib/stage-requirements";
import { CaseToothStockUsagePanel } from "./CaseToothStockUsagePanel";
import { PendingImplantToothPicker } from "./PendingImplantToothPicker";
import { CaseImplantTeethPanel } from "./CaseImplantTeethPanel";
// CaseFinancialParticipantsPanel removido — módulo Financeiro desativado.
import { fetchCaseImplantTeeth } from "@/lib/implants";
import { fetchWorkflowSettings, fetchWorkflowStages } from "@/lib/workflow";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { CaseAttachmentKind } from "@/lib/api";
import { markDeleted, subscribeEntity } from "@/lib/optimistic";
function PatientAvatarView({
  photoUrl, name,
}: { photoUrl: string | null; name: string }) {
  return (
    <div className="relative h-[104px] w-[104px] shrink-0 rounded-full bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 overflow-hidden grid place-items-center">
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-4xl font-light text-slate-400 dark:text-slate-500">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

type TabKey = "detalhes" | "galeria" | "html" | "scans" | "modelos" | "confeccao" | "comentarios";

type TabDefinition = {
  key: TabKey;
  label: string;
  hiddenFor?: string[];
};

const OPEN_CASE_KEY = "case_dialog:open";

const TABS: TabDefinition[] = [
  { key: "detalhes", label: "Detalhes" },
  { key: "galeria", label: "Galeria" },
  { key: "scans", label: "Escaneamentos" },
  { key: "html", label: "HTML" },
  { key: "modelos", label: "Modelos" },
  { key: "confeccao", label: "Elementos" },
  { key: "comentarios", label: "Chat", hiddenFor: ["SOLICITANTE"] },
];

function isTabKey(value: string | null): value is TabKey {
  return !!value && TABS.some((t) => t.key === value);
}

function readHashParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function readHashTab(caseId?: string): TabKey | null {
  const params = readHashParams();
  const hashCaseId = params.get("case");
  const hashTab = params.get("tab");
  if (caseId && hashCaseId && hashCaseId !== caseId) return null;
  return isTabKey(hashTab) ? hashTab : null;
}

function readSavedTab(caseId: string): TabKey | null {
  try {
    const saved = localStorage.getItem(`case_tab:${caseId}`);
    return isTabKey(saved) ? saved : null;
  } catch {
    return null;
  }
}

function restoredTabFor(caseId: string): TabKey {
  return readHashTab(caseId) ?? readSavedTab(caseId) ?? "detalhes";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function isOverdue(deliveryDate: string, finishedAt: string | null): boolean {
  if (finishedAt) return false;
  const d = new Date(deliveryDate + "T23:59:59");
  return d.getTime() < Date.now();
}

function Field({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm leading-tight min-w-0">
      <span className="text-foreground/80 font-medium shrink-0">{label} :</span>
      <span className={`min-w-0 truncate ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value ?? "—"}</span>
    </div>
  );
}


function MobileFieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2">{title}</div>
      <div className="rounded-2xl border border-slate-100 dark:border-neutral-900 bg-white dark:bg-neutral-950 divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
    </div>
  );
}

function MobileField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-[12px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-light">{label}</span>
      <span className="text-[13px] text-slate-900 dark:text-slate-100 font-normal text-right truncate max-w-[60%]">
        {value ?? "—"}
      </span>
    </div>
  );
}

function MobileTextBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2">{label}</div>
      <div className="text-[13px] text-slate-700 dark:text-slate-300 font-light whitespace-pre-wrap leading-relaxed">
        {value?.trim() || "—"}
      </div>
    </div>
  );
}

const TAB_TO_KIND: Partial<Record<TabKey, CaseAttachmentKind>> = {
  galeria: "gallery",
  scans: "scans",
  modelos: "model",
  confeccao: "fabrication",
  html: "exocad_html",
};
const KIND_LABEL_BR: Record<CaseAttachmentKind, string> = {
  gallery: "Galeria",
  scans: "Escaneamentos",
  model: "Modelos",
  fabrication: "Elementos",
  exocad_html: "Exocad",
  comment_image: "Imagens de comentário",
  other: "Outros",
};

function CaseHeaderActions({ caseRow, currentTab }: { caseRow: CaseRow; currentTab: TabKey }) {
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const sectionKind = TAB_TO_KIND[currentTab];

  const onDownloadFull = async () => {
    if (downloading) return;
    setDownloading(true);
    const tid = toast.loading("Gerando ZIP do caso…");
    try {
      await downloadCaseZip(caseRow);
      toast.success("Download iniciado", { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setDownloading(false);
    }
  };

  const onDownloadSection = async (kind: CaseAttachmentKind) => {
    if (downloading) return;
    setDownloading(true);
    const tid = toast.loading(`Gerando ZIP da seção ${KIND_LABEL_BR[kind]}…`);
    try {
      await downloadCaseSectionZip(caseRow, kind);
      toast.success("Download iniciado", { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setDownloading(false);
    }
  };

  const onPrint = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      await printWorkOrder(caseRow);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTimeout(() => setPrinting(false), 800);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {((caseRow as any).requested_by && !caseRow.cadista_id) && (
        <button
          type="button"
          onClick={async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: cadista } = await supabase.from("cadistas").select("id").eq("user_id", user.id).maybeSingle();
            if (!cadista) {
              toast.error("Apenas protéticos cadastrados podem aceitar solicitações.");
              return;
            }
            try {
              await updateCase(caseRow.id, { cadista_id: cadista.id });
              toast.success("Você aceitou esta solicitação!");
            } catch (e) {
              toast.error("Erro ao aceitar solicitação.");
            }
          }}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition text-xs font-bold"
        >
          Aceitar Solicitação
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={downloading}
            title="Baixar caso ou seção"
            aria-label="Baixar"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[#1F8AFF]/30 bg-[#1F8AFF]/10 text-[#1F8AFF] hover:bg-[#1F8AFF]/15 transition text-xs font-medium disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "Gerando…" : "Baixar"}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onSelect={onDownloadFull} className="gap-2">
            <Download className="h-3.5 w-3.5" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Baixar caso completo</span>
              <span className="text-[11px] text-muted-foreground">ZIP com todos os arquivos + OS</span>
            </div>
          </DropdownMenuItem>
          {sectionKind && (
            <DropdownMenuItem onSelect={() => onDownloadSection(sectionKind)} className="gap-2">
              <Download className="h-3.5 w-3.5" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Baixar seção: {KIND_LABEL_BR[sectionKind]}</span>
                <span className="text-[11px] text-muted-foreground">Somente os arquivos desta aba</span>
              </div>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={onPrint}
        disabled={printing}
        title="Imprimir ordem de serviço"
        aria-label="Imprimir ordem de serviço"
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full border border-[#1F8AFF]/30 bg-white dark:bg-neutral-950 text-[#1F8AFF] hover:bg-[#1F8AFF]/10 transition text-xs font-medium disabled:opacity-60"
      >
        <Printer className="h-3.5 w-3.5" />
        Imprimir OS
      </button>
      <PrintNoteButton caseRow={caseRow} />
    </div>
  );
}

export function CaseDetailDialog({
  caseRow: caseRowProp,
  open,
  onOpenChange,
  syncUrlHash = false,
  focusActivityId = null,
}: {
  caseRow: CaseRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  syncUrlHash?: boolean;
  focusActivityId?: string | null;
}) {
  const caseId = caseRowProp?.id ?? null;
  // Subscribe to the cases cache so workflow advances reflect immediately without prop changes.
  const casesQ = useQuery({
    queryKey: ["cases", "active"],
    queryFn: () => fetchCases("active"),
    enabled: open,
    staleTime: 30_000,
  });
  const caseRow = useMemo(
    () => (casesQ.data ?? []).find((c) => c.id === caseId) ?? caseRowProp,
    [casesQ.data, caseId, caseRowProp],
  );
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isSolicitante = profile?.role === "SOLICITANTE";
  const [tab, setTab] = useState<TabKey>(() => (syncUrlHash ? readHashTab() : null) ?? "detalhes");
  const isMobile = useIsMobile();
  const [showFdiMobile, setShowFdiMobile] = useState(false);
  const [arcadaMode, setArcadaMode] = useState<ArcadaMode>("work");
  const workflowSettingsQ = useQuery({ queryKey: ["workflow_settings"], queryFn: fetchWorkflowSettings });
  const workflowOn = !!workflowSettingsQ.data?.phases_enabled;
  const [restoredCaseId, setRestoredCaseId] = useState<string | null>(null);
  const [pendingPickerTooth, setPendingPickerTooth] = useState<number | null>(null);
  const lastOpenCaseIdRef = useRef<string | null>(null);
  const tabReady = !!open && !!caseId && restoredCaseId === caseId;

  // On open: restore tab from URL hash (reload) or per-case localStorage (reopen).
  // Persistence effects wait for tabReady so the first render never overwrites the restored tab.
  useEffect(() => {
    if (!open || !caseId) {
      setRestoredCaseId(null);
      return;
    }
    const initialTab = syncUrlHash ? restoredTabFor(caseId) : readSavedTab(caseId) ?? "detalhes";
    // Avoid restoring chat tab for solicitantes
    if (isSolicitante && initialTab === "comentarios") {
      setTab("detalhes");
    } else {
      setTab(initialTab);
    }
    setRestoredCaseId(caseId);
  }, [open, caseId, syncUrlHash]);

  // Miniatura de anexo clicada no chat → abre a aba correspondente.
  useEffect(() => {
    return onAttachmentFocus((req) => {
      if (!caseId || req.caseId !== caseId) return;
      const target = (Object.keys(TAB_TO_KIND) as TabKey[]).find((k) => TAB_TO_KIND[k] === req.kind);
      if (target) setTab(target);
    });
  }, [caseId]);

  // Persist current tab per case
  useEffect(() => {
    if (!tabReady || !caseId) return;
    try {
      localStorage.setItem(`case_tab:${caseId}`, tab);
    } catch {
      // localStorage can be unavailable in private/restricted contexts.
    }
  }, [tab, tabReady, caseId]);

  // Reload checkpoint without touching the route/hash for ordinary dialogs.
  useEffect(() => {
    if (!tabReady || !caseId || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(OPEN_CASE_KEY, JSON.stringify({ caseId, tab }));
    } catch {
      // sessionStorage can be unavailable in private/restricted contexts.
    }
    return () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(OPEN_CASE_KEY) || "null") as { caseId?: string } | null;
        if (saved?.caseId === caseId) sessionStorage.removeItem(OPEN_CASE_KEY);
      } catch {
        // sessionStorage can be unavailable in private/restricted contexts.
      }
    };
  }, [tab, tabReady, caseId]);

  const activity = useQuery({
    queryKey: ["case_activity", caseRow?.id],
    queryFn: () => fetchCaseActivity(caseRow!.id),
    enabled: !!caseRow && open,
    staleTime: 0,
    refetchInterval: 5000,
  });

  const implantSystems = useQuery({
    queryKey: ["implant_systems"],
    queryFn: fetchImplantSystems,
    enabled: !!caseRow && open && (!!caseRow?.implant_system_id || (caseRow?.implant_system_ids?.length ?? 0) > 0),
    staleTime: 5 * 60_000,
  });

  const caseImplantUsages = useQuery({
    queryKey: ["case_implant_teeth", caseRow?.id],
    queryFn: () => fetchCaseImplantTeeth(caseRow!.id),
    enabled: !!caseRow && open && (caseRow?.implant_teeth?.length ?? 0) > 0,
  });

  const workflowStages = useQuery({
    queryKey: ["workflow_stages"],
    queryFn: fetchWorkflowStages,
    enabled: !!caseRow && open,
    staleTime: 60_000,
  });

  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  const commentIds = useMemo(
    () => (activity.data ?? [])
      .filter((a) => a.kind === "comment" && !a.id.startsWith("optimistic-"))
      .map((a) => a.id),
    [activity.data],
  );

  const readsQuery = useQuery({
    queryKey: ["case_activity_reads", caseRow?.id, commentIds.join(",")],
    enabled: !!caseRow && open && commentIds.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_activity_reads" as never)
        .select("activity_id,user_id")
        .in("activity_id", commentIds);
      if (error) throw error;
      return (data ?? []) as unknown as { activity_id: string; user_id: string }[];
    },
  });

  // Somente mensagens de OUTROS usuários que ainda não foram lidas por mim.
  const commentsCount = useMemo(() => {
    if (!meId) return 0;
    const mine = new Set(
      (readsQuery.data ?? []).filter((r) => r.user_id === meId).map((r) => r.activity_id),
    );
    return (activity.data ?? []).filter(
      (a) =>
        a.kind === "comment" &&
        a.user_id &&
        a.user_id !== meId &&
        !a.id.startsWith("optimistic-") &&
        !mine.has(a.id),
    ).length;
  }, [activity.data, readsQuery.data, meId]);


  const stageReqs = useStageRequirements(caseRow);
  const tabBlocker = useBlockedActionDialog();
  const handleTabClick = (key: TabKey) => {
    if (stageReqs.isLoading) {
      tabBlocker.show("Validando exigências", "Aguarde a verificação das exigências desta etapa antes de trocar de aba.");
      return;
    }
    const msg = stageReqs.tabBlockedMessage(key);
    if (msg) {
      tabBlocker.show("Aba bloqueada", msg);
      return;
    }
    setTab(key);
  };
  const isTabLocked = (key: TabKey) => !!stageReqs.tabBlockedMessage(key);

  useEffect(() => {
    if (!tabReady || tab === "detalhes" || stageReqs.isLoading) return;
    if (stageReqs.tabBlockedMessage(tab)) setTab("detalhes");
  }, [tab, tabReady, stageReqs]);

  // Reload checkpoint: keep open case + current tab in URL hash
  useEffect(() => {
    if (!syncUrlHash || !tabReady || !caseId || typeof window === "undefined") return;
    lastOpenCaseIdRef.current = caseId;
    const params = readHashParams();
    params.set("case", caseId);
    params.set("tab", tab);
    const desired = `#${params.toString()}`;
    if (window.location.hash !== desired) {
      history.replaceState(null, "", window.location.pathname + window.location.search + desired);
    }
  }, [syncUrlHash, tabReady, caseId, tab]);

  useEffect(() => {
    if (!syncUrlHash || open || typeof window === "undefined") return;
    const caseId = lastOpenCaseIdRef.current;
    if (!caseId) return;
    const params = readHashParams();
    if (params.get("case") === caseId) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    lastOpenCaseIdRef.current = null;
  }, [syncUrlHash, open]);

  // Listen for case deletions broadcast by other users
  const qc = useQueryClient();
  const [deletedNotice, setDeletedNotice] = useState<{ by: string; patient: string | null } | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const deletedNoticeShownRef = useRef<Set<string>>(new Set());
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => {
    if (!open || !caseId) return;
    const showDeletedNotice = (notice?: { deleter_name?: string; patient_name?: string | null }) => {
      if (deletedNoticeShownRef.current.has(caseId)) return;
      deletedNoticeShownRef.current.add(caseId);
      markDeleted(caseId);
      // Purge caches immediately so lists stop showing the case, but keep this
      // detail dialog mounted behind the central notice until the user confirms.
      qc.setQueriesData<any[]>({ queryKey: ["cases"] }, (old) =>
        Array.isArray(old) ? old.filter((c) => c?.id !== caseId) : old,
      );
      qc.setQueryData<any[]>(["my_tasks"], (old) =>
        Array.isArray(old) ? old.filter((c) => c?.id !== caseId) : old,
      );
      qc.removeQueries({ queryKey: ["case", caseId] });
      setDeletedNotice({
        by: notice?.deleter_name ?? "outro usuário",
        patient: notice?.patient_name ?? caseRowProp?.patient?.name ?? null,
      });
    };

    const unsubscribeEntity = subscribeEntity("cases", (payload) => {
      if (payload.op !== "delete" || payload.row?.id !== caseId) return;
      showDeletedNotice({
        deleter_name: payload.row?.deleter_name,
        patient_name: payload.row?.patient_name,
      });
    });

    const channel = supabase
      .channel(`case-deletions:${caseId}`)
      .on("broadcast", { event: "case_deleted" }, (msg) => {
        const p = msg.payload as { case_id?: string; deleter_name?: string; patient_name?: string | null };
        if (p?.case_id !== caseId) return;
        showDeletedNotice({ deleter_name: p.deleter_name, patient_name: p.patient_name });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "cases", filter: `id=eq.${caseId}` }, () => {
        showDeletedNotice();
      })
      .subscribe();
    return () => {
      unsubscribeEntity();
      supabase.removeChannel(channel);
    };
  }, [open, caseId, qc, caseRowProp?.patient?.name]);


  const handleNoticeClose = () => {
    setDeletedNotice(null);
    onOpenChangeRef.current(false);
  };

  const deletedAlert = (
    <AlertDialogPrimitive.Root open={!!deletedNotice} onOpenChange={(o) => { if (!o) handleNoticeClose(); }}>
      <AlertDialogPrimitive.Portal>
        {/* Transparent overlay — no page-wide blur */}
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-transparent data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[20px] border border-border bg-card/80 backdrop-blur-xl shadow-[var(--shadow-card)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 grid place-items-center">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <AlertDialogPrimitive.Title className="text-base font-semibold tracking-tight">
              Caso excluído
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-sm text-muted-foreground leading-relaxed">
              O caso{deletedNotice?.patient ? ` de ${deletedNotice.patient}` : ""} foi excluído por {deletedNotice?.by ?? "outro usuário"}.
            </AlertDialogPrimitive.Description>
          </div>
          <AlertDialogPrimitive.Action
            onClick={handleNoticeClose}
            className="w-full py-3.5 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors border-t border-border/50"
          >
            Entendi
          </AlertDialogPrimitive.Action>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );

  if (!caseRow) return deletedAlert;


  const overdue = isOverdue(caseRow.delivery_date, caseRow.finished_at);
  const types = (caseRow.case_types_link ?? [])
    .map((l) => l.case_type?.name)
    .filter(Boolean) as string[];
  const teeth = sortTeeth(caseRow.teeth_numbers ?? []);
  const zir = caseRow.teeth_zirconia ?? [];
  const dis = caseRow.teeth_dissilicato ?? [];
  const implantTeeth = caseRow.implant_teeth ?? [];
  const tctMap = (caseRow.tooth_case_types ?? {}) as Record<string, string[]>;
  const encOnlyTeeth = teeth.filter((t) => {
    const arr = tctMap[String(t)] ?? [];
    const hasEnc = arr.includes("enceramento");
    const hasPrimary = arr.some((x) => x && x !== "enceramento");
    return hasEnc && !hasPrimary && !zir.includes(t) && !dis.includes(t) && !implantTeeth.includes(t);
  });
  const implantSystemIdx = caseRow.implant_system_id
    ? (implantSystems.data ?? []).findIndex((s) => s.id === caseRow.implant_system_id)
    : -1;
  const implantColor =
    implantSystemIdx >= 0
      ? IMPLANT_COLOR_SCALE[implantSystemIdx % IMPLANT_COLOR_SCALE.length]
      : IMPLANT_COLOR_SCALE[0];
  const allImplantSystemIds = (caseRow.implant_system_ids?.length
    ? caseRow.implant_system_ids
    : (caseRow.implant_system_id ? [caseRow.implant_system_id] : [])) as string[];
  const implantSystemsLabel = (() => {
    const names = allImplantSystemIds
      .map((id) => (implantSystems.data ?? []).find((s) => s.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length) return names.join(", ");
    return caseRow.implant_system?.name ?? "";
  })();
  const currentStageForImplants = (workflowStages.data ?? []).find(
    (s) => s.id === (caseRow as any).current_stage_id,
  );
  const requiresImplantComponents = !!currentStageForImplants?.requires_implant_components || stageReqs.hasImplantRequirement;
  const assignedImplantTeeth = new Set((caseImplantUsages.data ?? []).map((u) => u.tooth_fdi));
  const pendingImplantTeeth = requiresImplantComponents
    ? implantTeeth.filter((t) => !assignedImplantTeeth.has(t))
    : [];
  const responsibleName = caseRow.cadista?.name ?? caseRow.doctor?.name ?? "—";


  if (isMobile) {
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            onPointerDownOutside={(e) => {
              const target = (e.detail?.originalEvent?.target as Element | null) ?? null;
              if (target?.closest("[data-upload-dock]")) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              const target = (e.detail?.originalEvent?.target as Element | null) ?? null;
              if (target?.closest("[data-upload-dock]")) e.preventDefault();
            }}
            className="p-0 gap-0 border-0 rounded-none w-screen h-[100dvh] max-w-none translate-x-0 translate-y-0 left-0 top-0 bg-white dark:bg-neutral-950 overflow-hidden [&>.absolute.right-4]:hidden flex flex-col"
          >
            {/* Header */}
            <header className="px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 border-b border-slate-100 dark:border-neutral-900">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    Caso {caseRow.case_number ? `#${caseRow.case_number}` : ""}
                  </div>
                  <h2 className="mt-1 text-[22px] leading-tight font-extralight tracking-[-0.02em] text-slate-900 dark:text-slate-100 truncate">
                    {caseRow.patient?.name ?? "Caso"}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-light">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{fmtDate(caseRow.entry_date)}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}>
                      <Calendar className="h-3 w-3" />{fmtDate(caseRow.delivery_date)}
                      {overdue && <Clock className="h-3 w-3" />}
                    </span>
                  </div>
                </div>
                <DialogClose asChild>
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="h-9 w-9 shrink-0 rounded-full bg-slate-100 dark:bg-neutral-900 text-slate-600 dark:text-slate-300 grid place-items-center active:scale-90 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DialogClose>
              </div>

              {/* Tabs pill scroll */}
              <div className="mt-4 -mx-5 px-5 overflow-x-auto no-scrollbar">
                <div className="flex gap-1.5 min-w-max pb-1">
                  {TABS.filter(t => !((t as any).hiddenFor || []).includes(profile?.role)).map((t) => {
                    const active = tab === t.key;
                    const badge = t.key === "comentarios" && commentsCount > 0;
                    const locked = isTabLocked(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => handleTabClick(t.key)}
                        className={`relative h-8 px-4 rounded-full text-[12px] tracking-tight whitespace-nowrap transition ${
                          active
                            ? "bg-slate-900 text-white font-normal"
                            : locked
                            ? "bg-slate-100 dark:bg-neutral-900 text-slate-400 dark:text-slate-500 font-light opacity-50"
                            : "bg-slate-100 dark:bg-neutral-900 text-slate-600 dark:text-slate-300 font-light"
                        }`}
                      >
                        {t.label}
                        {badge && (
                          <span className="ml-1.5 inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
                            {commentsCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tab === "detalhes" && (
                <div className="px-5 py-5 space-y-6">
                  <CaseWorkflowBar caseRow={caseRow} />
                  <CaseToothStockUsagePanel caseRow={caseRow} />
                  {/* Painel superior removido: a interação agora acontece direto na arcada via pontinho vermelho. */}


                  <MobileFieldGroup title="Informações">
                    <MobileField label="Dentista" value={caseRow.doctor?.name} />
                    <MobileField label="Cadista" value={caseRow.cadista?.name} />
                    <MobileField label="Cor do dente" value={caseRow.tooth_color?.code} />
                    <MobileField label="Sistema de Implantes" value={implantSystemsLabel || undefined} />
                    <MobileField label="Scanbody" value={caseRow.scan_jig?.name} />
                    <MobileField label="Provisório" value={caseRow.has_provisional ? "Sim" : "Não"} />
                  </MobileFieldGroup>

                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2">
                      Tipo(s) de caso
                    </div>
                    {types.length === 0 ? (
                      <div className="text-sm text-slate-400 dark:text-slate-500 font-light">—</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {types.map((n) => (
                          <span
                            key={n}
                            className="inline-flex items-center rounded-full bg-[hsl(212_95%_94%)] text-[hsl(212_85%_35%)] px-3 py-1 text-[12px] font-normal"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <MobileTextBlock label="Detalhes do caso" value={caseRow.case_label} />
                  <MobileTextBlock label="Observações" value={caseRow.notes} />

                  {/* FDI on demand */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                        Elementos do caso (FDI)
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-light">
                        {teeth.length} elemento(s)
                      </span>
                    </div>
                    {!showFdiMobile ? (
                      <button
                        type="button"
                        onClick={() => setShowFdiMobile(true)}
                        className="w-full h-12 rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-slate-700 dark:text-slate-300 text-[13px] font-light tracking-tight inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"
                      >
                        Carregar arcada FDI
                        <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-slate-100 dark:border-neutral-900 p-3 bg-white dark:bg-neutral-950">
                        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300 font-light">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#0C84FA" }} />
                            Zircônia
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#FF8300" }} />
                            Dissilicato
                          </span>
                          {implantTeeth.length > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold italic text-white"
                                style={{ backgroundColor: implantColor }}
                              >i</span>
                              Implante
                            </span>
                          )}
                        </div>
                        {caseRow.implant_system_id ? (
                          <div className="flex justify-end mb-2">
                            <ArcadaModeToggle
                              mode={arcadaMode}
                              onChange={setArcadaMode}
                              needsImplantTooth={!!caseRow.implant_system_id && implantTeeth.length === 0}
                            />
                          </div>
                        ) : null}
                        <TeethSelector
                          value={teeth}
                          onChange={() => {}}
                          highlight={{ zirconia: zir, dissilicato: dis, enceramentoOnly: encOnlyTeeth }}
                          implantTeeth={implantTeeth}
                          implantColor={implantColor}
                          mode={arcadaMode}
                          showImplantLayer={!!caseRow.implant_system_id}
                          pendingImplantTeeth={pendingImplantTeeth}
                          onPendingImplantClick={(t) => setPendingPickerTooth(t)}
                          disabled
                          compact
                        />

                        {teeth.length > 0 && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-2 font-light">
                            {teeth.join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-neutral-900">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 mb-2">
                      Ações
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CaseHeaderActions caseRow={caseRow} currentTab={tab} />
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 font-light">
                    Protético responsável:{" "}
                    <span className="text-[hsl(212_85%_45%)] font-normal">{responsibleName}</span>
                  </div>
                </div>
              )}

              {tab === "galeria" && (
                <div className="px-3 py-4">
                  <CaseAttachments key={`${caseRow.id}:gallery:${open ? "o" : "c"}`} caseId={caseRow.id} canUpload onlyKind="gallery" caseRow={caseRow} />
                </div>
              )}
              {tab === "html" && (
                <div className="px-3 py-4">
                  <CaseAttachments key={`${caseRow.id}:exocad_html:${open ? "o" : "c"}`} caseId={caseRow.id} canUpload onlyKind="exocad_html" caseRow={caseRow} />
                </div>
              )}
              {tab === "scans" && (
                <div className="px-3 py-4">
                  <CaseAttachments key={`${caseRow.id}:scans:${open ? "o" : "c"}`} caseId={caseRow.id} canUpload onlyKind="scans" caseRow={caseRow} />
                </div>
              )}
              {tab === "modelos" && (
                <div className="px-3 py-4">
                  <CaseAttachments key={`${caseRow.id}:model:${open ? "o" : "c"}`} caseId={caseRow.id} canUpload onlyKind="model" caseRow={caseRow} />
                </div>
              )}
              {tab === "confeccao" && (
                <div className="px-3 py-4">
                  <CaseAttachments key={`${caseRow.id}:fabrication:${open ? "o" : "c"}`} caseId={caseRow.id} canUpload onlyKind="fabrication" caseRow={caseRow} />
                </div>
              )}
              {tab === "comentarios" && (
                <div className="px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <CaseComments caseId={caseRow.id} focusActivityId={focusActivityId} />
                </div>
              )}
              {/* Aba "financeiro" removida — módulo desativado. */}

            </div>
          </DialogContent>
        </Dialog>
        {deletedAlert}
        <PendingImplantToothPicker caseRow={caseRow} tooth={pendingPickerTooth} onClose={() => setPendingPickerTooth(null)} />
        {tabBlocker.dialogElement}
      </>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => {
          const target = (e.detail?.originalEvent?.target as Element | null) ?? null;
          if (target?.closest("[data-upload-dock]")) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          const target = (e.detail?.originalEvent?.target as Element | null) ?? null;
          if (target?.closest("[data-upload-dock]")) e.preventDefault();
        }}
        className="max-w-[min(1200px,calc(100vw-1.5rem))] w-[calc(100vw-1.5rem)] h-[min(92vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] p-0 gap-0 overflow-hidden rounded-3xl border-0 shadow-2xl
                   [&>.absolute.right-4]:hidden"
      >
        <div className="flex flex-col h-full w-full min-h-0 bg-white dark:bg-neutral-950" style={{ fontFamily: '"Google Sans Display", "Google Sans Text", system-ui, sans-serif' }}>
          {/* Header estilo referência — ocupa o topo inteiro do dialog */}
          <header className="shrink-0 px-6 lg:px-8 pt-6 lg:pt-7 pb-5 border-b border-slate-100 dark:border-neutral-900 bg-white dark:bg-neutral-950">
            <div className="flex items-start gap-4">
              {/* Avatar do paciente */}
              <PatientAvatarView
                photoUrl={caseRow.patient?.photo_url ?? null}
                name={caseRow.patient?.name ?? ""}
              />

              <div className="flex-1 min-w-0">
                {/* Nome + ações + close */}
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl lg:text-[28px] font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                    {caseRow.patient?.name ?? "Caso"}
                  </h2>
                  <CaseHeaderActions caseRow={caseRow} currentTab={tab} />
                  <div className="ml-auto">
                    <DialogClose asChild>
                      <button
                        type="button"
                        aria-label="Fechar"
                        className="h-9 w-9 rounded-full bg-[#1F8AFF] text-white grid place-items-center hover:bg-[#1877E8] transition shadow"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </DialogClose>
                  </div>
                </div>

                {/* Datas */}
                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
                  <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300">Entrada :</span>
                    <span className="text-slate-800 dark:text-slate-200">{fmtDate(caseRow.entry_date)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300">Entrega :</span>
                    <span className={overdue ? "text-red-500 font-semibold" : "text-slate-800 dark:text-slate-200"}>
                      {fmtDate(caseRow.delivery_date)}
                    </span>
                    {overdue && <Clock className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                  </span>
                </div>

                {/* Barra de progresso do caso + chips opcionais (FORNO / PROVISORIO) */}
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  {caseRow.has_provisional && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-[0.08em]">
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-[11px] font-bold tracking-wide">
                        ● FORNO
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 font-semibold">PROVISORIO</span>
                    </div>
                  )}
                  <div className="min-w-0 max-w-full flex-1">
                    <CaseWorkflowBar caseRow={caseRow} />
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Linha inferior: sidebar + conteúdo */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row w-full">
          {/* Sidebar branca com tabs verticais (referência) */}
          <nav
            className="shrink-0 min-h-0 flex flex-row md:flex-col overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-visible w-full md:w-[220px] md:min-w-[220px] lg:w-[240px] lg:min-w-[240px] bg-white dark:bg-neutral-950 md:border-r border-slate-100 dark:border-neutral-900 py-2 md:py-4 relative"
          >
            {TABS.filter(t => !((t as any).hiddenFor || []).includes(profile?.role)).map((t) => {
              const active = tab === t.key;
              const showBadge = t.key === "comentarios" && commentsCount > 0;
              const locked = isTabLocked(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => handleTabClick(t.key)}
                  className="group relative shrink-0 md:flex-none pl-10 pr-6 py-4 text-left leading-none tracking-tight transition-colors duration-200 flex items-center justify-start whitespace-nowrap text-[17px] md:text-[20px] outline-none focus:outline-none w-full"
                  style={{
                    fontFamily: '"Google Sans Display", system-ui, sans-serif',
                    fontWeight: active ? 600 : 300,
                    color: active ? "#1F8AFF" : "#5b6474",
                    opacity: locked && !active ? 0.45 : 1,
                  }}
                >
                  {/* Background animado para a aba selecionada */}
                  {active && (
                    <motion.div
                      layoutId="active-tab-bg"
                      className="absolute inset-y-1.5 left-4 right-4 rounded-2xl bg-[#F1F5F9] dark:bg-neutral-900 -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                  
                  <span className="relative z-10">{t.label}</span>
                  
                  {showBadge && (
                    <span className="relative z-10 ml-2 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#ef4444] text-white text-[10px] font-bold px-1">
                      {commentsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>



          {/* Conteúdo */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white dark:bg-neutral-950 overflow-hidden">
            {/* Corpo */}
            <div className={`flex-1 min-h-0 px-4 sm:px-6 lg:px-8 pb-6 flex flex-col ${tab === "detalhes" ? "overflow-hidden" : "overflow-y-auto"}`}>

              {tab === "detalhes" && (
                <div className="flex-1 min-h-0 flex flex-col gap-4">
                  <CaseToothStockUsagePanel caseRow={caseRow} />
                  {/* Painel superior removido: a interação agora acontece direto na arcada via pontinho vermelho. */}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-8 flex-1 min-h-0">
                  <div className="min-w-0 min-h-0 space-y-4 overflow-y-auto lg:overflow-visible pr-1">
                    <div className="rounded-xl border border-border/70 bg-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      <Field label="Dentista" value={caseRow.doctor?.name ?? "—"} />
                      <Field label="Dentista Solicitante" value={caseRow.requested_by ? "Sim" : "Não"} />
                      <Field label="Cor do dente" value={caseRow.tooth_color?.code ?? "—"} />
                      <Field label="Cadista" value={caseRow.cadista?.name ?? "—"} />
                      <Field
                        label="Sistema de Implantes"
                        value={implantSystemsLabel || "—"}
                      />
                      <Field
                        label="Scanbody"
                        value={caseRow.scan_jig?.name ?? "—"}
                        muted
                      />
                      <Field
                        label="Provisório"
                        value={caseRow.has_provisional ? "Sim" : "Não"}
                      />
                    </div>

                    {implantTeeth.length > 0 && (
                      <CaseImplantTeethPanel caseRow={caseRow} />
                    )}

                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">Tipo(s) de caso(s)</div>
                      {types.length === 0 ? (
                        <div className="text-sm text-muted-foreground">—</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {types.map((n) => (
                            <span
                              key={n}
                              className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(212_95%_92%)] text-[hsl(212_85%_35%)] px-3 py-1 text-xs font-medium"
                            >
                              {n}
                              <X className="h-3 w-3 opacity-50" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-foreground">Detalhes do Caso</div>
                      <div className="text-sm text-muted-foreground break-words">
                        {caseRow.case_label?.trim() || "—"}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-foreground">Observações :</div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {caseRow.notes?.trim() || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 min-h-0 flex flex-col">

                    <div className="flex items-start justify-between gap-4 mb-2 shrink-0">
                      <div className="text-sm font-medium text-foreground">
                        Elementos do caso{" "}
                        <span className="text-muted-foreground font-normal">(notação FDI)</span>
                      </div>
                    </div>
                    <div className="relative flex-1 min-h-0 flex flex-col">
                      {/* Legenda acima do painel da arcada, com respiro */}
                      <div
                        className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] shrink-0"
                        style={{ fontFamily: '"Google Sans Text", system-ui, sans-serif', fontWeight: 500 }}
                      >
                        <span className="inline-flex items-center gap-2 text-foreground/80">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#0C84FA" }} />
                          Zircônia
                        </span>
                        <span className="inline-flex items-center gap-2 text-foreground/80">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#FF8300" }} />
                          Dissilicato
                        </span>
                        {implantTeeth.length > 0 && (
                          <span className="inline-flex items-center gap-2 text-foreground/80">
                            <span
                              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold italic text-white"
                              style={{ backgroundColor: implantColor }}
                            >
                              i
                            </span>
                            Implante {caseRow.implant_system?.name ? `(${caseRow.implant_system.name})` : ""}
                          </span>
                        )}
                      </div>
                      {caseRow.implant_system_id ? (
                        <div className="flex justify-end mb-2 shrink-0">
                          <ArcadaModeToggle
                            mode={arcadaMode}
                            onChange={setArcadaMode}
                            needsImplantTooth={!!caseRow.implant_system_id && implantTeeth.length === 0}
                          />
                        </div>
                      ) : null}
                      <div className="flex-1 min-h-0">
                        <TeethSelector
                          value={teeth}
                          onChange={() => {}}
                          highlight={{ zirconia: zir, dissilicato: dis, enceramentoOnly: encOnlyTeeth }}
                          implantTeeth={implantTeeth}
                          implantColor={implantColor}
                          mode={arcadaMode}
                          showImplantLayer={!!caseRow.implant_system_id}
                          pendingImplantTeeth={pendingImplantTeeth}
                          onPendingImplantClick={(t) => setPendingPickerTooth(t)}
                          disabled
                          fitParent
                        />
                      </div>


                    </div>

                    {teeth.length > 0 && (
                      <div className="text-xs text-muted-foreground text-center mt-2 shrink-0">
                        {teeth.length} elemento(s) · {teeth.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
                </div>

              )}

              {tab === "galeria" && (
                <CaseAttachments
                  key={`${caseRow.id}:gallery:${open ? "open" : "closed"}`}
                  caseId={caseRow.id}
                  canUpload
                  onlyKind="gallery"
                  caseRow={caseRow}
                />
              )}
              {tab === "html" && (
                <CaseAttachments
                  key={`${caseRow.id}:exocad_html:${open ? "open" : "closed"}`}
                  caseId={caseRow.id}
                  canUpload
                  onlyKind="exocad_html"
                  caseRow={caseRow}
                />
              )}
              {tab === "scans" && (
                <CaseAttachments
                  key={`${caseRow.id}:scans:${open ? "open" : "closed"}`}
                  caseId={caseRow.id}
                  canUpload
                  onlyKind="scans"
                  caseRow={caseRow}
                />
              )}
              {tab === "modelos" && (
                <CaseAttachments
                  key={`${caseRow.id}:model:${open ? "open" : "closed"}`}
                  caseId={caseRow.id}
                  canUpload
                  onlyKind="model"
                  caseRow={caseRow}
                />
              )}
              {tab === "confeccao" && (
                <CaseAttachments
                  key={`${caseRow.id}:fabrication:${open ? "open" : "closed"}`}
                  caseId={caseRow.id}
                  canUpload
                  onlyKind="fabrication"
                  caseRow={caseRow}
                />
              )}
              {tab === "comentarios" && <CaseComments caseId={caseRow.id} focusActivityId={focusActivityId} />}
              {/* Aba "financeiro" removida — módulo desativado. */}
            </div>

            {/* Rodapé */}
            {tab !== "comentarios" && (
              <footer className="border-t border-border/60 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between text-sm bg-card/40 flex-wrap gap-2">
                <div className="text-muted-foreground min-w-0 truncate">
                  Protético responsável :{" "}
                  <span className="text-[hsl(212_85%_45%)] underline-offset-2 underline font-medium">
                    {responsibleName}
                  </span>
                </div>
              </footer>
            )}

          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {deletedAlert}
    <PendingImplantToothPicker caseRow={caseRow} tooth={pendingPickerTooth} onClose={() => setPendingPickerTooth(null)} />
    {tabBlocker.dialogElement}
    </>
  );
}
