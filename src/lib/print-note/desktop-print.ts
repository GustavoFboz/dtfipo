import type { CaseRow } from "@/lib/types";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import type { CaseNotePrinterSettings } from "./printer-settings";

export type DesktopPrinterInfo = { name: string; is_default: boolean };

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export function desktopDirectPrintingAvailable() {
  return isDentalFlowDesktop();
}

export async function listDesktopPrinters(): Promise<DesktopPrinterInfo[]> {
  if (!desktopDirectPrintingAvailable()) return [];
  return invokeDesktop<DesktopPrinterInfo[]>("desktop_list_printers");
}

export async function openDesktopPrinterSettings(): Promise<void> {
  if (!desktopDirectPrintingAvailable()) throw new Error("As configurações nativas estão disponíveis no aplicativo Desktop.");
  await invokeDesktop<void>("desktop_open_printer_settings");
}

function line(label: string, value: unknown) {
  const text = String(value ?? "").trim();
  return text ? `${label}: ${text}` : null;
}

function safeDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const d = new Date(text.length === 10 ? `${text}T00:00:00` : text);
  return Number.isNaN(d.getTime()) ? text : d.toLocaleDateString("pt-BR");
}

export function buildDesktopCaseNoteText(caseRow: CaseRow, settings: CaseNotePrinterSettings) {
  const row = caseRow as any;
  const patient = row.patient?.name ?? row.patient_name ?? row.case_label ?? "—";
  const doctor = row.doctor?.name ?? row.doctor_name;
  const cadista = row.cadista?.name ?? row.cadista_name;
  const type = row.case_type?.name ?? row.case_type_name;
  const color = row.tooth_color?.code ?? row.tooth_color?.name ?? row.tooth_color_name;
  const stage = row.current_stage?.name ?? row.stage?.name ?? row.current_stage_name;
  const teeth = Array.isArray(row.teeth) ? row.teeth.join(", ") : row.teeth;

  const content = [
    "DENTALFLOW",
    "NOTA DO CASO",
    "================================",
    line("Caso", row.case_number ?? row.case_label ?? row.id),
    line("Paciente", patient),
    line("Tipo", type),
    line("Dentista", doctor),
    line("Cadista", cadista),
    line("Entrada", safeDate(row.entry_date ?? row.created_at)),
    line("Entrega", safeDate(row.delivery_date)),
    line("Status", row.status),
    line("Etapa", stage),
    line("Cor", color),
    line("Dentes", teeth),
    row.notes ? "--------------------------------" : null,
    row.notes ? "OBSERVAÇÕES" : null,
    row.notes ? String(row.notes) : null,
    "================================",
    `Impresso em ${new Date().toLocaleString("pt-BR")}`,
    settings.printerName ? `Impressora: ${settings.printerName}` : "Impressora: padrão do Windows",
    "",
  ].filter(Boolean);

  return content.join("\r\n");
}

export async function printCaseNoteDirectDesktop(caseRow: CaseRow, settings: CaseNotePrinterSettings) {
  if (!desktopDirectPrintingAvailable()) return false;
  const content = buildDesktopCaseNoteText(caseRow, settings);
  await invokeDesktop<void>("desktop_print_text", {
    printerName: settings.printerName ?? null,
    content,
  });
  return true;
}
