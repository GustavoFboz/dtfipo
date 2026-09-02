export type CaseNoteTransport = "system" | "bluetooth";

export type CaseNotePaperPreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  description: string;
};

export type CaseNotePrinterSettings = {
  transport: CaseNoteTransport;
  paperId: string;
  customWidthMm: number;
  customHeightMm: number;
  dpi: 203 | 300;
};

export const CASE_NOTE_PAPERS: CaseNotePaperPreset[] = [
  { id: "58x100", label: "58 × 100 mm", widthMm: 58, heightMm: 100, description: "Térmica compacta / recibo" },
  { id: "80x120", label: "80 × 120 mm", widthMm: 80, heightMm: 120, description: "Térmica 80 mm" },
  { id: "100x150", label: "100 × 150 mm (4 × 6)", widthMm: 100, heightMm: 150, description: "Etiqueta térmica padrão 4 × 6" },
  { id: "100x170", label: "100 × 170 mm", widthMm: 100, heightMm: 170, description: "Proporção do Guia Rápido" },
  { id: "100x200", label: "100 × 200 mm", widthMm: 100, heightMm: 200, description: "Etiqueta longa" },
  { id: "104x170", label: "104 × 170 mm (4\")", widthMm: 104, heightMm: 170, description: "Térmica de 4 polegadas" },
  { id: "104x200", label: "104 × 200 mm (4\")", widthMm: 104, heightMm: 200, description: "Térmica de 4 polegadas longa" },
  { id: "a4", label: "A4 · 210 × 297 mm", widthMm: 210, heightMm: 297, description: "Impressora convencional" },
  { id: "custom", label: "Personalizado", widthMm: 100, heightMm: 170, description: "Definir largura e altura" },
];

const STORAGE_KEY = "dentalflow.case-note-printer.v2";

export const DEFAULT_CASE_NOTE_PRINTER_SETTINGS: CaseNotePrinterSettings = {
  transport: "system",
  paperId: "100x170",
  customWidthMm: 100,
  customHeightMm: 170,
  dpi: 203,
};

export function loadCaseNotePrinterSettings(): CaseNotePrinterSettings {
  if (typeof window === "undefined") return DEFAULT_CASE_NOTE_PRINTER_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as Partial<CaseNotePrinterSettings> | null;
    if (!parsed) return DEFAULT_CASE_NOTE_PRINTER_SETTINGS;
    const paperId = CASE_NOTE_PAPERS.some((p) => p.id === parsed.paperId) ? parsed.paperId! : DEFAULT_CASE_NOTE_PRINTER_SETTINGS.paperId;
    return {
      transport: parsed.transport === "bluetooth" ? "bluetooth" : "system",
      paperId,
      customWidthMm: clampMm(parsed.customWidthMm, 40, 216, DEFAULT_CASE_NOTE_PRINTER_SETTINGS.customWidthMm),
      customHeightMm: clampMm(parsed.customHeightMm, 60, 500, DEFAULT_CASE_NOTE_PRINTER_SETTINGS.customHeightMm),
      dpi: parsed.dpi === 300 ? 300 : 203,
    };
  } catch {
    return DEFAULT_CASE_NOTE_PRINTER_SETTINGS;
  }
}

export function saveCaseNotePrinterSettings(settings: CaseNotePrinterSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resolveCaseNotePaper(settings: CaseNotePrinterSettings): { widthMm: number; heightMm: number; label: string } {
  if (settings.paperId === "custom") {
    return {
      widthMm: clampMm(settings.customWidthMm, 40, 216, 100),
      heightMm: clampMm(settings.customHeightMm, 60, 500, 170),
      label: `${settings.customWidthMm} × ${settings.customHeightMm} mm`,
    };
  }
  const preset = CASE_NOTE_PAPERS.find((p) => p.id === settings.paperId) ?? CASE_NOTE_PAPERS.find((p) => p.id === "100x170")!;
  return { widthMm: preset.widthMm, heightMm: preset.heightMm, label: preset.label };
}

function clampMm(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}
