import type { CaseRow } from "@/lib/types";
import { desktopPrintText, isDentalFlowDesktop } from "@/lib/desktop-local";
import { resolveCaseNotePaper, type CaseNotePrinterSettings } from "./printer-settings";

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR").format(date);
}

function caseNumber(caseRow: CaseRow): string {
  const numbered = (caseRow as CaseRow & { case_number?: number | null }).case_number;
  return numbered != null ? String(numbered) : caseRow.id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function wrap(value: string, columns: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current.length) current = word;
    else if ((current + " " + word).length <= columns) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current.length) lines.push(current);
  return lines.length ? lines : ["—"];
}

/**
 * Nota do caso em texto puro, para a ponte nativa do Windows. A ponte atual
 * usa a fonte interna da impressora — o conteúdo é idêntico, mas sem os
 * elementos gráficos (QR/raster) da versão renderizada em imagem.
 */
export function buildDesktopCaseNoteText(caseRow: CaseRow, settings: CaseNotePrinterSettings): string {
  const paper = resolveCaseNotePaper(settings);
  const columns = Math.max(24, Math.min(64, Math.round(paper.widthMm / 2.2)));
  const rule = (char = "-") => char.repeat(columns);
  const lines: string[] = [];

  lines.push("DENTALFLOW · NOTA DO CASO");
  lines.push(rule("="));
  lines.push(`CASO: ${caseNumber(caseRow)}`);
  lines.push(`PACIENTE: ${caseRow.patient?.name || "—"}`);
  lines.push(`DENTISTA: ${caseRow.doctor?.name || "—"}`);
  lines.push(`CADISTA: ${caseRow.cadista?.name || "—"}`);
  lines.push(`TIPO: ${caseRow.case_type?.name || "—"}`);
  lines.push(`COR: ${caseRow.tooth_color?.code || "—"}`);
  lines.push(`ENTRADA: ${fmtDate(caseRow.entry_date)}`);
  lines.push(`ENTREGA: ${fmtDate(caseRow.delivery_date)}`);

  const teeth = [...new Set(caseRow.teeth_numbers ?? [])].sort((a, b) => a - b);
  if (teeth.length) {
    lines.push(rule());
    lines.push("ELEMENTOS:");
    lines.push(...wrap(teeth.join(", "), columns));
  }

  if (caseRow.notes?.trim()) {
    lines.push(rule());
    lines.push("OBSERVAÇÕES:");
    lines.push(...wrap(caseRow.notes.trim(), columns));
  }

  lines.push(rule("="));
  lines.push("");
  lines.push("");

  return lines.join("\r\n");
}

/** Imprime a nota diretamente na impressora salva do Windows. */
export async function printCaseNoteDirectDesktop(caseRow: CaseRow, settings: CaseNotePrinterSettings): Promise<void> {
  if (!isDentalFlowDesktop()) {
    throw new Error("A impressão direta está disponível apenas no aplicativo instalado.");
  }
  const printer = settings.printerName?.trim();
  if (!printer) {
    throw new Error("Nenhuma impressora foi selecionada para este dispositivo.");
  }
  await desktopPrintText(printer, buildDesktopCaseNoteText(caseRow, settings));
}
