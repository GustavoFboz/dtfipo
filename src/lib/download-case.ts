/**
 * Download the complete case as a single ZIP:
 *   {Patient Name - Case Type}.zip
 *     ├── Ordem de Serviço.pdf
 *     ├── Galeria/
 *     ├── Escaneamentos/
 *     ├── Modelos/
 *     └── Elementos/
 */
import { fetchCaseAttachments, getCaseAttachmentUrl, type CaseAttachment, type CaseAttachmentKind } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import type { CaseRow } from "@/lib/types";
import { addCaseActivity } from "@/lib/case-activity";
import { getWorkOrderPdfBlob } from "@/lib/work-order";

export type CaseDownloadProgress = {
  percent: number;
  label: string;
};

export type CaseDownloadResult = {
  added: number;
  failed: number;
};

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
}

function buildCaseFolderName(caseRow: CaseRow): string {
  const patient = caseRow.patient?.name ?? "paciente";
  const types = (caseRow.case_types_link ?? [])
    .map((l) => l.case_type?.name)
    .filter(Boolean) as string[];
  const typeLabel = types.length === 0 ? "caso" : types.length === 1 ? types[0] : "conjunto de elementos";
  return sanitize(`${patient} - ${typeLabel}`);
}

const FOLDER_FOR: Record<CaseAttachmentKind, string | null> = {
  gallery: "Galeria",
  scans: "Escaneamentos",
  model: "Modelos",
  fabrication: "Elementos",
  exocad_html: "Exocad",
  comment_image: null, // skip
  other: "Outros",
};

export const SECTION_LABEL: Partial<Record<CaseAttachmentKind, string>> = {
  gallery: "Galeria",
  scans: "Escaneamentos",
  model: "Modelos",
  fabrication: "Elementos",
  exocad_html: "Exocad",
};

async function fetchAttachmentBlob(a: CaseAttachment): Promise<Blob | null> {
  // Prefer direct storage download (no CORS, no signed-URL expiry race).
  try {
    const { data, error } = await supabase.storage.from("case-files").download(a.storage_path);
    if (!error && data) return data;
  } catch { /* fall through */ }
  // Fallback: signed URL fetch.
  try {
    const url = await getCaseAttachmentUrl(a.storage_path);
    const res = await fetch(url);
    if (res.ok) return await res.blob();
  } catch { /* ignore */ }
  return null;
}

export async function downloadCaseZip(
  caseRow: CaseRow,
  onProgress?: (progress: CaseDownloadProgress) => void,
): Promise<CaseDownloadResult> {
  onProgress?.({ percent: 2, label: "Preparando caso" });
  const [{ default: JSZip }, attachments, pdfBlob] = await Promise.all([
    import("jszip"),
    fetchCaseAttachments(caseRow.id),
    getWorkOrderPdfBlob(caseRow),
  ]);

  onProgress?.({ percent: 10, label: "Arquivos localizados" });
  const root = new JSZip();
  const baseName = buildCaseFolderName(caseRow);

  root.file("Ordem de Serviço.pdf", pdfBlob);

  // Ensure standard folders always exist, even when empty.
  const STANDARD_FOLDERS = ["Galeria", "Escaneamentos", "Modelos", "Elementos"];
  for (const f of STANDARD_FOLDERS) root.folder(f);

  const live = attachments.filter((a) => !a.expired_at);
  console.info("[downloadCaseZip] attachments:", attachments.length, "live:", live.length);

  const usedPerFolder = new Map<string, Set<string>>();
  let added = 0;
  let failed = 0;

  let completed = 0;
  await Promise.all(
    live.map(async (a: CaseAttachment) => {
      try {
        const kind = (a.kind ?? "other") as CaseAttachmentKind;
        const folderName = FOLDER_FOR[kind];
        if (!folderName) return;
        const blob = await fetchAttachmentBlob(a);
        if (!blob) {
          failed++;
          console.warn("[downloadCaseZip] failed to fetch", a.file_name, a.storage_path);
          return;
        }
        const folder = root.folder(folderName)!;
        let name = sanitize(a.file_name);
        const used = usedPerFolder.get(folderName) ?? new Set<string>();
        let i = 1;
        while (used.has(name)) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
          i++;
        }
        used.add(name);
        usedPerFolder.set(folderName, used);
        folder.file(name, blob);
        added++;
      } finally {
        completed++;
        const ratio = live.length ? completed / live.length : 1;
        onProgress?.({
          percent: Math.round(10 + ratio * 60),
          label: `Preparando arquivos (${completed}/${live.length})`,
        });
      }
    }),
  );

  console.info("[downloadCaseZip] added:", added, "failed:", failed);

  const out = await root.generateAsync(
    { type: "blob", streamFiles: true },
    (meta) => onProgress?.({
      percent: Math.min(98, Math.round(70 + meta.percent * 0.28)),
      label: "Gerando ZIP",
    }),
  );
  const url = URL.createObjectURL(out);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  onProgress?.({ percent: 100, label: "Download iniciado" });
  await addCaseActivity(caseRow.id, "download", "Baixou o caso completo.", [], {
    kind: "scans",
    source: "case_zip",
    file_count: added,
    failed_count: failed,
  }).catch(() => undefined);
  return { added, failed };
}

/** Download only a single section (gallery, scans, model, fabrication, exocad_html) as a zip. */
export async function downloadCaseSectionZip(
  caseRow: CaseRow,
  kind: CaseAttachmentKind,
  onProgress?: (progress: CaseDownloadProgress) => void,
): Promise<CaseDownloadResult> {
  const label = SECTION_LABEL[kind];
  if (!label) throw new Error("Seção sem download");
  onProgress?.({ percent: 3, label: "Preparando seção" });
  const [{ default: JSZip }, attachments] = await Promise.all([
    import("jszip"),
    fetchCaseAttachments(caseRow.id),
  ]);
  const root = new JSZip();
  const baseName = `${buildCaseFolderName(caseRow)} - ${label}`;
  const folder = root.folder(baseName)!;

  const live = attachments.filter((a) => !a.expired_at && (a.kind ?? "other") === kind);
  const used = new Set<string>();
  let added = 0;
  let failed = 0;
  let completed = 0;
  await Promise.all(
    live.map(async (a) => {
      try {
        const blob = await fetchAttachmentBlob(a);
        if (!blob) {
          failed++;
          return;
        }
        let name = sanitize(a.file_name);
        let i = 1;
        while (used.has(name)) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
          i++;
        }
        used.add(name);
        folder.file(name, blob);
        added++;
      } finally {
        completed++;
        const ratio = live.length ? completed / live.length : 1;
        onProgress?.({
          percent: Math.round(8 + ratio * 62),
          label: `Preparando arquivos (${completed}/${live.length})`,
        });
      }
    }),
  );

  const out = await root.generateAsync(
    { type: "blob", streamFiles: true },
    (meta) => onProgress?.({
      percent: Math.min(98, Math.round(70 + meta.percent * 0.28)),
      label: "Gerando ZIP",
    }),
  );
  const url = URL.createObjectURL(out);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  onProgress?.({ percent: 100, label: "Download iniciado" });
  await addCaseActivity(caseRow.id, "download", `Baixou arquivos da aba "${label}".`, [], {
    kind,
    file_count: added,
    failed_count: failed,
  }).catch(() => undefined);
  return { added, failed };
}
