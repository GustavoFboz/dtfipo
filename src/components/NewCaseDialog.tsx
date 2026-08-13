import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientFormDialog } from "./PatientFormDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger, PopoverAnchor,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Camera, Plus, Sparkles, X, ChevronsUpDown, Check, Anchor, ScanLine, FileUp, Box, Wrench, Monitor } from "lucide-react";
import { startFileUpload } from "@/lib/upload-manager";
import { promptDialog } from "@/lib/confirm";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPatients, fetchDoctors, fetchCadistas, fetchCaseTypes, fetchToothColors,
  fetchStages, fetchImplantSystems, fetchScanJigs, createImplantSystem, createScanJig,
  createCase, updateCase, syncCaseTypes, adminCreate, adminUpdate, uploadPatientPhoto, fetchProfile,
  fetchTiBaseOptions, updateCaseTiBases,
} from "@/lib/api";

import { compressSquareImage } from "@/lib/image";
import { StageBadge } from "./StageBadge";
import { TeethSelector, IMPLANT_COLOR_SCALE } from "./TeethSelector";
import { ArcadaModeToggle, type ArcadaMode } from "./ArcadaModeToggle";
import { PatientCombobox } from "./PatientCombobox";
import { sortTeeth } from "@/lib/teeth";
import type { CaseRow } from "@/lib/types";
import { applyCasePatchToCache } from "@/hooks/use-cases-realtime";
import { broadcastEntity } from "@/lib/optimistic";
import { useEntityRealtime } from "@/hooks/use-entity-realtime";
import { CaseAttachments } from "./CaseAttachments";
import { CaseImplantTeethPanel } from "./CaseImplantTeethPanel";
import { ToothWorkPanel, type ToothMilling } from "./ToothWorkPanel";
import { TOOTH_WORK_TYPES, ENCERAMENTO_ID, splitToothTypes, buildToothTypes } from "@/lib/case-types";
import { CaseComments } from "./CaseComments";
import { Paperclip, MessageSquare, PlusCircle } from "lucide-react";
import { AttachButton, AttachFilesIcon, AttachImagesIcon } from "./AttachButton";
import { useSessionSnapshot, clearSessionSnapshot } from "@/hooks/use-session-snapshot";
import {
  NEW_CASE_OPEN_KEY,
  NEW_CASE_FORM_KEY,
  EDIT_CASE_OPEN_KEY,
  editCaseFormKey,
} from "./DialogAutoReopen";

function CaseTypePicker({
  options, onPick,
}: { options: { id: string; name: string }[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.name.toLowerCase().includes(s)) : options;
  }, [options, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-accent/40"
        >
          <span className="text-muted-foreground">Buscar e adicionar tipo de caso…</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <Input autoFocus placeholder="Buscar tipo…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onPick(o.id); setQ(""); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent"
            >
              <Check className="h-3.5 w-3.5 opacity-0" />
              <span className="truncate">{o.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum tipo encontrado.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


export function NewCaseDialog({
  trigger, initialPatientId, viewCase, editCase, open: openProp, onOpenChange,
}: {
  trigger?: React.ReactNode;
  initialPatientId?: string;
  viewCase?: CaseRow | null;
  editCase?: CaseRow | null;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const isCadista = profile?.role === "CADISTA";
  const isView = !!viewCase;
  const isSolicitante = profile?.role === "SOLICITANTE";
  // Solicitantes can create cases and see all fields, but only see their own requests
  const isEdit = !!editCase && !isView;
  const isCreate = !isView && !isEdit;
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;

  // Chaves de persistência: só criam/editam (não view). Edição usa key por caseId.
  const persistFormKey = isView
    ? null
    : isEdit && editCase
      ? editCaseFormKey(editCase.id)
      : isCreate
        ? NEW_CASE_FORM_KEY
        : null;
  const persistOpenKey = isView
    ? null
    : isEdit && editCase
      ? EDIT_CASE_OPEN_KEY
      : isCreate
        ? NEW_CASE_OPEN_KEY
        : null;

  const setOpen = (o: boolean) => {
    if (!o && persistOpenKey && typeof window !== "undefined") {
      // Fechar (X, ESC, clique fora): apenas remove a flag de auto-reabrir,
      // preservando o snapshot do formulário para quando o usuário reabrir.
      try { sessionStorage.removeItem(persistOpenKey); } catch { /* ignore */ }
    }
    onOpenChange?.(o);
    if (openProp === undefined) setOpenState(o);
  };

  // Descartar tudo: usado pelo botão Cancelar e após salvar com sucesso.
  const discardAndClose = () => {
    clearSessionSnapshot(persistOpenKey, persistFormKey);
    onOpenChange?.(false);
    if (openProp === undefined) setOpenState(false);
  };


  // Marca no sessionStorage que o dialog está aberto (para restaurar após F5).
  useEffect(() => {
    if (!open || !persistOpenKey || typeof window === "undefined") return;
    try {
      const payload = isEdit && editCase ? JSON.stringify({ caseId: editCase.id }) : "1";
      sessionStorage.setItem(persistOpenKey, payload);
    } catch {
      // ignora
    }
  }, [open, persistOpenKey, isEdit, editCase]);


  const [patientId, setPatientId] = useState<string>(initialPatientId ?? "");
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhoto, setNewPatientPhoto] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [doctorId, setDoctorId] = useState<string>("");
  const [cadistaId, setCadistaId] = useState<string>("");
  // Pre-fill cadistaId for non-solicitantes during creation
  useEffect(() => {
    if (isCreate && !isSolicitante && profile?.id && !cadistaId) {
      setCadistaId(profile.id);
    }
  }, [isCreate, isSolicitante, profile, cadistaId]);
  const [caseTypeIds, setCaseTypeIds] = useState<string[]>([]);
  const [toothColorId, setToothColorId] = useState<string>("");
  const [caseLabel, setCaseLabel] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  const [entryDate, setEntryDate] = useState(today);
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [stageId, setStageId] = useState<string>("");
  const [arch, setArch] = useState<"" | "superior" | "inferior" | "both">("");
  const [implantSystemId, setImplantSystemId] = useState<string>("");
  // n5: sistemas adicionais (multi-sistemas por caso)
  const [additionalSystemIds, setAdditionalSystemIds] = useState<string[]>([]);
  const [implantTeeth, setImplantTeeth] = useState<number[]>([]);
  const [arcadaMode, setArcadaMode] = useState<ArcadaMode>("work");
  const [focusedTooth, setFocusedTooth] = useState<number | null>(null);
  const [configGroup, setConfigGroup] = useState<number[]>([]);
  const [justAddedTeeth, setJustAddedTeeth] = useState<number[]>([]);
  const [lastConfiguredTooth, setLastConfiguredTooth] = useState<number | null>(null);
  const [scanJigId, setScanJigId] = useState<string>("");
  const [hasProvisional, setHasProvisional] = useState<boolean>(false);
  const [notes, setNotes] = useState("");
  const [teeth, setTeeth] = useState<number[]>([]);
  const [zirTeeth, setZirTeeth] = useState<number[]>([]);
  const [disTeeth, setDisTeeth] = useState<number[]>([]);
  // Gengiva: modo (estratificação/pintura/sem), cor, observações
  const [gumMode, setGumMode] = useState<"" | "estratificacao" | "pintura" | "sem">("");
  const [gumColor, setGumColor] = useState<string>("");
  const [gumNotes, setGumNotes] = useState<string>("");
  // Per-tooth case type mapping: tooth -> case_type_id
  const [toothTypeMap, setToothTypeMap] = useState<Record<number, string>>({});
  // Dentes com enceramento (trabalho extra cumulativo).
  const [toothEnceramento, setToothEnceramento] = useState<Record<number, boolean>>({});
  // Per-tooth Ti-Base (stock_item id) — only meaningful in view mode for cadista
  const [toothTiBaseMap, setToothTiBaseMap] = useState<Record<number, string>>({});
  // Per-tooth implant system mapping (multi-sistemas): tooth -> implant_system_id
  const [toothImplantSystemMap, setToothImplantSystemMap] = useState<Record<number, string>>({});
  // Popover para escolher sistema quando um dente é clicado (2+ sistemas ativos)
  const [systemPickerTooth, setSystemPickerTooth] = useState<number | null>(null);
  const [systemPickerRect, setSystemPickerRect] = useState<{ left: number; top: number; right: number; bottom: number; width: number; height: number } | null>(null);
  // Scans pendentes (somente criação) — anexados após salvar
  const [pendingScanFiles, setPendingScanFiles] = useState<Array<{ file: File; kind: "scans" | "model" | "fabrication" | "exocad_html" }>>([]);
  const pendingScanFileInput = useRef<HTMLInputElement>(null);
  const pendingKindRef = useRef<"scans" | "model" | "fabrication" | "exocad_html">("scans");
  const [pendingAccept, setPendingAccept] = useState<string | undefined>(undefined);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingGalleryFiles, setPendingGalleryFiles] = useState<File[]>([]);
  const pendingGalleryInput = useRef<HTMLInputElement>(null);

  // Snapshot do formulário para reabrir intacto após F5.
  // Persiste apenas campos serializáveis — arquivos (File) e refs são ignorados.
  const formSnapshot = useMemo(
    () => ({
      patientId, newPatientName,
      doctorId, cadistaId, caseTypeIds, toothColorId, caseLabel,
      entryDate, deliveryDate, stageId, arch,
      implantSystemId, additionalSystemIds, implantTeeth,
      arcadaMode, scanJigId, hasProvisional, notes,
      teeth, zirTeeth, disTeeth,
      gumMode, gumColor, gumNotes,
      toothTypeMap, toothEnceramento, toothImplantSystemMap,
    }),
    [
      patientId, newPatientName, doctorId, cadistaId, caseTypeIds, toothColorId, caseLabel,
      entryDate, deliveryDate, stageId, arch, implantSystemId, additionalSystemIds, implantTeeth,
      arcadaMode, scanJigId, hasProvisional, notes, teeth, zirTeeth, disTeeth,
      gumMode, gumColor, gumNotes, toothTypeMap, toothEnceramento, toothImplantSystemMap,
    ],
  );
  useSessionSnapshot(persistFormKey, !!persistFormKey && open, formSnapshot, (d) => {
    if (d.patientId !== undefined) setPatientId(d.patientId as string);
    if (d.newPatientName !== undefined) setNewPatientName(d.newPatientName as string);
    if (d.doctorId !== undefined) setDoctorId(d.doctorId as string);
    if (d.cadistaId !== undefined) setCadistaId(d.cadistaId as string);
    if (d.caseTypeIds !== undefined) setCaseTypeIds(d.caseTypeIds as string[]);
    if (d.toothColorId !== undefined) setToothColorId(d.toothColorId as string);
    if (d.caseLabel !== undefined) setCaseLabel(d.caseLabel as string);
    if (d.entryDate !== undefined) setEntryDate(d.entryDate as string);
    if (d.deliveryDate !== undefined) setDeliveryDate(d.deliveryDate as string);
    if (d.stageId !== undefined) setStageId(d.stageId as string);
    if (d.arch !== undefined) setArch(d.arch as "" | "superior" | "inferior" | "both");
    if (d.implantSystemId !== undefined) setImplantSystemId(d.implantSystemId as string);
    if (d.additionalSystemIds !== undefined) setAdditionalSystemIds(d.additionalSystemIds as string[]);
    if (d.implantTeeth !== undefined) setImplantTeeth(d.implantTeeth as number[]);
    if (d.arcadaMode !== undefined) setArcadaMode(d.arcadaMode as ArcadaMode);
    if (d.scanJigId !== undefined) setScanJigId(d.scanJigId as string);
    if (d.hasProvisional !== undefined) setHasProvisional(!!d.hasProvisional);
    if (d.notes !== undefined) setNotes(d.notes as string);
    if (d.teeth !== undefined) setTeeth(d.teeth as number[]);
    if (d.zirTeeth !== undefined) setZirTeeth(d.zirTeeth as number[]);
    if (d.disTeeth !== undefined) setDisTeeth(d.disTeeth as number[]);
    if (d.gumMode !== undefined) setGumMode(d.gumMode as "" | "estratificacao" | "pintura" | "sem");
    if (d.gumColor !== undefined) setGumColor(d.gumColor as string);
    if (d.gumNotes !== undefined) setGumNotes(d.gumNotes as string);
    if (d.toothTypeMap !== undefined) setToothTypeMap(d.toothTypeMap as Record<number, string>);
    if (d.toothEnceramento !== undefined) setToothEnceramento(d.toothEnceramento as Record<number, boolean>);
    if (d.toothImplantSystemMap !== undefined) setToothImplantSystemMap(d.toothImplantSystemMap as Record<number, string>);
  });


  // Hydrate from viewCase
  useEffect(() => {
    if (!open || !viewCase) return;
    setPatientId(viewCase.patient_id);
    setDoctorId(viewCase.doctor_id ?? "");
    setCadistaId(viewCase.cadista_id ?? "");
    setCaseTypeIds((viewCase.case_types_link ?? []).map((l) => l.case_type_id));
    setToothColorId(viewCase.tooth_color_id ?? "");
    setCaseLabel(viewCase.case_label ?? "");
    setEntryDate(viewCase.entry_date);
    setDeliveryDate(viewCase.delivery_date);
    setStageId(viewCase.current_stage_id ?? "");
    setArch(((viewCase.arch as "" | "superior" | "inferior") ?? ""));
    setImplantSystemId(viewCase.implant_system_id ?? "");
    setAdditionalSystemIds(
      (viewCase.implant_system_ids ?? []).filter((x) => x && x !== (viewCase.implant_system_id ?? "")),
    );
    setImplantTeeth(viewCase.implant_teeth ?? []);
    setScanJigId(viewCase.scan_jig_id ?? "");
    setHasProvisional(!!viewCase.has_provisional);
    setNotes(viewCase.notes ?? "");
    setTeeth(viewCase.teeth_numbers ?? []);
    setZirTeeth(viewCase.teeth_zirconia ?? []);
    setDisTeeth(viewCase.teeth_dissilicato ?? []);
    const tct = (viewCase.tooth_case_types ?? {}) as Record<string, string[]>;
    const map: Record<number, string> = {};
    const enc: Record<number, boolean> = {};
    for (const [k, v] of Object.entries(tct)) {
      const s = splitToothTypes(v);
      if (s.primary) map[Number(k)] = s.primary;
      if (s.hasEnceramento) enc[Number(k)] = true;
    }
    setToothTypeMap(map);
    setToothEnceramento(enc);
    const tib = (viewCase.tooth_ti_bases ?? {}) as Record<string, string>;
    const tibMap: Record<number, string> = {};
    for (const [k, v] of Object.entries(tib)) if (v) tibMap[Number(k)] = v;
    setToothTiBaseMap(tibMap);
    const tis = (viewCase.tooth_implant_systems ?? {}) as Record<string, string>;
    const tisMap: Record<number, string> = {};
    for (const [k, v] of Object.entries(tis)) if (v) tisMap[Number(k)] = v;
    setToothImplantSystemMap(tisMap);
    const g = ((viewCase as any).gum_info ?? null) as { mode?: string; color?: string; notes?: string } | null;
    setGumMode((g?.mode as never) ?? "");
    setGumColor(g?.color ?? "");
    setGumNotes(g?.notes ?? "");
  }, [open, viewCase]);

  // Hydrate from editCase
  useEffect(() => {
    if (!open || !editCase) return;
    setPatientId(editCase.patient_id);
    setDoctorId(editCase.doctor_id ?? "");
    setCadistaId(editCase.cadista_id ?? "");
    const linked = (editCase.case_types_link ?? []).map((l) => l.case_type_id);
    setCaseTypeIds(linked.length ? linked : (editCase.case_type_id ? [editCase.case_type_id] : []));
    setToothColorId(editCase.tooth_color_id ?? "");
    setCaseLabel(editCase.case_label ?? "");
    setEntryDate(editCase.entry_date);
    setDeliveryDate(editCase.delivery_date);
    setStageId(editCase.current_stage_id ?? "");
    setArch(((editCase.arch as "" | "superior" | "inferior") ?? ""));
    setImplantSystemId(editCase.implant_system_id ?? "");
    setAdditionalSystemIds(
      (editCase.implant_system_ids ?? []).filter((x) => x && x !== (editCase.implant_system_id ?? "")),
    );
    setImplantTeeth(editCase.implant_teeth ?? []);
    setScanJigId(editCase.scan_jig_id ?? "");
    setHasProvisional(!!editCase.has_provisional);
    setNotes(editCase.notes ?? "");
    setTeeth(editCase.teeth_numbers ?? []);
    setZirTeeth(editCase.teeth_zirconia ?? []);
    setDisTeeth(editCase.teeth_dissilicato ?? []);
    const tct = (editCase.tooth_case_types ?? {}) as Record<string, string[]>;
    const map: Record<number, string> = {};
    const enc: Record<number, boolean> = {};
    for (const [k, v] of Object.entries(tct)) {
      const s = splitToothTypes(v);
      if (s.primary) map[Number(k)] = s.primary;
      if (s.hasEnceramento) enc[Number(k)] = true;
    }
    setToothTypeMap(map);
    setToothEnceramento(enc);
    const tis = (editCase.tooth_implant_systems ?? {}) as Record<string, string>;
    const tisMap: Record<number, string> = {};
    for (const [k, v] of Object.entries(tis)) if (v) tisMap[Number(k)] = v;
    setToothImplantSystemMap(tisMap);
    const g = ((editCase as any).gum_info ?? null) as { mode?: string; color?: string; notes?: string } | null;
    setGumMode((g?.mode as never) ?? "");
    setGumColor(g?.color ?? "");
    setGumNotes(g?.notes ?? "");
  }, [open, editCase]);


  const patients = useQuery({ queryKey: ["patients"], queryFn: fetchPatients, enabled: open });
  const doctors = useQuery({ queryKey: ["doctors"], queryFn: fetchDoctors, enabled: open });
  const cadistas = useQuery({ queryKey: ["cadistas"], queryFn: fetchCadistas, enabled: open });
  // Atualiza dropdown de cadistas/protéticos em tempo real quando alguém adiciona
  // um novo membro (mesmo com este dialog aberto).
  useEntityRealtime("cadistas", ["cadistas"]);
  useEntityRealtime("doctors", ["doctors"]);
  const caseTypes = useQuery({ queryKey: ["case_types"], queryFn: fetchCaseTypes, enabled: open });
  const colors = useQuery({ queryKey: ["tooth_colors"], queryFn: fetchToothColors, enabled: open, staleTime: Infinity });
  const stages = useQuery({ queryKey: ["stages"], queryFn: fetchStages, enabled: open });
  const implants = useQuery({ queryKey: ["implant_systems"], queryFn: fetchImplantSystems, enabled: open });
  const scanJigs = useQuery({
    queryKey: ["scan_jigs", implantSystemId],
    queryFn: () => fetchScanJigs(implantSystemId),
    enabled: open && !!implantSystemId,
  });
  const hasImplant = !!implantSystemId;
  const tiBaseOptions = useQuery({
    queryKey: ["ti_base_options"],
    queryFn: fetchTiBaseOptions,
    enabled: open && isView && hasImplant,
  });
  const saveTiBases = useMutation({
    mutationFn: async () => {
      if (!viewCase) return;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(toothTiBaseMap)) if (v) out[String(k)] = v;
      await updateCaseTiBases(viewCase.id, out);
    },
    onSuccess: () => {
      toast.success("Ti-Bases salvos");
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setPatientId(initialPatientId ?? ""); setNewPatientName(""); setNewPatientPhoto(null);
    setDoctorId(""); setCadistaId(""); setCaseTypeIds([]);
    setToothColorId(""); setCaseLabel(""); setEntryDate(today); setDeliveryDate(today);
    setStageId(""); setArch(""); setImplantSystemId(""); setAdditionalSystemIds([]); setImplantTeeth([]); setScanJigId(""); setHasProvisional(false);
    setNotes(""); setTeeth([]); setZirTeeth([]); setDisTeeth([]); setToothTypeMap({}); setToothEnceramento({});
    setToothImplantSystemMap({});
    setGumMode(""); setGumColor(""); setGumNotes("");
    setPendingScanFiles([]);
    setPendingGalleryFiles([]);
  };

  const cleanImplantTeeth = useMemo(() => implantTeeth.filter((t) => new Set(teeth).has(t)), [implantTeeth, teeth]);

  // Todos os sistemas de implante ativos no caso (primário + adicionais), na ordem de exibição.
  const allSystemIds = useMemo(
    () => (implantSystemId
      ? [implantSystemId, ...additionalSystemIds.filter((x) => x && x !== implantSystemId)]
      : []),
    [implantSystemId, additionalSystemIds],
  );

  // Sem diferenciação por cor: todos os sistemas usam a mesma cor.
  const implantSystemColors = useMemo<Record<number, string>>(() => ({}), []);


  // Arcada auto-calculada a partir dos dentes selecionados (usada no modo criação).
  const derivedArch = useMemo<"" | "superior" | "inferior" | "both">(() => {
    const hasUpper = teeth.some((t) => t >= 11 && t <= 28);
    const hasLower = teeth.some((t) => t >= 31 && t <= 48);
    if (hasUpper && hasLower) return "both";
    if (hasUpper) return "superior";
    if (hasLower) return "inferior";
    return "";
  }, [teeth]);
  const effectiveArch = isCreate ? derivedArch : arch;
  void effectiveArch;


  const teethSet = useMemo(() => new Set(teeth), [teeth]);
  const cleanZir = zirTeeth.filter((t) => teethSet.has(t));
  const cleanDis = disTeeth.filter((t) => teethSet.has(t));
  // Dentes cujo único trabalho é enceramento (sem tipo primário, sem material, sem implante).
  const encOnlyTeeth = teeth.filter(
    (t) =>
      !!toothEnceramento[t] &&
      !toothTypeMap[t] &&
      !zirTeeth.includes(t) &&
      !disTeeth.includes(t) &&
      !implantTeeth.includes(t),
  );

  const typeById = useMemo(() => {
    const m: Record<string, { id: string; name: string }> = {};
    (caseTypes.data ?? []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [caseTypes.data]);

  // Restrict per-tooth picker to types selected at case-level
  const selectedTypes = useMemo(
    () => caseTypeIds.map((id) => typeById[id]).filter(Boolean),
    [caseTypeIds, typeById],
  );

  const toggleZir = (t: number) => {
    if (!teethSet.has(t)) return;
    setZirTeeth((s) => (s.includes(t) ? s.filter((x) => x !== t) : sortTeeth([...s, t])));
    setDisTeeth((s) => s.filter((x) => x !== t));
  };
  const toggleDis = (t: number) => {
    if (!teethSet.has(t)) return;
    setDisTeeth((s) => (s.includes(t) ? s.filter((x) => x !== t) : sortTeeth([...s, t])));
    setZirTeeth((s) => s.filter((x) => x !== t));
  };

  const addType = (id: string) => setCaseTypeIds((s) => (s.includes(id) ? s : [...s, id]));
  const removeType = (id: string) => {
    setCaseTypeIds((s) => s.filter((x) => x !== id));
    // Drop any per-tooth assignments using this type
    setToothTypeMap((m) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(m)) if (v !== id) next[Number(k)] = v;
      return next;
    });
  };

  const ARCH_UPPER_L = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const ARCH_LOWER_L = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const applyConfigToTeeth = (targets: number[], src: number) => {
    const srcType = toothTypeMap[src] ?? "";
    const srcMilling: ToothMilling = zirTeeth.includes(src)
      ? "zirconia"
      : disTeeth.includes(src) ? "dissilicato" : "";
    const srcHasImplant = implantTeeth.includes(src);

    setToothTypeMap((m) => {
      const n = { ...m };
      targets.forEach((t) => { if (srcType) n[t] = srcType; else delete n[t]; });
      return n;
    });
    if (srcMilling === "zirconia") {
      setZirTeeth((s) => sortTeeth(Array.from(new Set([...s, ...targets]))));
      setDisTeeth((s) => s.filter((x) => !targets.includes(x)));
    } else if (srcMilling === "dissilicato") {
      setDisTeeth((s) => sortTeeth(Array.from(new Set([...s, ...targets]))));
      setZirTeeth((s) => s.filter((x) => !targets.includes(x)));
    } else {
      setZirTeeth((s) => s.filter((x) => !targets.includes(x)));
      setDisTeeth((s) => s.filter((x) => !targets.includes(x)));
    }
    if (srcHasImplant && implantSystemId) {
      setImplantTeeth((s) => sortTeeth(Array.from(new Set([...s, ...targets]))));
    }
  };

  const toothHasConfig = (t: number) =>
    !!toothTypeMap[t] || zirTeeth.includes(t) || disTeeth.includes(t) || implantTeeth.includes(t) || !!toothEnceramento[t];

  const assignedTeeth = useMemo(
    () => teeth.filter(toothHasConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teeth, toothTypeMap, zirTeeth, disTeeth, implantTeeth, toothEnceramento],
  );

  const pruneUnconfigured = (candidates: number[]) => {
    const toRemove = candidates.filter((t) => !toothHasConfig(t));
    if (toRemove.length === 0) return;
    const rem = new Set(toRemove);
    setTeeth((s) => s.filter((x) => !rem.has(x)));
    setToothTypeMap((m) => {
      const n = { ...m };
      toRemove.forEach((t) => { delete n[t]; });
      return n;
    });
  };

  const closePanel = () => {
    pruneUnconfigured(justAddedTeeth);
    if (focusedTooth != null && toothHasConfig(focusedTooth)) {
      setLastConfiguredTooth(focusedTooth);
    }
    setJustAddedTeeth([]);
    setFocusedTooth(null);
    setConfigGroup([]);
  };

  const handleWorkToothClick = (tooth: number, mods: { ctrl: boolean; shift: boolean }) => {
    const panelOpen = focusedTooth != null && teeth.includes(focusedTooth);
    const inCase = teeth.includes(tooth);

    // Clicar no mesmo dente já focado (sem modificadores) fecha o painel.
    if (panelOpen && !mods.ctrl && !mods.shift && tooth === focusedTooth) {
      closePanel();
      return;
    }

    if (!panelOpen) {
      // Ctrl/Shift + click com painel fechado: copia a configuração do último dente configurado.
      if ((mods.ctrl || mods.shift) && lastConfiguredTooth != null && toothHasConfig(lastConfiguredTooth)) {
        const src = lastConfiguredTooth;
        let toAdd: number[] = [tooth];
        if (mods.shift) {
          const archList = src < 30 ? ARCH_UPPER_L : ARCH_LOWER_L;
          if (archList.includes(tooth) && archList.includes(src)) {
            const a = archList.indexOf(src);
            const b = archList.indexOf(tooth);
            const [lo, hi] = a < b ? [a, b] : [b, a];
            toAdd = archList.slice(lo, hi + 1);
          }
        }
        setTeeth((s) => sortTeeth(Array.from(new Set([...s, ...toAdd]))));
        applyConfigToTeeth(toAdd, src);
        return;
      }
      // Clicar em qualquer dente (novo ou já existente) abre o painel focado nele.
      if (!inCase) {
        setTeeth(sortTeeth([...teeth, tooth]));
        setJustAddedTeeth([tooth]);
      } else {
        setJustAddedTeeth([]);
      }
      setFocusedTooth(tooth);
      setConfigGroup([tooth]);
      return;
    }

    if (!mods.ctrl && !mods.shift) {
      // Trocar o foco para outro dente — remove os "just added" atuais que não foram configurados.
      pruneUnconfigured(justAddedTeeth.filter((t) => t !== tooth));
      if (!inCase) {
        setTeeth((s) => sortTeeth([...s, tooth]));
        setJustAddedTeeth([tooth]);
      } else {
        setJustAddedTeeth([]);
      }
      setFocusedTooth(tooth);
      setConfigGroup([tooth]);
      return;
    }

    const focus = focusedTooth!;
    let toAdd: number[] = [tooth];
    if (mods.shift) {
      const arch = focus < 30 ? ARCH_UPPER_L : ARCH_LOWER_L;
      if (arch.includes(tooth) && arch.includes(focus)) {
        const a = arch.indexOf(focus);
        const b = arch.indexOf(tooth);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        toAdd = arch.slice(lo, hi + 1);
      }
    }
    const newlyAdded = toAdd.filter((t) => !teeth.includes(t));
    setTeeth((s) => sortTeeth(Array.from(new Set([...s, ...toAdd]))));
    applyConfigToTeeth(toAdd, focus);
    setConfigGroup((g) => Array.from(new Set([...g, ...toAdd])));
    // Como estamos copiando config do foco, os "toAdd" ganharão config — não precisam ficar em justAdded.
    if (newlyAdded.length > 0 && !toothHasConfig(focus)) {
      setJustAddedTeeth((s) => Array.from(new Set([...s, ...newlyAdded])));
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      let pid = patientId;
      if (!pid && newPatientName.trim()) {
        await adminCreate("patients", { name: newPatientName.trim() });
        const fresh = await fetchPatients();
        const found = fresh.find((p) => p.name === newPatientName.trim());
        if (!found) throw new Error("Não foi possível criar o paciente");
        pid = found.id;
        if (newPatientPhoto) {
          const blob = await compressSquareImage(newPatientPhoto);
          const url = await uploadPatientPhoto(pid, blob);
          await adminUpdate("patients", pid, { photo_url: url });
        }
      }
      if (!pid) throw new Error("Selecione ou cadastre um paciente");
      if (!deliveryDate) throw new Error("Informe a data de entrega");
      if (implantSystemId && cleanImplantTeeth.length === 0) {
        throw new Error("Indique pelo menos um elemento com implante");
      }
      const allSids = implantSystemId
        ? Array.from(new Set([implantSystemId, ...additionalSystemIds.filter(Boolean)]))
        : [];
      if (allSids.length > 1) {
        const usedSids = new Set(
          cleanImplantTeeth.map((t) => toothImplantSystemMap[t] ?? implantSystemId),
        );
        const missing = allSids.filter((sid) => !usedSids.has(sid));
        if (missing.length > 0) {
          const names = missing
            .map((sid) => (implants.data ?? []).find((s) => s.id === sid)?.name ?? sid)
            .join(", ");
          throw new Error(
            `Cada sistema de implante precisa de pelo menos 1 dente marcado. Sem dente atribuído: ${names}.`,
          );
        }
      }


      // Build tooth_case_types as { "<tooth>": [type_id] }
      const tct: Record<string, string[]> = {};
      for (const t of teeth) {
        const primary = toothTypeMap[t] ?? "";
        const hasEnc = !!toothEnceramento[t];
        const arr = buildToothTypes(primary, hasEnc);
        if (arr.length) tct[String(t)] = arr;
      }

      // Build tooth_implant_systems as { "<tooth>": system_id } (apenas dentes com implante).
      const tis: Record<string, string> = {};
      if (implantSystemId) {
        for (const t of cleanImplantTeeth) {
          const sid = toothImplantSystemMap[t] ?? implantSystemId;
          if (sid) tis[String(t)] = sid;
        }
      }

      const base = {
        patient_id: pid,
        doctor_id: doctorId || null,
        cadista_id: isCreate && !isSolicitante && profile?.id ? profile.id : (cadistaId || null),
        case_type_id: caseTypeIds[0] ?? null,
        case_type_ids: caseTypeIds,
        tooth_color_id: toothColorId || null,
        case_label: caseLabel || null,
        entry_date: entryDate,
        delivery_date: deliveryDate,
        current_stage_id: stageId || null,
        implant_system_id: implantSystemId || null,
        implant_system_ids: implantSystemId
          ? Array.from(new Set([implantSystemId, ...additionalSystemIds.filter(Boolean)]))
          : [],
        implant_teeth: implantSystemId ? cleanImplantTeeth : [],
        tooth_implant_systems: tis,
        scan_jig_id: implantSystemId ? (scanJigId || null) : null,
        has_provisional: hasProvisional,
        notes: notes || null,
        teeth_numbers: sortTeeth(teeth),
        teeth_zirconia: cleanZir,
        teeth_dissilicato: cleanDis,
        tooth_case_types: tct,
        gum_info: (gumMode || gumColor || gumNotes)
          ? { mode: gumMode || null, color: gumColor || null, notes: gumNotes || null }
          : null,
      };

      let createdCase: CaseRow | null = null;
      let createdId: string | null = null;

      if (isEdit && editCase) {
        const patch = { ...base, arch: arch || null };
        // case_type_ids não é coluna de `cases` (vive em case_types_link via syncCaseTypes)
        const { case_type_ids: _cti, ...patchForUpdate } = patch;
        void _cti;
        // Optimistic: reflete no cache local e propaga para peers ANTES do round-trip.
        const optimisticRow = { ...editCase, ...(patch as unknown as CaseRow), id: editCase.id } as CaseRow;
        applyCasePatchToCache(qc, optimisticRow as any);
        qc.setQueryData<CaseRow | null>(["case", editCase.id], (old) => (old ? { ...old, ...optimisticRow } : optimisticRow));
        broadcastEntity("cases", "update", optimisticRow);
        await updateCase(editCase.id, patchForUpdate);
        await syncCaseTypes(editCase.id, caseTypeIds);
        createdCase = optimisticRow;
        createdId = editCase.id;
      } else if (derivedArch) {
        // Unified case: uma arcada, ambas ("both") ou nenhuma — sempre 1 caso só.
        const a = await createCase({ ...base, arch: derivedArch });
        createdCase = a as CaseRow;
        createdId = (a as any)?.id ?? null;
      } else {
        const a = await createCase(base);
        createdCase = a as CaseRow;
        createdId = (a as any)?.id ?? null;
      }

      // Disparar uploads de Scans pendentes em background
      // Disparar uploads pendentes em background (com o tipo escolhido por arquivo)
      if (createdId && !isCadista) {
        for (const item of pendingScanFiles) {
          startFileUpload({ caseId: createdId, kind: item.kind, file: item.file });
        }
      }
      // Galeria pendente
      if (createdId) {
        for (const f of pendingGalleryFiles) {
          startFileUpload({ caseId: createdId, kind: "gallery", file: f });
        }
      }
      return createdCase;

    },
    onSuccess: async (createdCase) => {
      if (createdCase?.id) {
        const row = createdCase;
        qc.getQueriesData<CaseRow[]>({ queryKey: ["cases"] }).forEach(([key, old]) => {
          if (!Array.isArray(old)) return;
          const statusFilter = Array.isArray(key) ? key[1] : undefined;
          if ((statusFilter === "active" || statusFilter === "finished") && row.status !== statusFilter) return;
          const next = old.some((item) => item.id === row.id)
            ? old.map((item) => item.id === row.id ? { ...item, ...row } : item)
            : [row, ...old];
          qc.setQueryData(key, next);
        });
      }
      const pending = pendingScanFiles.length;
      toast.success(
        (isEdit ? "Caso atualizado" : "Caso cadastrado") +
        (pending > 0 ? ` · ${pending} scan(s) enviando em segundo plano` : "")
      );
      await qc.invalidateQueries();
      await qc.refetchQueries({ queryKey: ["cases"], type: "active" });
      if (!isEdit) reset();
      discardAndClose();



    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isControlled = openProp !== undefined;
  const shouldRenderTrigger = !isView && !isEdit && !isControlled && (trigger != null || !isCadista);
  const triggerNode = trigger ?? (
    <Button className="gap-2">
      <Plus className="h-4 w-4" /> Nova entrada
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {shouldRenderTrigger && (
        <DialogTrigger asChild>
          {triggerNode}
        </DialogTrigger>
      )}
      <DialogContent
        className="max-w-7xl w-[calc(100vw-2rem)] max-h-[95vh] p-0 gap-0 overflow-hidden flex flex-col rounded-3xl border-0 shadow-2xl
                   max-md:w-screen max-md:!max-w-none max-md:h-[100dvh] max-md:!max-h-[100dvh] max-md:rounded-none max-md:rounded-t-[28px] max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:!translate-x-0 max-md:!translate-y-0 max-md:data-[state=open]:animate-in max-md:data-[state=open]:slide-in-from-bottom
                   [&>.absolute.right-4]:hidden"
      >
        <div className="flex flex-col h-full min-h-0 bg-white font-light relative">
          <div id="radix-select-portal-container" className="absolute inset-0 pointer-events-none z-[2501] [&>*]:pointer-events-auto" />
          <header className="px-6 lg:px-10 pt-8 pb-6 flex items-start gap-3 border-b border-border/60 bg-white relative z-10">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/15 text-[11px] font-medium text-primary/80 mb-3">
                {isView ? "Detalhes do caso" : (isEdit || editCase) ? "Editar caso" : "Nova entrada"}
              </div>
              <h2 className="text-3xl lg:text-4xl font-extralight text-foreground tracking-[-0.03em] leading-[1.05] truncate">
                {isView ? (viewCase?.patient?.name ?? "Caso") : (isEdit || editCase) ? "Editar caso" : "Cadastrar novo caso"}
              </h2>
              <p className="text-sm text-muted-foreground mt-2 font-light">
                {isView
                  ? "Visualização somente leitura. " + (isCadista && hasImplant ? "Aponte o Ti-Base de cada dente com implante." : "")
                  : "Preencha as informações e selecione os elementos da arcada."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-muted transition"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

        <div className={`relative grid grid-cols-1 lg:grid-cols-[1fr_minmax(300px,0.8fr)] gap-0 flex-1 min-h-0 z-10 ${isView ? "overflow-y-auto" : "overflow-hidden"}`}>
          <div
            {...(isView ? { inert: "" as unknown as boolean } : {})}
            aria-disabled={isView || undefined}
            className={`px-5 py-4 lg:px-6 lg:py-5 min-h-0 flex flex-col overflow-y-auto border-r border-slate-100/50 ${isView ? "pointer-events-none select-none opacity-95" : ""}`}
            onKeyDown={(e) => {
              if (!isCreate) return;
              if (e.key !== "Enter" || e.shiftKey) return;
              const target = e.target as HTMLElement;
              const tag = target.tagName;
              // Não interceptar Enter em textareas ou botões (que fazem submit/abrem popovers).
              if (tag === "TEXTAREA" || tag === "BUTTON" || target.getAttribute("role") === "combobox") return;
              if (tag !== "INPUT") return;
              const type = (target as HTMLInputElement).type;
              if (type === "submit" || type === "button" || type === "file") return;
              e.preventDefault();
              const container = e.currentTarget as HTMLElement;
              const focusables = Array.from(
                container.querySelectorAll<HTMLElement>(
                  'input:not([type="hidden"]):not([type="file"]):not([disabled]):not([tabindex="-1"]),select:not([disabled]),textarea:not([disabled]),[role="combobox"]:not([disabled]),button:not([disabled]):not([tabindex="-1"])',
                ),
              ).filter((el) => el.offsetParent !== null);
              const idx = focusables.indexOf(target);
              const next = idx >= 0 ? focusables[idx + 1] : null;
              if (next) next.focus();
            }}
          >


            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 [&_input]:border-0 [&_input]:shadow-none [&_input]:bg-slate-100/70 [&_input]:h-10 [&_input]:rounded-lg [&_input]:transition-all [&_input:focus]:bg-white [&_input:focus]:shadow-[inset_2px_2px_5px_rgba(15,23,42,0.08),inset_-2px_-2px_5px_rgba(255,255,255,0.9)] [&_textarea]:border-0 [&_textarea]:shadow-none [&_textarea]:bg-slate-100/70 [&_textarea]:rounded-lg [&_textarea]:transition-all [&_textarea:focus]:bg-white [&_textarea:focus]:shadow-[inset_2px_2px_5px_rgba(15,23,42,0.08),inset_-2px_-2px_5px_rgba(255,255,255,0.9)] [&_button[role=combobox]]:border-0 [&_button[role=combobox]]:shadow-none [&_button[role=combobox]]:bg-slate-100/70 [&_button[role=combobox]]:rounded-lg [&_button[role=combobox]]:transition-all [&_button[role=combobox]:focus]:bg-white [&_button[role=combobox]:focus]:shadow-[inset_2px_2px_5px_rgba(15,23,42,0.08),inset_-2px_-2px_5px_rgba(255,255,255,0.9)]">


              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">Paciente</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <PatientCombobox
                      patients={patients.data ?? []}
                      selectedId={patientId}
                      newName={newPatientName}
                      onSelectExisting={(id) => { setPatientId(id); setNewPatientName(""); setNewPatientPhoto(null); }}
                      onTypeNew={(name) => { setNewPatientName(name); setPatientId(""); }}
                    />
                  </div>
                  <PatientFormDialog 
                    onSaved={(id: string) => { setPatientId(id); setNewPatientName(""); setNewPatientPhoto(null); }}
                    trigger={
                      <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 bg-slate-100/70 border-0 rounded-lg hover:bg-white hover:shadow-[inset_2px_2px_5px_rgba(15,23,42,0.08)] transition-all" title="Cadastrar paciente completo">
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    }
                  />
                </div>
                {newPatientName && !patientId && (
                  <div className="flex gap-2 items-center">
                    <div className="text-xs text-muted-foreground flex-1">
                      Será cadastrado como novo paciente: <b>{newPatientName}</b>
                    </div>
                    <input ref={photoInput} type="file" accept="image/*" className="hidden"
                      onChange={(e) => setNewPatientPhoto(e.target.files?.[0] ?? null)} />
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => photoInput.current?.click()} className="gap-2 shrink-0">
                      <Camera className="h-4 w-4" />
                      {newPatientPhoto ? "Foto ok" : "Foto"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Doutor</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="z-[3000]">
                    {doctors.data?.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cadista</Label>
                <Select 
                  value={cadistaId} 
                  onValueChange={setCadistaId}
                  disabled={isCreate && !isSolicitante && !!profile?.id}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="z-[3000]">
                    {cadistas.data?.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Tipos de caso</Label>
                <CaseTypePicker options={caseTypes.data ?? []} onPick={addType} />
                {caseTypeIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {caseTypeIds.map((id) => (
                      <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-2.5 py-1 text-xs">
                        {typeById[id]?.name ?? id}
                        <button type="button" onClick={() => removeType(id)} className="opacity-60 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Cor do dente</Label>
                <Select value={toothColorId} onValueChange={setToothColorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72 z-[3000]">
                    {colors.data?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Provisório</Label>
                <label className="flex items-center gap-2 h-10 px-3 rounded-lg bg-slate-100/70 text-sm cursor-pointer hover:bg-slate-100 transition-colors">
                  <Checkbox checked={hasProvisional} onCheckedChange={(v) => setHasProvisional(!!v)} />
                  <span>Este caso terá provisório</span>
                </label>
              </div>

              <div className="space-y-2 md:col-span-2">



                <Label>Sistemas de implante</Label>
                {(() => {
                  const allIds = implantSystemId
                    ? [implantSystemId, ...additionalSystemIds.filter((x) => x && x !== implantSystemId)]
                    : [];
                  const remove = (id: string) => {
                    if (id === implantSystemId) {
                      const next = additionalSystemIds.filter((x) => x !== id);
                      const promoted = next[0] ?? "";
                      setImplantSystemId(promoted);
                      setAdditionalSystemIds(next.slice(1));
                      setScanJigId("");
                      if (!promoted) setImplantTeeth([]);
                    } else {
                      setAdditionalSystemIds((prev) => prev.filter((x) => x !== id));
                    }
                  };
                  const add = async (v: string) => {
                    if (v === "__add") {
                       const name = (await promptDialog({ title: "Novo sistema de implante", placeholder: "Nome do sistema", required: true }))?.trim();
                       if (!name) return;
                       const line = (await promptDialog({ title: "Linha/conexão", placeholder: "Opcional" }))?.trim() || null;
                      try {
                        const created = await createImplantSystem({ name, line });
                        await qc.invalidateQueries({ queryKey: ["implant_systems"] });
                        if (!implantSystemId) setImplantSystemId(created.id);
                        else setAdditionalSystemIds((prev) => Array.from(new Set([...prev, created.id])));
                      } catch (e) { toast.error((e as Error).message); }
                      return;
                    }
                    if (!v || v === "__none") return;
                    if (!implantSystemId) {
                      setImplantSystemId(v);
                      setScanJigId("");
                    } else if (v !== implantSystemId && !additionalSystemIds.includes(v)) {
                      setAdditionalSystemIds((prev) => [...prev, v]);
                    }
                  };
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {allIds.map((sid, idx) => {
                        const s = implants.data?.find((x) => x.id === sid);
                        if (!s) return null;
                        return (
                          <span
                            key={sid}
                            className="inline-flex items-center gap-1.5 pl-3 pr-1.5 h-9 rounded-lg bg-primary/10 text-primary text-sm"
                          >
                            {idx === 0 && <Anchor className="h-3.5 w-3.5 opacity-70" />}
                            <span className="font-medium">{s.name}</span>
                            {s.line && <span className="text-xs opacity-70">· {s.line}</span>}
                            <button
                              type="button"
                              onClick={() => remove(sid)}
                              className="rounded-full hover:bg-primary/20 h-5 w-5 inline-flex items-center justify-center"
                              aria-label={`Remover ${s.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                      <Select value="" onValueChange={add}>
                        <SelectTrigger className="h-9 w-auto min-w-[220px] rounded-lg text-sm">
                          <SelectValue placeholder={allIds.length === 0 ? "Selecione um sistema…" : "+ Adicionar outro sistema…"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72 z-[3000]">
                          {allIds.length === 0 && <SelectItem value="__none">Nenhum</SelectItem>}
                          {(implants.data ?? [])
                            .filter((i) => !allIds.includes(i.id))
                            .map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.name}{i.line ? ` · ${i.line}` : ""}
                              </SelectItem>
                            ))}
                          <SelectItem value="__add" className="text-primary">
                            <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Cadastrar novo sistema…</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>



              {hasImplant && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Jig de escaneamento (opcional)</Label>
                  <Select
                    value={scanJigId || "__none"}
                    onValueChange={async (v) => {
                      if (v === "__add") {
                        const name = (await promptDialog({ title: "Novo jig de escaneamento", placeholder: "Nome do jig", required: true }))?.trim();
                        if (!name) return;
                        try {
                          const created = await createScanJig({ implant_system_id: implantSystemId, name });
                          await qc.invalidateQueries({ queryKey: ["scan_jigs", implantSystemId] });
                          setScanJigId(created.id);
                        } catch (e) { toast.error((e as Error).message); }
                        return;
                      }
                      setScanJigId(v === "__none" ? "" : v);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72 z-[3000]">
                      <SelectItem value="__none">Nenhum</SelectItem>
                      {scanJigs.data?.map((j) => (
                        <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                      ))}
                      <SelectItem value="__add" className="text-primary">
                        <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Cadastrar novo jig…</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}



              <div className="space-y-2">
                <Label>Detalhes do caso</Label>
                <Input value={caseLabel} onChange={(e) => setCaseLabel(e.target.value)} placeholder='Ex.: "(25)", "+ Inf."' />
              </div>

              <div className="space-y-2">
                <Label>Data de entrada</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Data de entrega</Label>
                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>


              {/* Seções de Escaneamentos e Galeria removidas do editar caso a pedido do usuário */}

              {/* Inputs de arquivo — sempre presentes no DOM para os dois modos */}
              <input
                ref={pendingScanFileInput}
                type="file"
                multiple
                accept={pendingAccept}
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  const k = pendingKindRef.current;
                  if (list.length) setPendingScanFiles((s) => [...s, ...list.map((file) => ({ file, kind: k }))]);
                  if (pendingScanFileInput.current) pendingScanFileInput.current.value = "";
                }}
              />
              <input
                ref={pendingGalleryInput}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  if (list.length) setPendingGalleryFiles((s) => [...s, ...list]);
                  if (pendingGalleryInput.current) pendingGalleryInput.current.value = "";
                }}
              />

              {/* Lista de arquivos pendentes - agora visível acima do formulário ou em local fixo */}
              {(pendingGalleryFiles.length > 0 || pendingScanFiles.length > 0) && (
                <div className="md:col-span-2 flex flex-wrap gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100 dark:bg-neutral-900/50 dark:border-neutral-800 mb-4">
                  {pendingGalleryFiles.map((f, i) => (
                    <div key={`g-${i}`} className="flex items-center gap-2 px-2 py-1 rounded-full bg-white dark:bg-neutral-800 text-[10px] text-slate-500 border border-slate-200 dark:border-neutral-700">
                      <AttachImagesIcon className="h-3 w-3" />
                      <span className="truncate max-w-[80px]">{f.name}</span>
                      <button onClick={() => setPendingGalleryFiles(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {pendingScanFiles.map((f, i) => (
                    <div key={`s-${i}`} className="flex items-center gap-2 px-2 py-1 rounded-full bg-white dark:bg-neutral-800 text-[10px] text-slate-500 border border-slate-200 dark:border-neutral-700">
                      <AttachFilesIcon className="h-3 w-3" />
                      <span className="truncate max-w-[80px]">{f.file.name}</span>
                      <button onClick={() => setPendingScanFiles(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          </div>

          <aside
            {...(isView ? { inert: "" as unknown as boolean } : {})}
            aria-disabled={isView || undefined}
            className={`p-6 flex flex-col min-h-0 h-full overflow-y-auto bg-slate-50/30 ${isView ? "pointer-events-none select-none opacity-95" : ""}`}
          >
            <div className={isCreate ? "flex flex-col flex-1 min-h-0 gap-5" : "space-y-5"}>
              <div className={isCreate ? "flex flex-col flex-1 min-h-0 gap-3" : "space-y-3"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-[3px] self-stretch rounded-full bg-primary" />
                    <div className="min-w-0">
                      <h3 className="text-2xl font-light leading-tight tracking-tight">
                        {arcadaMode === "implant" ? (
                          <><span className="text-primary">Implantes</span> <span className="text-foreground/80">do Caso</span></>
                        ) : (
                          <><span className="text-primary">Elementos</span> <span className="text-foreground/80">do caso</span></>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {arcadaMode === "implant"
                          ? "Selecione os dentes com implantes"
                          : "notação FDI"}
                      </p>
                    </div>
                  </div>
                  {implantSystemId ? (
                    <ArcadaModeToggle
                      mode={arcadaMode}
                      onChange={(m) => {
                        // Ao alternar entre visualizações, fechar imediatamente
                        // o menu de dente e o seletor de sistema.
                        setFocusedTooth(null);
                        setConfigGroup([]);
                        setSystemPickerTooth(null);
                        setSystemPickerRect(null);
                        setArcadaMode(m);
                      }}
                      needsImplantTooth={!!implantSystemId && cleanImplantTeeth.length === 0}
                    />
                  ) : null}
                </div>
                <div className={isCreate ? "flex-1 min-h-0 flex relative" : "relative"}>
                  <TeethSelector
                    value={teeth}
                    onChange={() => {}}
                    onWorkClick={handleWorkToothClick}
                    configuredTeeth={configGroup}
                    assignedTeeth={assignedTeeth}
                    highlight={{ zirconia: cleanZir, dissilicato: cleanDis, enceramentoOnly: encOnlyTeeth }}
                    implantTeeth={cleanImplantTeeth}
                    implantColor={
                      IMPLANT_COLOR_SCALE[
                        Math.max(0, (implants.data ?? []).findIndex((s) => s.id === implantSystemId)) %
                          IMPLANT_COLOR_SCALE.length
                      ]
                    }
                    implantSystemColors={implantSystemColors}
                    mode={arcadaMode}
                    showImplantLayer={!!implantSystemId}
                    onImplantToothClick={(t, rect) => {
                      // Se houver 2+ sistemas ativos, abrir o seletor de sistema perto do círculo do implante.
                      if (allSystemIds.length >= 2) {
                        setSystemPickerTooth(t);
                        setSystemPickerRect(rect ? {
                          left: rect.left, top: rect.top, right: rect.right,
                          bottom: rect.bottom, width: rect.width, height: rect.height,
                        } : null);
                        return;
                      }
                      // 1 sistema: toggle simples do dente na lista de implantes.
                      setImplantTeeth((s) => (s.includes(t) ? s.filter((x) => x !== t) : sortTeeth([...s, t])));
                    }}
                    fitParent={isCreate}
                  />
                  {systemPickerTooth !== null && allSystemIds.length >= 2 && (() => {
                    // Popover compacto ancorado EXATAMENTE acima do círculo do implante.
                    const POP_W = 220;
                    const POP_H = Math.min(52 + allSystemIds.length * 40 + (cleanImplantTeeth.includes(systemPickerTooth) ? 44 : 0), 320);
                    const MARGIN = 8;
                    const GAP = 8;
                    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
                    const vh = typeof window !== "undefined" ? window.innerHeight : 768;
                    const r = systemPickerRect;
                    const cx = r ? r.left + r.width / 2 : vw / 2;
                    const cy = r ? r.top + r.height / 2 : vh / 2;
                    const halfH = r ? r.height / 2 : 12;
                    // Preferir abrir ACIMA do dente; se não couber, abrir abaixo.
                    const spaceAbove = (cy - halfH) - MARGIN;
                    let top: number;
                    if (spaceAbove >= POP_H + GAP) {
                      top = cy - halfH - GAP - POP_H;
                    } else {
                      top = cy + halfH + GAP;
                    }
                    let left = cx - POP_W / 2;
                    top = Math.max(MARGIN, Math.min(top, vh - POP_H - MARGIN));
                    left = Math.max(MARGIN, Math.min(left, vw - POP_W - MARGIN));

                    return createPortal(
                      <>
                        <div
                          className="fixed inset-0 z-[100]"
                          style={{ pointerEvents: "auto" }}
                          onClick={() => { setSystemPickerTooth(null); setSystemPickerRect(null); }}
                        />
                        <div
                          className="fixed z-[101] rounded-xl border bg-popover text-popover-foreground shadow-xl p-1.5"
                          style={{ left, top, width: POP_W, pointerEvents: "auto" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                            Dente {systemPickerTooth} · Sistema
                          </div>
                          {allSystemIds.map((sid) => {
                            const s = implants.data?.find((x) => x.id === sid);
                            if (!s) return null;
                            const isCurrent =
                              cleanImplantTeeth.includes(systemPickerTooth) &&
                              (toothImplantSystemMap[systemPickerTooth] ?? implantSystemId) === sid;
                            return (
                              <button
                                key={sid}
                                type="button"
                                onClick={() => {
                                  const t = systemPickerTooth!;
                                  setToothImplantSystemMap((m) => ({ ...m, [t]: sid }));
                                  setImplantTeeth((s) => (s.includes(t) ? s : sortTeeth([...s, t])));
                                  setSystemPickerTooth(null);
                                  setSystemPickerRect(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                              >
                                <span className="flex-1 text-left truncate">
                                  {s.name}
                                  {s.line ? <span className="text-xs text-muted-foreground"> · {s.line}</span> : null}
                                </span>
                                {isCurrent && <Check className="h-3.5 w-3.5 text-primary" />}
                              </button>
                            );
                          })}
                          {cleanImplantTeeth.includes(systemPickerTooth) && (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <button
                                type="button"
                                onClick={() => {
                                  const t = systemPickerTooth!;
                                  setImplantTeeth((s) => s.filter((x) => x !== t));
                                  setToothImplantSystemMap((m) => {
                                    const { [t]: _removed, ...rest } = m;
                                    return rest;
                                  });
                                  setSystemPickerTooth(null);
                                  setSystemPickerRect(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3.5 w-3.5" />
                                Remover implante deste dente
                              </button>
                            </>
                          )}
                        </div>
                      </>,
                      document.body,
                    );
                  })()}
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  {teeth.length} elemento(s){teeth.length > 0 && ` · ${sortTeeth(teeth).join(", ")}`}
                </div>
              </div>






              {isEdit && editCase && hasImplant && (editCase.implant_teeth ?? []).length > 0 && (
                <CaseImplantTeethPanel caseRow={editCase} />
              )}


              {!isCreate && (
              /* Gengiva */
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <div className="text-sm font-medium">Gengiva</div>
                  <p className="text-[11px] text-muted-foreground">Como será tratada a gengiva neste caso.</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { id: "estratificacao", label: "Estratificação" },
                    { id: "pintura", label: "Pintura" },
                    { id: "sem", label: "Sem gengiva" },
                  ] as const).map((o) => {
                    const active = gumMode === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setGumMode((s) => (s === o.id ? "" : o.id))}
                        className={`h-9 rounded-lg text-[11px] font-medium border transition ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cor da gengiva</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {["#f9c9c9", "#e89b9b", "#c96f6f", "#9d4949", "#6e2a2a"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setGumColor(c)}
                        aria-label={`Cor ${c}`}
                        className={`h-6 w-6 rounded-full border transition ${gumColor === c ? "ring-2 ring-primary ring-offset-1" : "border-border"}`}
                        style={{ background: c }}
                      />
                    ))}
                    <Input
                      value={gumColor}
                      onChange={(e) => setGumColor(e.target.value)}
                      placeholder="Ex.: rosa médio, GC Gradia G1"
                      className="h-8 text-xs flex-1 min-w-[140px]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Observações da gengiva</Label>
                  <Textarea
                    rows={2}
                    value={gumNotes}
                    onChange={(e) => setGumNotes(e.target.value)}
                    placeholder="Detalhes específicos sobre gengiva, transição, textura…"
                    className="text-xs"
                  />
                </div>
              </div>
              )}
            </div>
          </aside>
          {!isView && (
            <ToothWorkPanel
              open={focusedTooth != null && teeth.includes(focusedTooth)}
              tooth={focusedTooth}
              configuredTeeth={configGroup}
              caseTypes={TOOTH_WORK_TYPES}
              toothTypeId={focusedTooth != null ? (toothTypeMap[focusedTooth] ?? "") : ""}
              onToothTypeChange={(id) => {
                if (focusedTooth == null) return;
                const targets = configGroup.length ? configGroup : [focusedTooth];
                setToothTypeMap((m) => {
                  const n = { ...m };
                  targets.forEach((t) => { if (id) n[t] = id; else delete n[t]; });
                  return n;
                });
              }}
              hasEnceramento={focusedTooth != null && !!toothEnceramento[focusedTooth]}
              onEnceramentoToggle={() => {
                if (focusedTooth == null) return;
                const targets = configGroup.length ? configGroup : [focusedTooth];
                const anyOn = targets.some((t) => toothEnceramento[t]);
                setToothEnceramento((m) => {
                  const n = { ...m };
                  targets.forEach((t) => {
                    if (anyOn) delete n[t];
                    else n[t] = true;
                  });
                  return n;
                });
              }}
              milling={
                focusedTooth == null
                  ? ""
                  : zirTeeth.includes(focusedTooth)
                    ? "zirconia"
                    : disTeeth.includes(focusedTooth)
                      ? "dissilicato"
                      : ""
              }
              onMillingChange={(m) => {
                if (focusedTooth == null) return;
                const targets = configGroup.length ? configGroup : [focusedTooth];
                if (m === "zirconia") {
                  setZirTeeth((s) => sortTeeth(Array.from(new Set([...s, ...targets]))));
                  setDisTeeth((s) => s.filter((x) => !targets.includes(x)));
                } else if (m === "dissilicato") {
                  setDisTeeth((s) => sortTeeth(Array.from(new Set([...s, ...targets]))));
                  setZirTeeth((s) => s.filter((x) => !targets.includes(x)));
                } else {
                  setZirTeeth((s) => s.filter((x) => !targets.includes(x)));
                  setDisTeeth((s) => s.filter((x) => !targets.includes(x)));
                }
              }}
              activeImplantSystemId={
                focusedTooth != null && implantTeeth.includes(focusedTooth)
                  ? (toothImplantSystemMap[focusedTooth] ?? implantSystemId)
                  : ""
              }
              hasImplant={focusedTooth != null && implantTeeth.includes(focusedTooth)}
              implantSystemOptions={
                allSystemIds.length > 0
                  ? allSystemIds
                      .map((sid) => (implants.data ?? []).find((s) => s.id === sid))
                      .filter((s): s is NonNullable<typeof s> => !!s)
                      .map((s) => ({ id: s.id, name: s.name }))
                  : (implants.data ?? []).map((s) => ({ id: s.id, name: s.name }))
              }

              onImplantSystemPick={(id) => {
                if (focusedTooth == null || !id) return;
                // Define o sistema no caso se ainda vazio; marca dente(s) como implante
                // e associa o sistema escolhido a cada dente.
                if (!implantSystemId) setImplantSystemId(id);
                const targets = configGroup.length ? configGroup : [focusedTooth];
                setImplantTeeth((s) => sortTeeth(Array.from(new Set([...s, ...targets]))));
                setToothImplantSystemMap((m) => {
                  const n = { ...m };
                  targets.forEach((t) => { n[t] = id; });
                  return n;
                });
              }}
              onImplantToggle={() => {
                if (focusedTooth == null) return;
                const targets = configGroup.length ? configGroup : [focusedTooth];
                const anyOn = targets.some((t) => implantTeeth.includes(t));
                if (anyOn) {
                  setImplantTeeth((s) => s.filter((x) => !targets.includes(x)));
                  setToothImplantSystemMap((m) => {
                    const n = { ...m };
                    targets.forEach((t) => { delete n[t]; });
                    return n;
                  });
                }
              }}

              onRemoveTooth={() => {
                if (focusedTooth == null) return;
                const targets = configGroup.length ? configGroup : [focusedTooth];
                const tset = new Set(targets);
                setTeeth((s) => s.filter((x) => !tset.has(x)));
                setZirTeeth((s) => s.filter((x) => !tset.has(x)));
                setDisTeeth((s) => s.filter((x) => !tset.has(x)));
                setImplantTeeth((s) => s.filter((x) => !tset.has(x)));
                setToothTypeMap((m) => {
                  const n = { ...m };
                  targets.forEach((t) => { delete n[t]; });
                  return n;
                });
                setFocusedTooth(null);
                setConfigGroup([]);
              }}
              onConfirm={closePanel}
              onClose={closePanel}
              onClear={() => {
                if (focusedTooth == null) return;
                const targets = configGroup.length ? configGroup : [focusedTooth];
                const tset = new Set(targets);
                setZirTeeth((s) => s.filter((x) => !tset.has(x)));
                setDisTeeth((s) => s.filter((x) => !tset.has(x)));
                setImplantTeeth((s) => s.filter((x) => !tset.has(x)));
                setToothTypeMap((m) => {
                  const n = { ...m };
                  targets.forEach((t) => { delete n[t]; });
                  return n;
                });
                setToothImplantSystemMap((m) => {
                  const n = { ...m };
                  targets.forEach((t) => { delete n[t]; });
                  return n;
                });
                setToothEnceramento((m) => {
                  const n = { ...m };
                  targets.forEach((t) => { delete n[t]; });
                  return n;
                });
                // Sem nenhuma configuração o dente não faz mais parte do caso;
                // mantê-lo em `teeth` faria a arcada exibi-lo como selecionado
                // (azul) para quem visualiza o caso.
                setTeeth((s) => s.filter((x) => !tset.has(x)));
              }}
            />
          )}
          {isView && hasImplant && cleanImplantTeeth.length > 0 && (
            <div className="lg:col-span-12 border-t border-border p-6 max-h-72 overflow-y-auto bg-muted/20">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-primary" />
                  <div>
                    <div className="text-sm font-medium">Ti-Base por elemento com implante</div>
                    <p className="text-[11px] text-muted-foreground">
                      Aponte o Ti-Base usado em cada dente. As opções vêm do estoque (componentes com categoria <b>Ti Base</b>).
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortTeeth(cleanImplantTeeth).map((t) => (
                    <div key={`tib-${t}`} className="flex items-center gap-2 bg-card rounded-md border border-border px-3 py-2">
                      <span className="text-xs font-semibold w-7 tabular-nums">{t}</span>
                      <Select
                        value={toothTiBaseMap[t] ?? ""}
                        onValueChange={(v) => setToothTiBaseMap((m) => ({ ...m, [t]: v }))}
                        disabled={!isCadista}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar Ti-Base…" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {(tiBaseOptions.data ?? []).length === 0 && (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                              Nenhum Ti-Base no estoque. Cadastre componentes na categoria "Ti Base".
                            </div>
                          )}
                          {(tiBaseOptions.data ?? []).map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {toothTiBaseMap[t] && isCadista && (
                        <button type="button" onClick={() => setToothTiBaseMap((m) => { const n = { ...m }; delete n[t]; return n; })} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {isView && viewCase && (
            <div className="lg:col-span-2 border-t border-border p-6 space-y-6 bg-background">
              <div data-case-section="attachments">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" /> Arquivos do caso
                </h4>
                <CaseAttachments caseId={viewCase.id} canUpload hideKinds={isCadista ? ["scans"] : []} />
              </div>
              <div data-case-section="comments">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" /> Comentários
                </h4>
                <CaseComments caseId={viewCase.id} />
              </div>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t border-border/60 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md shrink-0 sm:justify-between sm:items-center">
            <div className="flex items-center gap-3">
              {isCreate && (
                <>
                  <AttachButton
                    label="Anexar imagem"
                    icon={<AttachImagesIcon className="h-6 w-6" />}
                    active={pendingGalleryFiles.length > 0}
                    count={pendingGalleryFiles.length}
                    onClick={() => pendingGalleryInput.current?.click()}
                    className="h-11 w-auto px-4 text-xs bg-slate-100/70 border-0 hover:bg-slate-200"
                  />
                  <DropdownMenu open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <div>
                        <AttachButton
                          label="Anexar arquivos"
                          icon={<AttachFilesIcon className="h-6 w-6" />}
                          active={pendingScanFiles.length > 0}
                          count={pendingScanFiles.length}
                          className="h-11 w-auto px-4 text-xs bg-slate-100/70 border-0 hover:bg-slate-200"
                        />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[200px] z-[2500]" align="start">
                      <DropdownMenuItem onClick={() => { pendingKindRef.current = "scans"; setPendingAccept(".stl,.obj,.ply,.zip,.rar,.7z"); pendingScanFileInput.current?.click(); }}>
                        <ScanLine className="h-4 w-4 mr-2" /> Escaneamentos
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { pendingKindRef.current = "model"; setPendingAccept(".stl,.obj,.ply,.zip,.rar,.7z"); pendingScanFileInput.current?.click(); }}>
                        <Box className="h-4 w-4 mr-2" /> Modelo 3D
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { pendingKindRef.current = "fabrication"; setPendingAccept(".stl,.obj,.ply,.zip,.rar,.7z"); pendingScanFileInput.current?.click(); }}>
                        <Wrench className="h-4 w-4 mr-2" /> Arquivo Confecção
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { pendingKindRef.current = "exocad_html"; setPendingAccept(".html"); pendingScanFileInput.current?.click(); }}>
                        <Monitor className="h-4 w-4 mr-2" /> HTML Visualizador
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {isCreate && profile?.full_name && !isSolicitante && (
                <div className="text-[11px] text-muted-foreground font-light ml-2">
                  Protético Responsável: <span className="text-foreground/80">{profile.full_name}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
            {isView ? (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
                {isCadista && hasImplant && cleanImplantTeeth.length > 0 && (
                  <Button onClick={() => saveTiBases.mutate()} disabled={saveTiBases.isPending} className="min-w-[160px] rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 font-normal">
                    {saveTiBases.isPending ? "Salvando..." : "Salvar Ti-Bases"}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={discardAndClose} className="rounded-full">Cancelar</Button>
                {(isCreate || (isEdit && isSolicitante && !editCase?.cadista_id) || (isEdit && !isSolicitante)) && (
                  <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="min-w-[160px] rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 font-normal">
                    {submit.isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar caso"}
                  </Button>
                )}
              </>
            )}
            </div>
          </DialogFooter>
        </DialogContent>

    </Dialog>
  );
}
