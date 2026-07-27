import type { CaseRow } from "@/lib/types";
import type { PrintNoteTemplate } from "./types";
import { renderNoteCanvas } from "./render-canvas";
import { printCanvasBluetooth } from "./bluetooth";

export async function printNoteBluetooth(c: CaseRow, tpl: PrintNoteTemplate) {
  const { canvas } = renderNoteCanvas(c, tpl);
  await printCanvasBluetooth(canvas, tpl.density ?? "alta");
}

/** Imprime via diálogo do navegador (impressora normal / PDF). */
export async function printNoteWindow(c: CaseRow, tpl: PrintNoteTemplate) {
  const { canvas } = renderNoteCanvas(c, tpl);
  const dataUrl = canvas.toDataURL("image/png");
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  const widthMm = tpl.paper === "80mm" ? 80 : tpl.paper === "a4" ? 210 : 58;
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Nota</title>
    <style>
      @page { size: ${widthMm}mm auto; margin: 0; }
      html,body{margin:0;padding:0;background:#fff}
      img{display:block;width:100%}
    </style></head><body><img src="${dataUrl}" /></body></html>`);
  doc.close();
  await new Promise(r => setTimeout(r, 120));
  try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {}
  setTimeout(() => iframe.remove(), 60_000);
}

/** Caso de exemplo para "Imprimir teste". */
export function sampleCase(): CaseRow {
  return {
    id: "00000000-0000-0000-0000-000000000abc",
    patient_id: "x",
    doctor_id: null,
    cadista_id: null,
    case_type_id: null,
    tooth_color_id: null,
    case_label: null,
    entry_date: new Date().toISOString().slice(0, 10),
    delivery_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    finished_at: null,
    status: "open",
    model_done: false, scan_done: false, folder_done: false, folder_url: null,
    notes: "Caso de teste para conferência da impressora.",
    arch: null, sibling_case_id: null,
    current_stage_id: null, current_phase_id: null,
    reopened_at: null, reopened_count: 0,
    teeth_numbers: [16, 26, 36],
    elements_count: 3, elements_zirconia: 3, elements_dissilicato: 0,
    teeth_zirconia: [16, 26, 36], teeth_dissilicato: [],
    patient: { id: "x", name: "Maria Silva", age: 42 } as any,
    doctor: { id: "d", name: "Dr. João Pereira" },
    cadista: { id: "c", name: "Dalbert" },
    case_type: { id: "t", name: "Coroa sobre implante" } as any,
    tooth_color: { id: "tc", code: "A2", name: "A2" } as any,
    current_stage: { id: "s", name: "Desenho", color: "#3b82f6", position: 20, phase_id: null },
    case_stages: [], case_components: [],
    case_types_link: [{ case_type_id: "t", case_type: { id: "t", name: "Coroa sobre implante" } as any }],
    implant_system: { id: "i", name: "Neodent GM" } as any,
  } as CaseRow;
}
