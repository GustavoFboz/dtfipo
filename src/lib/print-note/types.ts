/**
 * Print-note template — per-user, stored at profiles.print_note_template (jsonb).
 * Versionado para evoluir sem quebrar templates antigos.
 */
export type PrintNoteFieldKey =
  | "doctor.name"
  | "cadista.name"
  | "case.types"
  | "case.delivery_date"
  | "case.entry_date"
  | "case.teeth"
  | "case.tooth_color"
  | "case.stage"
  | "case.implant_system"
  | "case.notes";

export type PrintNoteField = {
  key: PrintNoteFieldKey;
  label: string;
  show: boolean;
};

export type PrintNotePaper = "58mm" | "80mm" | "a4";
export type PrintNoteDensity = "baixa" | "media" | "alta";

export type PrintNoteTemplate = {
  version: 1;
  paper: PrintNotePaper;
  /** Intensidade térmica do cabeçote. Default: alta. */
  density?: PrintNoteDensity;
  header: {
    /** Suporta {{patient.name}}, {{case.short_id}}, {{date}}. */
    title: string;
    subtitle: string;
  };
  fields: PrintNoteField[];
  checklist: string[];
  footer: string;
};

export const DEFAULT_PRINT_TEMPLATE: PrintNoteTemplate = {
  version: 1,
  paper: "58mm",
  density: "alta",
  header: {
    title: "{{patient.name}}",
    subtitle: "Caso {{case.number}} · {{datetime}}",
  },
  fields: [
    { key: "doctor.name", label: "Dentista", show: true },
    { key: "cadista.name", label: "Cadista", show: true },
    { key: "case.types", label: "Tipo", show: true },
    { key: "case.delivery_date", label: "Entrega", show: true },
    { key: "case.teeth", label: "Elementos", show: true },
    { key: "case.tooth_color", label: "Cor", show: true },
    { key: "case.implant_system", label: "Implante", show: false },
    { key: "case.stage", label: "Etapa", show: false },
    { key: "case.entry_date", label: "Entrada", show: false },
    { key: "case.notes", label: "Obs.", show: false },
  ],
  checklist: [
    "Conferir cor do dente",
    "Confirmar implante / scanbody",
    "Embalar com etiqueta",
  ],
  footer: "Impresso em {{datetime}}",
};

export const FIELD_LABEL_BR: Record<PrintNoteFieldKey, string> = {
  "doctor.name": "Dentista",
  "cadista.name": "Cadista",
  "case.types": "Tipo do caso",
  "case.delivery_date": "Entrega",
  "case.entry_date": "Entrada",
  "case.teeth": "Elementos",
  "case.tooth_color": "Cor",
  "case.stage": "Etapa atual",
  "case.implant_system": "Sist. implante",
  "case.notes": "Observações",
};
