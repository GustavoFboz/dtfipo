// Module-level upload manager so uploads keep running even if the dialog closes.
import JSZip from "jszip";
import { uploadCaseAttachment, type CaseAttachmentKind, type CaseAttachment } from "@/lib/api";
import { addCaseActivity, notifyCaseStakeholders } from "@/lib/case-activity";
import { supabase } from "@/integrations/supabase/client";


export type UploadStatus = "queued" | "zipping" | "uploading" | "success" | "error";

export type UploadTask = {
  id: string;
  caseId: string;
  kind: CaseAttachmentKind;
  label: string;            // human-friendly display name (folder name or file name)
  isFolder: boolean;
  fileCount: number;
  status: UploadStatus;
  progress: number;         // 0..100
  message?: string;
  notes?: string;
  startedAt: number;
  finishedAt?: number;
};

type Listener = () => void;

type RetryFn = () => Promise<void>;

const tasks = new Map<string, UploadTask>();
const retryFns = new Map<string, RetryFn>();
const listeners = new Set<Listener>();
const cancelledCases = new Set<string>();
let snapshot: UploadTask[] = [];

function refreshSnapshot() {
  snapshot = Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
}

function emit() {
  refreshSnapshot();
  for (const l of listeners) l();
}

function update(id: string, patch: Partial<UploadTask>) {
  const t = tasks.get(id);
  if (!t) return;
  tasks.set(id, { ...t, ...patch });
  emit();
}

export const uploadManager = {
  subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); },
  getSnapshot(): UploadTask[] { return snapshot; },
  remove(id: string) { tasks.delete(id); retryFns.delete(id); emit(); },
  clearFinished() {
    for (const [id, t] of tasks) if (t.status === "success" || t.status === "error") { tasks.delete(id); retryFns.delete(id); }
    emit();
  },
  canRetry(id: string) { return retryFns.has(id); },
  retry(id: string) {
    const fn = retryFns.get(id);
    const t = tasks.get(id);
    if (!fn || !t) return;
    if (cancelledCases.has(t.caseId)) return;
    update(id, { status: "queued", progress: 0, message: "Tentando novamente...", finishedAt: undefined });
    void fn();
  },
  retryAllFailed() {
    for (const [id, t] of tasks) if (t.status === "error" && retryFns.has(id) && !cancelledCases.has(t.caseId)) this.retry(id);
  },
  isCancelled(caseId: string) { return cancelledCases.has(caseId); },
  cancelCase(caseId: string) {
    cancelledCases.add(caseId);
    // Drop any queued/finished tasks for this case from the dock immediately.
    for (const [id, t] of tasks) {
      if (t.caseId === caseId) {
        retryFns.delete(id);
        if (t.status === "success" || t.status === "error") tasks.delete(id);
        else update(id, { status: "error", message: "Cancelado (caso excluído)", finishedAt: Date.now() });
      }
    }
    // Keep flag for a while so late-arriving uploads self-destruct.
    setTimeout(() => cancelledCases.delete(caseId), 5 * 60 * 1000);
    emit();
  },
};

async function postUploadNotify(
  caseId: string,
  kind: CaseAttachmentKind,
  fileName: string,
  attId: string,
  notes: string | undefined,
  folder: boolean,
  fileCount: number,
) {
  try {
    const { data: caseData } = await supabase
      .from("cases")
      .select("patient:patients(name), cadista:cadistas(name)")
      .eq("id", caseId)
      .single();
    const patientName = (caseData as { patient?: { name?: string } } | null)?.patient?.name || "Paciente";
    const cadistaName = (caseData as { cadista?: { name?: string } } | null)?.cadista?.name || "Cadista";
    const kindLabel: Record<CaseAttachmentKind, string> = {
      elementos: "Arquivos de elementos", model: "Modelos para impressão",
      exocad_html: "Visualizações exocad", scans: "Escaneamentos",
      gallery: "Galeria do caso", comment_image: "Imagem de comentário", other: "Outros arquivos",
    };
    const base = folder
      ? `${cadistaName} enviou a pasta "${fileName}" (${kindLabel[kind]}) — ${fileCount} arquivo(s) — para o caso de ${patientName}.`
      : `${cadistaName} anexou "${fileName}" (${kindLabel[kind]}) ao caso de ${patientName}.`;
    const msg = base + (notes ? ` Obs: ${notes}` : "");
    await Promise.all([
      addCaseActivity(caseId, "upload", msg, [], { attachment_id: attId, file_name: fileName, kind, folder, file_count: fileCount }),
      notifyCaseStakeholders({ caseId, title: folder ? "Pasta anexada" : "Arquivos anexados", content: msg, type: "attachment" }),
    ]);
  } catch (err) { console.error("post-upload notify failed", err); }
}

export function startFileUpload(opts: {
  caseId: string;
  kind: CaseAttachmentKind;
  file: File;
  notes?: string;
  onComplete?: (att?: CaseAttachment) => void;
}): string {
  const id = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const task: UploadTask = {
    id, caseId: opts.caseId, kind: opts.kind, label: opts.file.name,
    isFolder: false, fileCount: 1, status: "uploading", progress: 0,
    notes: opts.notes, startedAt: Date.now(),
  };
  tasks.set(id, task);
  emit();

  const run = async () => {
    try {
      update(id, { status: "uploading", progress: 10, message: "Enviando..." });
      const att = await uploadCaseAttachment(opts.caseId, opts.file, opts.notes, opts.kind);
      // If the case was deleted while uploading, immediately purge this attachment.
      if (cancelledCases.has(opts.caseId)) {
        try {
          const { deleteCaseAttachment } = await import("@/lib/api");
          await deleteCaseAttachment(att);
        } catch { /* ignore */ }
        update(id, { status: "error", progress: 100, finishedAt: Date.now(), message: "Cancelado (caso excluído)" });
        opts.onComplete?.();
        return;
      }
      try {
        const { primeModelThumbFromFile } = await import("@/lib/model-thumb");
        primeModelThumbFromFile(att.storage_path, opts.file);
      } catch { /* ignore */ }
      retryFns.delete(id);
      update(id, { status: "success", progress: 100, finishedAt: Date.now(), message: "Concluído" });
      void postUploadNotify(opts.caseId, opts.kind, opts.file.name, att.id, opts.notes, false, 1);
      opts.onComplete?.(att);
    } catch (e) {
      update(id, { status: "error", message: (e as Error).message || "Falha no upload", finishedAt: Date.now() });
      opts.onComplete?.();
    }
  };
  retryFns.set(id, run);
  void run();


  return id;
}

/**
 * Upload every file in a folder INDIVIDUALLY (no zip). Each file becomes its
 * own attachment. Used for "send folder" when we want preserved per-file
 * structure rather than a zipped archive.
 */
export function startFolderUploadFlat(opts: {
  caseId: string;
  kind: CaseAttachmentKind;
  files: File[];
  notes?: string;
  onComplete?: (att?: CaseAttachment) => void;
  onFileStart?: (file: File) => void;
}): string[] {
  const ids: string[] = [];
  for (const f of opts.files) {
    opts.onFileStart?.(f);
    ids.push(startFileUpload({
      caseId: opts.caseId,
      kind: opts.kind,
      file: f,
      notes: opts.notes,
      onComplete: opts.onComplete,
    }));
  }
  return ids;
}


export function startFolderUpload(opts: {
  caseId: string;
  kind: CaseAttachmentKind;
  files: File[];
  zipName?: string;
  notes?: string;
  onComplete?: () => void;
}): string {
  const id = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let root = "";
  const first = (opts.files[0] as File & { webkitRelativePath?: string })?.webkitRelativePath;
  if (first && first.includes("/")) root = first.split("/")[0];
  const label = (opts.zipName?.trim() || root || `${opts.kind}-${Date.now()}`).replace(/\.zip$/i, "") + ".zip";

  const task: UploadTask = {
    id, caseId: opts.caseId, kind: opts.kind, label,
    isFolder: true, fileCount: opts.files.length, status: "zipping",
    progress: 0, notes: opts.notes, startedAt: Date.now(),
    message: "Compactando...",
  };
  tasks.set(id, task);
  emit();

  const run = async () => {
    try {
      const zip = new JSZip();
      for (const f of opts.files) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        zip.file(rel, f);
      }
      const blob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (m) => update(id, { status: "zipping", progress: Math.round(m.percent * 0.5), message: `Compactando ${Math.round(m.percent)}%` }),
      );
      const zipFile = new File([blob], label, { type: "application/zip" });
      update(id, { status: "uploading", progress: 55, message: "Enviando..." });
      const att = await uploadCaseAttachment(opts.caseId, zipFile, opts.notes, opts.kind);
      if (cancelledCases.has(opts.caseId)) {
        try {
          const { deleteCaseAttachment } = await import("@/lib/api");
          await deleteCaseAttachment(att);
        } catch { /* ignore */ }
        update(id, { status: "error", progress: 100, finishedAt: Date.now(), message: "Cancelado (caso excluído)" });
        return;
      }
      retryFns.delete(id);
      update(id, { status: "success", progress: 100, finishedAt: Date.now(), message: "Concluído" });
      void postUploadNotify(opts.caseId, opts.kind, label, att.id, opts.notes, true, opts.files.length);
      opts.onComplete?.();
    } catch (e) {
      update(id, { status: "error", message: (e as Error).message || "Falha no upload", finishedAt: Date.now() });
    }
  };
  retryFns.set(id, run);
  void run();

  return id;
}
