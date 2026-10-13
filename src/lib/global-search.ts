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


function patientIdentityScore(patient: Patient, activeCaseCount: number): number {
  const identityFields = [patient.cpf, patient.phone, patient.email].filter((value) => normalizeSearchText(value).length > 0).length;
  const clinicalFields = [
    patient.notes,
    patient.medical_history,
    patient.allergies,
    patient.medications,
    patient.clinical_notes,
    patient.address,
    patient.birth_date,
  ].filter((value) => normalizeSearchText(value).length > 0).length;
  return activeCaseCount * 1000 + identityFields * 100 + (patient.photo_url ? 30 : 0) + clinicalFields * 2;
}

function patientIdentityTokens(patient: Patient): Set<string> {
  const tokens = new Set<string>();
  const cpf = String(patient.cpf ?? "").replace(/\D/g, "");
  const phone = String(patient.phone ?? "").replace(/\D/g, "");
  const email = normalizeSearchText(patient.email);

  if (cpf.length >= 8) tokens.add(`cpf:${cpf}`);
  if (phone.length >= 8) tokens.add(`phone:${phone}`);
  if (email.includes("@")) tokens.add(`email:${email}`);
  return tokens;
}

function canCollapsePatientIdentity(
  a: Patient,
  b: Patient,
): boolean {
  const aTokens = patientIdentityTokens(a);
  const bTokens = patientIdentityTokens(b);

  // Empty-shell records (the common duplicate produced by an interrupted
  // "new patient + new case" flow) may safely collapse into the richer row.
  if (aTokens.size === 0 || bTokens.size === 0) return true;

  // When both rows carry strong identity data, only collapse them when at
  // least one value agrees. This prevents two real people with the same full
  // name but different CPF/phone/e-mail from being hidden as a duplicate.
  return [...aTokens].some((token) => bTokens.has(token));
}

export function collapseDuplicatePatientResults(
  rows: Array<Patient & { __searchExact?: boolean }>,
  activeCasesByPatient: Record<string, QuickCaseSummary[]>,
  limit = 8,
): {
  patients: Array<Patient & { __searchExact?: boolean }>;
  activeCasesByPatient: Record<string, QuickCaseSummary[]>;
} {
  const nameGroups = new Map<string, Array<Patient & { __searchExact?: boolean }>>();
  for (const patient of rows) {
    const key = normalizeSearchText(patient.name);
    if (!key) continue;
    const group = nameGroups.get(key) ?? [];
    group.push(patient);
    nameGroups.set(key, group);
  }

  const collapsed: Array<Patient & { __searchExact?: boolean }> = [];
  const mergedCases: Record<string, QuickCaseSummary[]> = {};

  for (const sameNameRows of nameGroups.values()) {
    const identityClusters: Array<Array<Patient & { __searchExact?: boolean }>> = [];

    for (const patient of sameNameRows) {
      const compatible = identityClusters.find((cluster) =>
        cluster.every((member) => canCollapsePatientIdentity(member, patient))
      );
      if (compatible) compatible.push(patient);
      else identityClusters.push([patient]);
    }

    for (const cluster of identityClusters) {
      const canonical = [...cluster].sort((a, b) => {
        const scoreA = patientIdentityScore(a, activeCasesByPatient[a.id]?.length ?? 0);
        const scoreB = patientIdentityScore(b, activeCasesByPatient[b.id]?.length ?? 0);
        if (scoreA !== scoreB) return scoreB - scoreA;

        const createdA = Date.parse(String(a.created_at ?? "")) || Number.MAX_SAFE_INTEGER;
        const createdB = Date.parse(String(b.created_at ?? "")) || Number.MAX_SAFE_INTEGER;
        return createdA - createdB;
      })[0];

      const allCases = cluster
        .flatMap((patient) => activeCasesByPatient[patient.id] ?? [])
        .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
        .sort((a, b) => String(b.entry_date ?? "").localeCompare(String(a.entry_date ?? "")));

      collapsed.push({
        ...canonical,
        __searchExact: cluster.some((patient) => Boolean(patient.__searchExact)),
      });
      mergedCases[canonical.id] = allCases;
    }
  }

  return {
    patients: collapsed.slice(0, limit),
    activeCasesByPatient: mergedCases,
  };
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
