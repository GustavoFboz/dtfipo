export type CaseNoteTransport = "system" | "bluetooth";

export type CaseNotePaperPreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  description: string;
};

export type CaseNotePrinterProfile = {
  id: string;
  label: string;
  match: RegExp;
  dpi: 203 | 300;
  maxWidthMm?: number;
  suggestedPaperId?: string;
};

export type CaseNotePrinterSettings = {
  transport: CaseNoteTransport;
  paperId: string;
  customWidthMm: number;
  customHeightMm: number;
  dpi: 203 | 300;
  printerModel?: string | null;
  printerProfileId?: string | null;
  configuredAt?: string | null;
};

export const CASE_NOTE_PAPERS: CaseNotePaperPreset[] = [
  { id: "58x100", label: "58 × 100 mm", widthMm: 58, heightMm: 100, description: "Térmica compacta / recibo" },
  { id: "80x120", label: "80 × 120 mm", widthMm: 80, heightMm: 120, description: "Térmica 80 mm" },
  { id: "100x150", label: "100 × 150 mm (4 × 6)", widthMm: 100, heightMm: 150, description: "Etiqueta térmica padrão 4 × 6" },
  { id: "100x170", label: "100 × 170 mm", widthMm: 100, heightMm: 170, description: "Proporção do Guia Rápido" },
  { id: "100x200", label: "100 × 200 mm", widthMm: 100, heightMm: 200, description: "Etiqueta longa" },
  { id: "104x170", label: "104 × 170 mm (4\")", widthMm: 104, heightMm: 170, description: "Térmica de 4 polegadas" },
  { id: "104x200", label: "104 × 200 mm (4\")", widthMm: 104, heightMm: 200, description: "Térmica de 4 polegadas longa" },
  { id: "continuous", label: "Papel contínuo · altura automática", widthMm: 100, heightMm: 0, description: "A altura acompanha automaticamente o conteúdo" },
  { id: "a4", label: "A4 · 210 × 297 mm", widthMm: 210, heightMm: 297, description: "Impressora convencional" },
  { id: "custom", label: "Personalizado", widthMm: 100, heightMm: 170, description: "Definir largura e altura" },
];

export const CASE_NOTE_PRINTER_PROFILES: CaseNotePrinterProfile[] = [
  {
    id: "tomate-mdk-2054n",
    label: "Tomate MDK-2054N",
    match: /(?:tomate\s*)?mdk[-\s]?2054n/i,
    dpi: 203,
    maxWidthMm: 108,
    suggestedPaperId: "100x170",
  },
];

const LEGACY_STORAGE_KEY = "dentalflow.case-note-printer.v2";
const STORAGE_PREFIX = "dentalflow.case-note-printer.v3";

export const DEFAULT_CASE_NOTE_PRINTER_SETTINGS: CaseNotePrinterSettings = {
  transport: "system",
  paperId: "100x170",
  customWidthMm: 100,
  customHeightMm: 170,
  dpi: 203,
  printerModel: null,
  printerProfileId: null,
  configuredAt: null,
};

function storageKeyForAccount(userId: string) {
  return STORAGE_PREFIX + ":" + userId;
}

function normalizeSettings(value: Partial<CaseNotePrinterSettings> | null | undefined): CaseNotePrinterSettings {
  const paperId = CASE_NOTE_PAPERS.some((p) => p.id === value?.paperId)
    ? value!.paperId!
    : DEFAULT_CASE_NOTE_PRINTER_SETTINGS.paperId;

  const printerModel = typeof value?.printerModel === "string" && value.printerModel.trim()
    ? value.printerModel.trim()
    : null;
  const matchedProfile = printerModel ? detectCaseNotePrinterProfile(printerModel) : null;

  return {
    transport: value?.transport === "bluetooth" ? "bluetooth" : "system",
    paperId,
    customWidthMm: clampMm(value?.customWidthMm, 40, 216, DEFAULT_CASE_NOTE_PRINTER_SETTINGS.customWidthMm),
    customHeightMm: clampMm(value?.customHeightMm, 60, 500, DEFAULT_CASE_NOTE_PRINTER_SETTINGS.customHeightMm),
    dpi: value?.dpi === 300 ? 300 : matchedProfile?.dpi ?? 203,
    printerModel,
    printerProfileId: value?.printerProfileId ?? matchedProfile?.id ?? null,
    configuredAt: typeof value?.configuredAt === "string" ? value.configuredAt : null,
  };
}

function readStorage(key: string): CaseNotePrinterSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return normalizeSettings(JSON.parse(raw) as Partial<CaseNotePrinterSettings>);
  } catch {
    return null;
  }
}

function writeStorage(key: string, settings: CaseNotePrinterSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key,
    JSON.stringify({ ...normalizeSettings(settings), configuredAt: settings.configuredAt ?? new Date().toISOString() }),
  );
}

export function loadCaseNotePrinterSettings(): CaseNotePrinterSettings {
  return readStorage(LEGACY_STORAGE_KEY) ?? DEFAULT_CASE_NOTE_PRINTER_SETTINGS;
}

export function saveCaseNotePrinterSettings(settings: CaseNotePrinterSettings) {
  writeStorage(LEGACY_STORAGE_KEY, { ...settings, configuredAt: new Date().toISOString() });
}

export function loadCaseNotePrinterSettingsForAccount(userId: string): CaseNotePrinterSettings | null {
  if (!userId) return null;
  const account = readStorage(storageKeyForAccount(userId));
  if (account) return account;

  const legacy = readStorage(LEGACY_STORAGE_KEY);
  if (!legacy) return null;

  const migrated = {
    ...legacy,
    configuredAt: legacy.configuredAt ?? new Date().toISOString(),
  };
  writeStorage(storageKeyForAccount(userId), migrated);
  return migrated;
}

export function saveCaseNotePrinterSettingsForAccount(userId: string, settings: CaseNotePrinterSettings) {
  if (!userId) return;
  const next = { ...settings, configuredAt: new Date().toISOString() };
  writeStorage(storageKeyForAccount(userId), next);
  writeStorage(LEGACY_STORAGE_KEY, next);
}

export function clearCaseNotePrinterSettingsForAccount(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.removeItem(storageKeyForAccount(userId));
}

export function detectCaseNotePrinterProfile(modelName: string | null | undefined): CaseNotePrinterProfile | null {
  if (!modelName) return null;
  return CASE_NOTE_PRINTER_PROFILES.find((profile) => profile.match.test(modelName)) ?? null;
}

export function applyCaseNotePrinterProfile(
  settings: CaseNotePrinterSettings,
  modelName: string,
  options: { useSuggestedPaper?: boolean } = {},
): CaseNotePrinterSettings {
  const profile = detectCaseNotePrinterProfile(modelName);
  if (!profile) return { ...settings, printerModel: modelName, printerProfileId: null };
  return {
    ...settings,
    printerModel: modelName,
    printerProfileId: profile.id,
    dpi: profile.dpi,
    paperId: options.useSuggestedPaper && profile.suggestedPaperId ? profile.suggestedPaperId : settings.paperId,
  };
}

export function resolveCaseNotePaper(settings: CaseNotePrinterSettings): { widthMm: number; heightMm: number; label: string; continuous?: boolean } {
  if (settings.paperId === "continuous") {
    const widthMm = clampMm(settings.customWidthMm, 40, 108, 100);
    return { widthMm, heightMm: 0, label: `${widthMm} mm · contínuo`, continuous: true };
  }
  if (settings.paperId === "custom") {
    return {
      widthMm: clampMm(settings.customWidthMm, 40, 216, 100),
      heightMm: clampMm(settings.customHeightMm, 60, 500, 170),
      label: settings.customWidthMm + " × " + settings.customHeightMm + " mm",
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
