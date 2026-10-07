import type { CaseRow, Patient } from "@/lib/types";

export type QuickCaseSummary = Pick<
  CaseRow,
  "id" | "patient_id" | "case_number" | "case_label" | "status" | "entry_date" | "delivery_date"
> & {
  case_type?: { name?: string | null } | null;
  current_stage?: { name?: string | null; color?: string | null; position?: number | null } | null;
};

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function patientSearchRank(name: string, query: string): number {
  const normalizedName = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || !normalizedName) return Number.POSITIVE_INFINITY;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;

  const queryParts = normalizedQuery.split(" ").filter(Boolean);
  const nameParts = normalizedName.split(" ").filter(Boolean);
  if (queryParts.length && queryParts.every((part) => nameParts.some((token) => token.startsWith(part)))) return 2;
  if (queryParts.length && queryParts.every((part) => normalizedName.includes(part))) return 3;
  if (normalizedName.includes(normalizedQuery)) return 4;
  return Number.POSITIVE_INFINITY;
}

export function rankPatientsForSearch(
  rows: Patient[],
  query: string,
  limit = 8,
): Array<Patient & { __searchExact?: boolean }> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  return rows
    .map((patient) => ({
      patient,
      rank: patientSearchRank(patient.name, normalizedQuery),
      normalizedName: normalizeSearchText(patient.name),
    }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) =>
      a.rank - b.rank ||
      a.normalizedName.length - b.normalizedName.length ||
      a.normalizedName.localeCompare(b.normalizedName, "pt-BR", { numeric: true })
    )
    .slice(0, limit)
    .map(({ patient, rank }) => ({ ...patient, __searchExact: rank === 0 }));
}

export function isCaseInProgress(status: unknown): boolean {
  const normalized = normalizeSearchText(status);
  return normalized === "em_andamento" || normalized === "active";
}

export function groupActiveCasesByPatient(
  rows: QuickCaseSummary[],
  patientIds: string[],
): Record<string, QuickCaseSummary[]> {
  const allowed = new Set(patientIds);
  const grouped: Record<string, QuickCaseSummary[]> = {};
  for (const row of rows) {
    if (!allowed.has(row.patient_id) || !isCaseInProgress(row.status)) continue;
    (grouped[row.patient_id] ??= []).push(row);
  }
  for (const patientId of Object.keys(grouped)) {
    grouped[patientId].sort((a, b) =>
      String(b.entry_date ?? "").localeCompare(String(a.entry_date ?? ""))
    );
  }
  return grouped;
}

export function caseSearchLabel(row: QuickCaseSummary): string {
  const number = row.case_number != null ? `#${row.case_number}` : "";
  const type = row.case_type?.name?.trim() || "Caso";
  const label = row.case_label?.trim();
  return [number, type, label].filter(Boolean).join(" · ");
}
