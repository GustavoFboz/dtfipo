import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Download, Clock, AlertCircle, Trash2, Wrench, Box,
  Eye, ScanLine, MessageSquarePlus, Monitor, Images, Boxes,
  LayoutGrid, List, FolderArchive, MessageSquare, RefreshCw, X, FolderUp,
  Plus, Upload,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import emptyGallery from "@/assets/empty-gallery.png.asset.json";
import emptyModels from "@/assets/empty-models.png.asset.json";
import emptyHtml from "@/assets/empty-html.png.asset.json";

import { toast } from "sonner";
import {
  fetchCaseAttachments,
  getCaseAttachmentUrl,
  deleteCaseAttachment,
  type CaseAttachment,
  type CaseAttachmentKind,
  fetchProfile,
} from "@/lib/api";
import type { UserRole } from "@/lib/types";
import type { CaseRow } from "@/lib/types";
import { addCaseActivity, notifyCaseStakeholders } from "@/lib/case-activity";
import { supabase } from "@/integrations/supabase/client";
import { startFileUpload } from "@/lib/upload-manager";
import { localPreviews } from "@/lib/local-previews";
import { confirm } from "@/lib/confirm";
import { PendingFileDialog } from "./PendingFileDialog";

import { ExocadViewer } from "./ExocadViewer";
import { Lightbox } from "./Lightbox";
import { Model3DViewer } from "./Model3DViewer";
import { Multi3DViewer, type Multi3DFile } from "./Multi3DViewer";
import { ModelThumb } from "./ModelThumb";
import { prefetchModelThumb } from "@/lib/model-thumb";

import { useMultiSelect } from "@/hooks/useMultiSelect";
import { useMarqueeSelection } from "@/hooks/useMarqueeSelection";
import { onAttachmentFocus } from "@/lib/attachment-focus";

function timeLeft(iso: string): { label: string; expired: boolean; warn: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: "expirado", expired: true, warn: false };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, expired: false, warn: ms < 6 * 3_600_000 };
}
function fmtSize(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_LABEL: Record<CaseAttachmentKind, string> = {
  scans: "Escaneamentos",
  model: "Modelos",
  fabrication: "Elementos",
  exocad_html: "Exocad",
  gallery: "Galeria",
  comment_image: "Imagens de comentário",
  other: "Outros",
};

type UploadKind = "scans" | "model" | "fabrication" | "exocad_html" | "gallery";

const ACCEPT: Record<UploadKind, string | undefined> = {
  scans: ".stl,.ply,.dcm,.obj,.3mf,.zip",
  model: ".stl,.obj,.3mf,.ply,.dcm,.zip",
  fabrication: ".stl,.obj,.zip,.3mf,.ply,.dcm",
  exocad_html: ".html,.htm",
  gallery: "image/*",
};

// Extensões que representam arquivos 3D nas abas de Escaneamentos/Modelos/Elementos.
const RE_3D_ANY = /\.(stl|ply|dcm|obj|3mf)$/i;
// Extensões cuja miniatura 3D é renderizável pelo ModelThumb hoje.
const RE_3D_THUMB = /\.(stl|ply)$/i;

function UploadButton({
  caseId, kind, onUploaded, compact = false, startUpload,
}: {
  caseId: string;
  kind: UploadKind;
  onUploaded: () => void;
  compact?: boolean;
  startUpload: (args: { kind: UploadKind; files: File[]; notes?: string }) => void;
}) {
  void caseId; void onUploaded;
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const Icon = kind === "scans" ? ScanLine : kind === "model" ? Box : kind === "exocad_html" ? Monitor : kind === "gallery" ? Images : Wrench;

  const handleMulti = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (files.length > 20) {
      const ok = await confirm({
        title: "Envio em lote",
        description: `Você selecionou ${files.length} arquivos. Deseja enviar todos?`,
        confirmText: "Enviar",
      });
      if (!ok) { if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    }
    startUpload({ kind, files, notes: notes || undefined });
    toast.success(
      files.length === 1
        ? `"${files[0].name}" enviando em segundo plano`
        : `${files.length} arquivo(s) enviando em segundo plano`,
    );
    setNotes(""); setShowNotes(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const inputs = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ACCEPT[kind]}
        multiple
        onChange={(e) => handleMulti(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        // @ts-expect-error non-standard attributes for directory upload
        webkitdirectory=""
        directory=""
        onChange={(e) => handleMulti(e.target.files)}
      />
    </>
  );

  if (compact) {
    const label = "Carregar arquivos";
    return (
      <div className="space-y-2">
        {showNotes && (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Comentário deste envio (opcional)"
            className="text-xs"
          />
        )}
        <div className="flex items-center gap-2">
          <Button
            onClick={(e) => { 
              console.log("UploadButton file click");
              e.preventDefault(); 
              e.stopPropagation(); 
              fileInputRef.current?.click(); 
            }}
            className="flex-1 h-11 gap-2 text-white"
            style={{ backgroundColor: "#1F8AFF" }}
          >
            <Icon className="h-4 w-4" /> {label}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            title="Carregar pasta"
            aria-label="Carregar pasta"
            onClick={(e) => { 
              console.log("UploadButton folder click");
              e.preventDefault(); 
              e.stopPropagation(); 
              folderInputRef.current?.click(); 
            }}
          >
            <FolderUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            title="Adicionar comentário"
            aria-label="Adicionar comentário"
            onClick={() => setShowNotes((v) => !v)}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
        {inputs}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Button
          variant="outline"
          onClick={(e) => { 
            console.log("Empty state big button click");
            e.preventDefault(); 
            e.stopPropagation(); 
            fileInputRef.current?.click(); 
          }}
          className="w-full h-28 flex flex-col items-center justify-center gap-2 border-2 border-dashed hover:border-primary hover:bg-primary/5 transition"
        >
          <Icon className="h-8 w-8 text-primary" />
          <span className="text-sm font-semibold">{KIND_LABEL[kind]}</span>
          <span className="text-[10.5px] text-muted-foreground">selecione um ou vários</span>
        </Button>

        <button
          type="button"
          aria-label="Adicionar comentário"
          title="Adicionar comentário"
          onClick={(e) => { e.stopPropagation(); setShowNotes((v) => !v); }}
          className={`absolute top-1.5 right-1.5 h-7 w-7 rounded-md flex items-center justify-center border ${showNotes || notes ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:text-foreground border-border"}`}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Carregar pasta"
          title="Carregar pasta"
          onClick={(e) => { 
            console.log("Empty state folder icon click");
            e.stopPropagation(); 
            folderInputRef.current?.click(); 
          }}
          className="absolute top-1.5 left-1.5 h-7 w-7 rounded-md flex items-center justify-center border bg-background text-muted-foreground hover:text-foreground border-border"
        >
          <FolderUp className="h-3.5 w-3.5" />
        </button>
      </div>

      {showNotes && (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Comentário deste envio (opcional)"
          className="text-xs"
        />
      )}

      {inputs}
    </div>
  );
}


function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
}

function buildZipFolderName(caseRow?: CaseRow | null, sectionLabel?: string): string {
  const patient = caseRow?.patient?.name ?? "paciente";
  const types = (caseRow?.case_types_link ?? [])
    .map((l) => l.case_type?.name)
    .filter(Boolean) as string[];
  const typeLabel = types.length === 0 ? "caso" : types.length === 1 ? types[0] : "conjunto de elementos";
  const color = caseRow?.tooth_color?.code;
  const parts = [patient, typeLabel];
  if (color) parts.push(color);
  if (sectionLabel) parts.push(sectionLabel);
  return sanitize(parts.join(" - "));
}

/** Prefixa o nome do arquivo com o nome do paciente:  "Paciente - arquivo.ext". */
function fileNameWithPatient(caseRow: CaseRow | null | undefined, originalName: string): string {
  const patient = caseRow?.patient?.name?.trim();
  if (!patient) return sanitize(originalName);
  return sanitize(`${patient} - ${originalName}`);
}




const EMPTY_META: Record<UploadKind, { img: string; title: string; hint: string }> = {
  gallery: {
    img: emptyGallery.url,
    title: "Nenhuma imagem por aqui",
    hint: "Arraste imagens para esta aba ou use o botão + para adicionar arquivos à galeria do caso.",
  },
  model: {
    img: emptyModels.url,
    title: "Nenhum modelo por aqui",
    hint: "Arraste arquivos 3D para esta aba ou use o botão + para adicionar modelos ao caso.",
  },
  scans: {
    img: emptyModels.url,
    title: "Nenhum escaneamento por aqui",
    hint: "Arraste escaneamentos para esta aba ou use o botão + para adicionar arquivos ao caso.",
  },
  fabrication: {
    img: emptyModels.url,
    title: "Nenhum arquivo de elementos",
    hint: "Arraste arquivos de elementos para esta aba ou use o botão + para adicioná-los ao caso.",
  },
  exocad_html: {
    img: emptyHtml.url,
    title: "Nenhum HTML por aqui",
    hint: "Arraste visualizações exocad (.html) para esta aba ou use o botão + para adicioná-las ao caso.",
  },
};

function EmptyTabState({ kind }: { kind: UploadKind }) {
  const m = EMPTY_META[kind];
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 min-h-[460px]">
      <img
        src={m.img}
        alt=""
        draggable={false}
        className="w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 object-contain mb-6 select-none"
      />
      <h3 className="text-xl sm:text-2xl font-semibold text-foreground">{m.title}</h3>
      <p className="text-sm sm:text-base text-muted-foreground max-w-md mt-2.5 leading-relaxed">
        {m.hint}
      </p>
    </div>
  );
}

function UploadFab({
  kind, startUpload,
}: {
  kind: UploadKind;
  startUpload: (args: { kind: UploadKind; files: File[]; notes?: string }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const handleMulti = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (files.length > 20) {
      const ok = await confirm({
        title: "Envio em lote",
        description: `Você selecionou ${files.length} arquivos. Deseja enviar todos?`,
        confirmText: "Enviar",
      });
      if (!ok) return;
    }
    startUpload({ kind, files });
    toast.success(
      files.length === 1
        ? `"${files[0].name}" enviando em segundo plano`
        : `${files.length} arquivo(s) enviando em segundo plano`,
    );
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden pointer-events-none"
        accept={ACCEPT[kind]}
        multiple
        onChange={(e) => { handleMulti(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        // @ts-expect-error non-standard attributes for directory upload
        webkitdirectory=""
        directory=""
        onChange={(e) => { handleMulti(e.target.files); e.target.value = ""; }}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild className="pointer-events-auto">
          <button
            type="button"
            title="Adicionar arquivos"
            aria-label="Adicionar arquivos"
            onClick={(e) => {
              console.log("FAB button click event");
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              console.log("FAB pointer down event");
              e.stopPropagation();
            }}
            className="fixed bottom-6 right-6 z-[9999] h-14 w-14 rounded-full shadow-lg flex items-center justify-center text-white transition hover:scale-105 active:scale-95 cursor-pointer pointer-events-auto"
            style={{ backgroundColor: "#1F8AFF" }}
          >
            <Plus className="h-6 w-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-56 z-[10000] pointer-events-auto">
          <DropdownMenuItem 
            onSelect={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("Upload files clicked");
              fileInputRef.current?.click();
            }} 
            className="gap-2 cursor-pointer py-3 pointer-events-auto"
          >
            <Upload className="h-4 w-4" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Enviar arquivos</span>
              <span className="text-[11px] text-muted-foreground">Um ou vários arquivos</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onSelect={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("Upload folder clicked");
              folderInputRef.current?.click();
            }} 
            className="gap-2 cursor-pointer py-3 pointer-events-auto"
          >
            <FolderUp className="h-4 w-4" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Enviar pasta</span>
              <span className="text-[11px] text-muted-foreground">Toda a estrutura de uma pasta</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

async function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}


export function CaseAttachments({ caseId, canUpload = true, hideKinds = [], onlyKind, caseRow }: { caseId: string; canUpload?: boolean; hideKinds?: UploadKind[]; onlyKind?: UploadKind; caseRow?: CaseRow | null }) {
  const qc = useQueryClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const isStaff = currentRole ? ["CEO", "PROTETICO", "ATENDIMENTO", "DR", "CADISTA"].includes(currentRole) : false;
  const canDeleteAtt = (a: CaseAttachment) =>
    !!currentUserId && (isStaff || a.uploaded_by === currentUserId || a.uploaded_by == null);
  const [viewer, setViewer] = useState<{ path: string; name: string } | null>(null);
  const [viewer3D, setViewer3D] = useState<{ path: string; name: string; id: string; uploadedAt: string } | null>(null);
  const [multi3D, setMulti3D] = useState<Multi3DFile[] | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [galleryView, setGalleryView] = useState<"grid" | "list">("grid");
  const [modelView, setModelView] = useState<"grid" | "list">("grid");
  const [zipping, setZipping] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Per-row "replace" inputs — keyed by attachment id.
  const replaceInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  // Multi-selection (Shift = range, Ctrl/Cmd = toggle, drag = marquee).
  const select = useMultiSelect();
  const marquee = useMarqueeSelection({
    itemAttr: "data-att-id",
    onSelect: (ids, additive) => select.setMany(ids, additive),
  });

  // Reset cached signed URLs when switching cases/tabs (forces fresh load on reopen).
  useEffect(() => { setGalleryUrls({}); select.clear(); }, [caseId, onlyKind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vindo de uma miniatura no chat: pré-seleciona e rola até o anexo.
  useEffect(() => {
    return onAttachmentFocus((req) => {
      if (req.caseId !== caseId) return;
      if (onlyKind && req.kind !== onlyKind) return;
      let tries = 0;
      const tick = () => {
        const el = document.querySelector<HTMLElement>(`[data-att-id="${req.attachmentId}"]`);
        if (el) {
          select.setMany([req.attachmentId], false);
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
        if (tries++ < 20) window.setTimeout(tick, 150);
      };
      tick();
    });
  }, [caseId, onlyKind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    fetchProfile().then((p) => setCurrentRole((p?.role as UserRole) ?? null));
  }, []);

  const { data } = useQuery({
    queryKey: ["case_attachments", caseId],
    queryFn: async () => {
      const fresh = await fetchCaseAttachments(caseId);
      // Preserve any still-in-flight optimistic rows so a refetch never
      // makes previously-uploaded/pending files "blink" out of the list.
      const current = qc.getQueryData<CaseAttachment[]>(["case_attachments", caseId]) ?? [];
      const freshIds = new Set(fresh.map((a) => a.id));
      const pending = current.filter(
        (a) => a.id.startsWith("optimistic-") && !freshIds.has(a.id),
      );
      return pending.length ? [...pending, ...fresh] : fresh;
    },
    staleTime: 2_000,
    refetchOnMount: true,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const applyRow = (row: CaseAttachment | null | undefined, op: "insert" | "update" | "delete") => {
      if (!row?.id) return;
      qc.setQueryData<CaseAttachment[]>(["case_attachments", caseId], (old) => {
        const list = old ?? [];
        if (op === "delete") return list.filter((a) => a.id !== row.id);
        // INSERT/UPDATE: replace by id if present, else prepend. Also drop any
        // optimistic placeholder whose storage_path matches the incoming row.
        const withoutDupes = list.filter(
          (a) => a.id !== row.id && !(a.id.startsWith("optimistic-") && a.storage_path === row.storage_path),
        );
        const existed = list.some((a) => a.id === row.id);
        if (existed) {
          // update in place, keep order
          return list.map((a) => (a.id === row.id ? { ...a, ...row } : a));
        }
        return [row, ...withoutDupes];
      });
    };

    const channel = supabase
      .channel(`case-attachments-${caseId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "case_attachments", filter: `case_id=eq.${caseId}` },
        (payload) => {
          const evt = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (evt === "DELETE" ? payload.old : payload.new) as unknown as CaseAttachment;
          applyRow(row, evt.toLowerCase() as "insert" | "update" | "delete");
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "case_activity", filter: `case_id=eq.${caseId}` },
        () => qc.invalidateQueries({ queryKey: ["case_activity", caseId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [caseId, qc]);


  const remove = useMutation({
    mutationFn: async (att: CaseAttachment) => {
      await deleteCaseAttachment(att);
      await addCaseActivity(caseId, "delete_upload", `Removeu o arquivo "${att.file_name}".`, [], { file_name: att.file_name });
      await notifyCaseStakeholders({ caseId, title: "Arquivo removido", content: `O arquivo "${att.file_name}" foi removido do caso.`, type: "attachment" });
    },
    // Optimistic: drop from cache instantly so the row disappears the moment the user confirms.
    onMutate: async (att) => {
      await qc.cancelQueries({ queryKey: ["case_attachments", caseId] });
      const prev = qc.getQueryData<CaseAttachment[]>(["case_attachments", caseId]);
      qc.setQueryData<CaseAttachment[]>(["case_attachments", caseId], (old) =>
        (old ?? []).filter((a) => a.id !== att.id),
      );
      return { prev };
    },
    onError: (e: Error, _att, ctx) => {
      if (ctx?.prev) qc.setQueryData(["case_attachments", caseId], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => {
      toast.success("Arquivo excluído");
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
    },
  });


  // O usuário está vendo os anexos deste caso: derruba na hora as notificações
  // relacionadas a arquivos na central de notificações.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { markCaseNotificationsRead } = await import("@/lib/api");
      const ids = await markCaseNotificationsRead(caseId, ["attachment"]);
      if (cancelled || ids.length === 0) return;
      const nowIso = new Date().toISOString();
      const idSet = new Set(ids);
      qc.setQueryData(["notifications"], (old: unknown) =>
        Array.isArray(old)
          ? old.map((n: { id: string; read_at: string | null }) =>
              idSet.has(n.id) ? { ...n, read_at: n.read_at ?? nowIso } : n)
          : old,
      );
      qc.invalidateQueries({ queryKey: ["notifications"] });
    })();
    return () => { cancelled = true; };
  }, [caseId, qc]);

  /** Arquivo ainda em envio (linha otimista) — não existe no storage ainda. */
  const isPendingUpload = (a: { storage_path?: string | null }) =>
    !!a.storage_path && a.storage_path.startsWith("__local__/");

  /** Retorna true (e abre o aviso) quando o arquivo ainda está sendo enviado. */
  const guardPending = (a: { storage_path?: string | null; file_name?: string }) => {
    if (!isPendingUpload(a)) return false;
    setPendingNotice(a.file_name ?? null);
    return true;
  };

  const download = async (att: CaseAttachment) => {
    if (guardPending(att)) return;
    try {
      const url = await getCaseAttachmentUrl(att.storage_path);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Falha ao baixar arquivo");
      const blob = await res.blob();
      await triggerBlobDownload(blob, fileNameWithPatient(caseRow, att.file_name));
      await addCaseActivity(caseId, "download", `Baixou o arquivo "${att.file_name}".`, [], { kind: att.kind ?? "other", file_name: att.file_name }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
      qc.invalidateQueries({ queryKey: ["case_scan_downloads", caseId] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const onUploaded = () => {
    // No-op on the attachments list: the optimistic swap in insertOptimistic
    // and the realtime patch already reflect the new row, and any refetch
    // now preserves in-flight optimistic rows. Keep activity in sync only.
    qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
  };

  /**
   * Insert an optimistic attachment row into the React Query cache so the file
   * appears in the list INSTANTLY. The real upload runs in the background;
   * on completion we swap the placeholder for the real row and carry the
   * in-memory preview (used by ModelThumb / gallery <img>) to the real
   * storage_path so thumbnails never have to re-download from the server.
   */
  const insertOptimistic = (file: File, kind: CaseAttachmentKind, notes?: string) => {
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempPath = `__local__/${tempId}`;
    localPreviews.set(tempPath, file);
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    const optimistic: CaseAttachment = {
      id: tempId,
      case_id: caseId,
      file_name: file.name,
      storage_path: tempPath,
      size_bytes: file.size,
      mime_type: file.type || null,
      uploaded_by: currentUserId,
      uploaded_at: nowIso,
      expires_at: expiresIso,
      expired_at: null,
      notes: notes ?? null,
      kind,
    };
    qc.setQueryData<CaseAttachment[]>(["case_attachments", caseId], (old) => [optimistic, ...(old ?? [])]);

    startFileUpload({
      caseId,
      kind,
      file,
      notes,
      onComplete: (att) => {
        if (att) {
          localPreviews.transfer(tempPath, att.storage_path);
          qc.setQueryData<CaseAttachment[]>(["case_attachments", caseId], (old) =>
            (old ?? []).map((a) => (a.id === tempId ? att : a)),
          );
        } else {
          // Upload failed: drop optimistic row + its preview.
          localPreviews.delete(tempPath);
          qc.setQueryData<CaseAttachment[]>(["case_attachments", caseId], (old) =>
            (old ?? []).filter((a) => a.id !== tempId),
          );
        }
        onUploaded();
      },
    });
  };

  const startUploadFromButton = ({ kind, files, notes }: { kind: UploadKind; files: File[]; notes?: string }) => {
    for (const f of files) insertOptimistic(f, kind as CaseAttachmentKind, notes);
  };

  /**
   * Replace a single attachment: upload the new file with the same kind/notes,
   * then delete the old one. Triggered by the per-row "Substituir" button.
   */
  const replaceFile = async (att: CaseAttachment, file: File) => {
    const kind = (att.kind ?? "other") as CaseAttachmentKind;
    try {
      insertOptimistic(file, kind, att.notes ?? undefined);
      try {
        await deleteCaseAttachment(att);
        await addCaseActivity(
          caseId, "delete_upload",
          `Substituiu o arquivo "${att.file_name}" por "${file.name}".`,
          [], { file_name: att.file_name, replaced_by: file.name },
        );
      } catch (e) { console.warn("replace cleanup", e); }
      toast.success(`Substituindo "${att.file_name}" por "${file.name}"...`);
    } catch (e) { toast.error((e as Error).message); }
  };


  const grouped = useMemo(() => {
    const g: Record<CaseAttachmentKind, CaseAttachment[]> = { fabrication: [], model: [], exocad_html: [], scans: [], gallery: [], comment_image: [], other: [] };
    for (const a of data ?? []) {
      const k = (a.kind ?? "other") as CaseAttachmentKind;
      (g[k] ?? g.other).push(a);
    }
    return g;
  }, [data]);

  // Prewarm STL/PLY thumbnails para Modelos, Escaneamentos e Elementos — mesmo
  // antes de abrir a aba — para que a troca seja instantânea e o cache do
  // IndexedDB sirva os thumbs após um reload.
  useEffect(() => {
    const pool = [...grouped.model, ...grouped.scans, ...grouped.fabrication];
    for (const a of pool) {
      if (a.expired_at) continue;
      if (RE_3D_THUMB.test(a.file_name)) prefetchModelThumb(a.storage_path, a.file_name);
    }
  }, [grouped.model, grouped.scans, grouped.fabrication]);


  // Linear order of all visible attachments — used for Shift-range click.
  const orderedIds = useMemo(() => (data ?? []).map((a) => a.id), [data]);
  const idToAtt = useMemo(() => {
    const m = new Map<string, CaseAttachment>();
    (data ?? []).forEach((a) => m.set(a.id, a));
    return m;
  }, [data]);

  // Esc clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") select.clear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const selectedAtts = useMemo(
    () => Array.from(select.selected).map((id) => idToAtt.get(id)).filter(Boolean) as CaseAttachment[],
    [select.selected, idToAtt],
  );

  const bulkDelete = async () => {
    const items = selectedAtts.filter(canDeleteAtt);
    if (items.length === 0) { toast.info("Nada para excluir."); return; }
    if (!(await confirm({ title: "Excluir arquivos", description: `Excluir ${items.length} arquivo(s) selecionado(s)?`, confirmText: "Excluir", destructive: true }))) return;

    // Optimistic: remove from list + clear selection imediatamente.
    const idsToRemove = new Set(items.map((a) => a.id));
    await qc.cancelQueries({ queryKey: ["case_attachments", caseId] });
    const prev = qc.getQueryData<CaseAttachment[]>(["case_attachments", caseId]);
    qc.setQueryData<CaseAttachment[]>(["case_attachments", caseId], (old) =>
      (old ?? []).filter((a) => !idsToRemove.has(a.id)),
    );
    select.clear();

    setBulkDeleting(true);
    let ok = 0;
    for (const a of items) {
      try {
        await deleteCaseAttachment(a);
        await addCaseActivity(caseId, "delete_upload", `Removeu o arquivo "${a.file_name}".`, [], { file_name: a.file_name });
        ok += 1;
      } catch (e) { console.warn("bulk delete", e); }
    }
    setBulkDeleting(false);
    if (ok < items.length) {
      // Algo falhou — restaurar estado real do servidor.
      if (prev) qc.setQueryData(["case_attachments", caseId], prev);
      qc.invalidateQueries({ queryKey: ["case_attachments", caseId] });
      toast.error(`${items.length - ok} arquivo(s) não puderam ser excluídos`);
    }
    qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
    if (ok > 0) toast.success(`${ok} arquivo(s) excluído(s)`);
  };


  const bulkDownloadZip = async () => {
    if (selectedAtts.length === 0) { toast.info("Nada selecionado."); return; }
    setZipping(true);
    try {
      const JSZipMod = (await import("jszip")).default;
      const zip = new JSZipMod();
      const folderName = buildZipFolderName(caseRow, onlyKind ? KIND_LABEL[onlyKind as CaseAttachmentKind] : undefined);

      const folder = zip.folder(folderName)!;
      const used = new Set<string>();
      for (const a of selectedAtts) {
        const url = await getCaseAttachmentUrl(a.storage_path);
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        let name = fileNameWithPatient(caseRow, a.file_name);
        let i = 1;
        while (used.has(name)) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
          i++;
        }
        used.add(name);
        folder.file(name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const dlUrl = URL.createObjectURL(out);
      const link = document.createElement("a");
      link.href = dlUrl;
      link.download = `${folderName}-selecionados.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(dlUrl);
      await addCaseActivity(caseId, "download", "Baixou arquivos selecionados em ZIP.", [], { kind: onlyKind ?? "mixed", file_count: selectedAtts.length }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
      qc.invalidateQueries({ queryKey: ["case_scan_downloads", caseId] });
      toast.success("ZIP gerado");
    } catch (e) { toast.error((e as Error).message); }
    finally { setZipping(false); }
  };

  // Click handler attached to every selectable row/tile.
  const onItemClick = (id: string) => (e: React.MouseEvent) => {
    // Don't hijack clicks on row action buttons (download/delete/replace/etc).
    const target = e.target as HTMLElement;
    if (target.closest("button,a,input,[role='button']")) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      select.handleClick(id, e, orderedIds);
      return;
    }
    if (select.selected.size > 0) {
      e.preventDefault();
      e.stopPropagation();
      select.handleClick(id, e, orderedIds);
    }
  };



  // Per-row action buttons reused by both list and model-grid rendering.
  const rowActions = (a: CaseAttachment, kind: CaseAttachmentKind, isGone: boolean) => {
    const canDelete = canDeleteAtt(a);
    const canReplace = canDelete && !isGone;
    return (
      <>
        {a.notes && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" title="Ver comentário" aria-label="Ver comentário"
                className="text-primary hover:text-primary">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="max-w-xs text-sm whitespace-pre-wrap">
              {a.notes}
            </PopoverContent>
          </Popover>
        )}
        {kind === "exocad_html" && !isGone && (
          <Button size="sm" variant="ghost" onClick={() => { if (!guardPending(a)) setViewer({ path: a.storage_path, name: a.file_name }); }}>
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {!isGone && /\.(stl|ply)$/i.test(a.file_name) && (
          <Button size="sm" variant="ghost" title="Visualizar em 3D"
            onClick={() => { if (!guardPending(a)) setViewer3D({ path: a.storage_path, name: a.file_name, id: a.id, uploadedAt: a.uploaded_at }); }}>
            <Boxes className="h-4 w-4" />
          </Button>
        )}
        {!isGone && (
          <Button size="sm" variant="ghost" onClick={() => download(a)} title="Baixar">
            <Download className="h-4 w-4" />
          </Button>
        )}
        {canReplace && (
          <>
            <input
              ref={(el) => { replaceInputsRef.current[a.id] = el; }}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) replaceFile(a, f);
              }}
            />
            <Button size="sm" variant="ghost" title="Substituir arquivo" aria-label="Substituir arquivo"
              onClick={() => replaceInputsRef.current[a.id]?.click()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        )}
        {canDelete && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
            disabled={remove.isPending}
            onClick={async () => { if (await confirm({ title: "Excluir arquivo", description: `Excluir "${a.file_name}"?`, confirmText: "Excluir", destructive: true })) remove.mutate(a); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </>
    );
  };

  const renderList = (items: CaseAttachment[], kind: CaseAttachmentKind) => {
    if (items.length === 0) return <p className="text-xs text-muted-foreground">Nenhum arquivo.</p>;
    return (
      <ul className="space-y-1.5">
        {items.map((a) => {
          const tl = timeLeft(a.expires_at);
          const isGone = !!a.expired_at || tl.expired;
          const isSel = select.selected.has(a.id);
          return (
            <li
              key={a.id}
              data-att-id={a.id}
              onClick={onItemClick(a.id)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm cursor-pointer select-none ${isGone ? "bg-muted/30 border-border opacity-70" : "bg-card border-border"} ${isSel ? "ring-2 ring-primary border-primary bg-primary/5" : ""}`}
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.file_name}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{fmtSize(a.size_bytes)}</span><span>·</span>
                  <span>{new Date(a.uploaded_at).toLocaleString("pt-BR")}</span>
                  {isGone ? (
                    <span className="inline-flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> expirado</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 ${tl.warn ? "text-amber-500" : "text-muted-foreground"}`}>
                      <Clock className="h-3 w-3" /> expira em {tl.label}
                    </span>
                  )}
                </div>
              </div>
              {rowActions(a, kind, isGone)}
            </li>
          );
        })}
      </ul>
    );
  };

  // Carrega URLs assinadas das imagens da galeria. Para itens recém-enviados
  // (ainda otimistas ou já com preview local), usa o objectUrl em memória —
  // sem ida ao servidor — para que a miniatura apareça imediatamente.
  useEffect(() => {
    const items = grouped.gallery.filter((a) => !a.expired_at);
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      await Promise.all(items.map(async (a) => {
        if (galleryUrls[a.id]) { out[a.id] = galleryUrls[a.id]; return; }
        const local = localPreviews.get(a.storage_path);
        if (local) { out[a.id] = local.objectUrl; return; }
        try { out[a.id] = await getCaseAttachmentUrl(a.storage_path); } catch { /* ignore */ }
      }));
      if (!cancelled) setGalleryUrls((prev) => ({ ...prev, ...out }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.gallery]);

  const galleryItems = grouped.gallery
    .filter((a) => !a.expired_at)
    .map((a) => {
      const local = localPreviews.get(a.storage_path);
      return { id: a.id, url: galleryUrls[a.id] ?? local?.objectUrl ?? "", name: a.file_name, att: a };
    })
    .filter((g) => !!g.url);


  const visibleUploadKinds = (["scans", "model", "fabrication", "exocad_html", "gallery"] as UploadKind[])
    .filter((k) => !hideKinds.includes(k))
    .filter((k) => !onlyKind || k === onlyKind);
  const visibleListKinds = (["scans", "fabrication", "model", "exocad_html", "other"] as CaseAttachmentKind[])
    .filter((k) => !onlyKind || k === onlyKind);
  const showGallerySection = !onlyKind || onlyKind === "gallery";

  // Itens disponíveis para baixar em ZIP no contexto atual (aba)
  const downloadable: CaseAttachment[] = useMemo(() => {
    if (onlyKind === "gallery") return grouped.gallery.filter((a) => !a.expired_at);
    if (onlyKind) return (grouped[onlyKind as CaseAttachmentKind] ?? []).filter((a) => !a.expired_at);
    return (data ?? []).filter((a) => !a.expired_at);
  }, [data, grouped, onlyKind]);

  const downloadZip = async () => {
    if (downloadable.length === 0) {
      toast.info("Nenhum arquivo para baixar.");
      return;
    }
    setZipping(true);
    try {
      const JSZipMod = (await import("jszip")).default;
      const zip = new JSZipMod();
      const folderName = buildZipFolderName(caseRow, onlyKind ? KIND_LABEL[onlyKind as CaseAttachmentKind] : undefined);
      const folder = zip.folder(folderName)!;
      const used = new Set<string>();
      for (const a of downloadable) {
        const url = await getCaseAttachmentUrl(a.storage_path);
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        let name = fileNameWithPatient(caseRow, a.file_name);
        let i = 1;
        while (used.has(name)) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
          i++;
        }
        used.add(name);
        folder.file(name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const dlUrl = URL.createObjectURL(out);
      const link = document.createElement("a");
      link.href = dlUrl;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(dlUrl);
      await addCaseActivity(caseId, "download", `Baixou ZIP da aba "${onlyKind ? KIND_LABEL[onlyKind as CaseAttachmentKind] : "Arquivos"}".`, [], { kind: onlyKind ?? "mixed", file_count: downloadable.length }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["case_activity", caseId] });
      qc.invalidateQueries({ queryKey: ["case_scan_downloads", caseId] });
      toast.success("ZIP gerado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setZipping(false);
    }
  };

  const isGalleryTab = onlyKind === "gallery";
  // Abas 3D — Escaneamentos, Modelos e Elementos compartilham a mesma
  // apresentação (grade de miniaturas 3D / lista) e o mesmo estado de view.
  const is3DTab = onlyKind === "model" || onlyKind === "scans" || onlyKind === "fabrication";
  const items3D = onlyKind && is3DTab
    ? (grouped[onlyKind as CaseAttachmentKind] ?? []).filter((a) => !a.expired_at)
    : [];

  return (
    <div
      ref={marquee.containerRef}
      onMouseDown={marquee.onMouseDown}
      className="space-y-4 flex flex-col relative"
    >
      {/* Barra de seleção múltipla */}
      {select.selected.size > 0 && (
        <div className="sticky top-0 z-30 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          <span className="font-medium">{select.selected.size} selecionado(s)</span>
          <span className="text-xs text-muted-foreground hidden md:inline">
            (Shift = intervalo · Ctrl/Cmd = alternar · arraste = seleção em área · Esc = limpar)
          </span>
          <div className="ml-auto flex items-center gap-2">
            {(() => {
              const stlPly = selectedAtts.filter((a) => /\.(stl|ply)$/i.test(a.file_name));
              if (stlPly.length < 2) return null;
              return (
                <Button
                  type="button" size="sm" variant="outline" className="gap-1.5"
                  onClick={() => {
                    const stillUploading = stlPly.find(isPendingUpload);
                    if (stillUploading) { setPendingNotice(stillUploading.file_name); return; }
                    setMulti3D(stlPly.map((a) => ({ id: a.id, storagePath: a.storage_path, fileName: a.file_name })));
                  }}
                >
                  <Boxes className="h-4 w-4" /> Ver em oclusão ({stlPly.length})
                </Button>
              );
            })()}
            <Button type="button" size="sm" variant="outline" disabled={zipping} onClick={bulkDownloadZip} className="gap-1.5">
              <FolderArchive className="h-4 w-4" />
              {zipping ? "Gerando..." : "Baixar ZIP"}
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={bulkDeleting} onClick={bulkDelete} className="gap-1.5">
              <Trash2 className="h-4 w-4" /> {bulkDeleting ? "Excluindo..." : "Excluir"}
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => select.clear()} title="Limpar seleção">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {marquee.marqueeStyle && <div style={marquee.marqueeStyle} />}
      {/* Toolbar superior: visualização + download zip */}
      {onlyKind && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(isGalleryTab || is3DTab) && (
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => isGalleryTab ? setGalleryView("grid") : setModelView("grid")}
                  className={`h-8 px-2.5 inline-flex items-center gap-1.5 text-xs ${(isGalleryTab ? galleryView : modelView) === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground/70 hover:bg-muted"}`}
                  title="Miniaturas"
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Miniaturas
                </button>
                <button
                  type="button"
                  onClick={() => isGalleryTab ? setGalleryView("list") : setModelView("list")}
                  className={`h-8 px-2.5 inline-flex items-center gap-1.5 text-xs border-l border-border ${(isGalleryTab ? galleryView : modelView) === "list" ? "bg-primary text-primary-foreground" : "bg-background text-foreground/70 hover:bg-muted"}`}
                  title="Lista"
                >
                  <List className="h-3.5 w-3.5" /> Lista
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estado vazio (abas específicas) */}
      {onlyKind && (() => {
        const empty =
          onlyKind === "gallery" ? grouped.gallery.length === 0 :
          onlyKind === "exocad_html" ? grouped.exocad_html.length === 0 :
          is3DTab ? items3D.length === 0 : false;
        return empty ? <EmptyTabState kind={onlyKind} /> : null;
      })()}

      {/* Galeria — miniaturas ou lista */}
      {showGallerySection && grouped.gallery.length > 0 && (
        <div className="space-y-2">
          {!onlyKind && (
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Images className="h-3.5 w-3.5" /> Galeria do caso ({galleryItems.length})
            </div>
          )}
          {(!isGalleryTab || galleryView === "grid") ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {galleryItems.map((g, i) => {
                const canDelete = canDeleteAtt(g.att);
                const isSel = select.selected.has(g.id);
                return (
                  <div
                    key={g.id}
                    data-att-id={g.id}
                    className={`group relative aspect-square rounded-lg overflow-hidden border bg-muted ${isSel ? "ring-2 ring-primary border-primary" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        if (e.shiftKey || e.metaKey || e.ctrlKey || select.selected.size > 0) {
                          e.preventDefault(); e.stopPropagation();
                          select.handleClick(g.id, e, orderedIds);
                          return;
                        }
                        if (guardPending(g.att)) return;
                        setLightboxIndex(i);
                      }}
                      className="absolute inset-0"
                    >
                      <img src={g.url} alt={g.name} loading="lazy" draggable={false} className="w-full h-full object-cover transition group-hover:scale-105" />
                    </button>
                    {canDelete && (
                      <button type="button"
                        onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: "Excluir arquivo", description: `Excluir "${g.name}"?`, confirmText: "Excluir", destructive: true })) remove.mutate(g.att); }}
                        className="absolute top-1 right-1 h-6 w-6 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            renderList(grouped.gallery, "gallery")
          )}
          <Lightbox
            open={lightboxIndex !== null}
            images={galleryItems.map((g) => ({ url: g.url, name: g.name }))}
            index={lightboxIndex ?? 0}
            onIndexChange={setLightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        </div>
      )}

      {/* Modelos/Escaneamentos/Elementos — miniaturas com prévia STL/PLY ou lista */}
      {is3DTab && modelView === "grid" ? (
        <div className="flex-1">
          {items3D.length === 0 ? (
            null
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items3D.map((a) => {
                const tl = timeLeft(a.expires_at);
                const isGone = !!a.expired_at || tl.expired;
                const canThumb = RE_3D_THUMB.test(a.file_name);
                const is3DAny = RE_3D_ANY.test(a.file_name);
                const isSel = select.selected.has(a.id);
                const currentKind = (onlyKind ?? "model") as CaseAttachmentKind;
                return (
                  <div
                    key={a.id}
                    data-att-id={a.id}
                    className={`group relative rounded-lg overflow-hidden border bg-card flex flex-col ${isSel ? "ring-2 ring-primary border-primary" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        if (e.shiftKey || e.metaKey || e.ctrlKey || select.selected.size > 0) {
                          e.preventDefault(); e.stopPropagation();
                          select.handleClick(a.id, e, orderedIds);
                          return;
                        }
                        if (guardPending(a)) return;
                        if (canThumb) setViewer3D({ path: a.storage_path, name: a.file_name, id: a.id, uploadedAt: a.uploaded_at });
                        else download(a);
                      }}
                      className="aspect-square block w-full"
                      title={canThumb ? "Abrir visualizador 3D" : "Baixar arquivo"}
                    >
                      {canThumb ? (
                        <ModelThumb storagePath={a.storage_path} fileName={a.file_name} className="w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-muted">
                          <Box className="h-10 w-10 text-muted-foreground" />
                          {is3DAny && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {a.file_name.split(".").pop()}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                    <div className="px-2 py-1.5 border-t border-border/60">
                      <div className="text-xs font-medium truncate" title={a.file_name}>{a.file_name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                        <span>{fmtSize(a.size_bytes)}</span>
                        <span className="flex items-center gap-0.5">{rowActions(a, currentKind, isGone)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          {visibleListKinds.map((k) => (
            (k === "other" && grouped[k].length === 0) || (k === "exocad_html" && grouped[k].length === 0) || (onlyKind && grouped[k].length === 0) ? null : (
              <div key={k} className="space-y-2">
                {!onlyKind && (
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[k]}</div>
                )}
                {renderList(grouped[k], k)}
              </div>
            )
          ))}
        </div>
      )}

      {/* Upload — FAB fixo no canto (abas específicas) ou grid (visão geral) */}
      {canUpload && visibleUploadKinds.length > 0 && (
        onlyKind ? (
          <UploadFab kind={onlyKind} startUpload={startUploadFromButton} />
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5 pt-2">
            {visibleUploadKinds.map((k) => (
              <UploadButton key={k} caseId={caseId} kind={k} onUploaded={onUploaded} startUpload={startUploadFromButton} />
            ))}
          </div>
        )
      )}



      <PendingFileDialog
        open={pendingNotice !== null}
        fileName={pendingNotice}
        onOpenChange={(v) => { if (!v) setPendingNotice(null); }}
      />

      {viewer && (
        <ExocadViewer
          open={!!viewer}
          onOpenChange={(v) => { if (!v) setViewer(null); }}
          storagePath={viewer.path}
          fileName={viewer.name}
        />
      )}

      {viewer3D && (
        <Model3DViewer
          open={!!viewer3D}
          onOpenChange={(v) => { if (!v) setViewer3D(null); }}
          storagePath={viewer3D.path}
          fileName={viewer3D.name}
          caseId={caseId}
          attachmentId={viewer3D.id}
          uploadedAt={viewer3D.uploadedAt}
        />
      )}

      {multi3D && (
        <Multi3DViewer
          open={!!multi3D}
          onOpenChange={(v) => { if (!v) setMulti3D(null); }}
          files={multi3D}
        />
      )}
    </div>
  );
}
