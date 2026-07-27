import type { CaseRow } from "@/lib/types";
import { sortTeeth } from "@/lib/teeth";
import type { PrintNoteField, PrintNoteFieldKey } from "./types";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function shortCaseId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export function caseNumberLabel(c: CaseRow): string {
  return c.case_number != null ? `#${c.case_number}` : shortCaseId(c.id);
}

export function buildInterpolateContext(c: CaseRow): Record<string, string> {
  const now = new Date();
  return {
    "patient.name": c.patient?.name ?? "—",
    "case.number": caseNumberLabel(c),
    "case.short_id": shortCaseId(c.id),
    date: now.toLocaleDateString("pt-BR"),
    time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    datetime: `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
  };
}

export function interpolate(s: string, ctx: Record<string, string>): string {
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => ctx[k] ?? "");
}

export function fieldValue(c: CaseRow, key: PrintNoteFieldKey): string {
  switch (key) {
    case "doctor.name": return c.doctor?.name ?? "—";
    case "cadista.name": return c.cadista?.name ?? "—";
    case "case.types": {
      const arr = (c.case_types_link ?? []).map(l => l.case_type?.name).filter(Boolean) as string[];
      return arr.length ? arr.join(", ") : (c.case_type?.name ?? "—");
    }
    case "case.delivery_date": return fmtDate(c.delivery_date);
    case "case.entry_date": return fmtDate(c.entry_date);
    case "case.teeth": {
      const t = sortTeeth(c.teeth_numbers ?? []);
      return t.length ? t.join(" · ") : "—";
    }
    case "case.tooth_color": return c.tooth_color?.code ?? "—";
    case "case.stage": return c.current_stage?.name ?? "—";
    case "case.implant_system": return c.implant_system?.name ?? "—";
    case "case.notes": return (c.notes ?? "").trim() || "—";
  }
}

export function visibleFields(fields: PrintNoteField[]): PrintNoteField[] {
  return fields.filter(f => f.show);
}
