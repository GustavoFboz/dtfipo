import type { Patient } from "./types";

export function normalizePatientName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

const identity = (value: unknown) => String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

export function possiblePatientMatches(patients: Patient[], name: string, clinicId: string): Patient[] {
  if (!name.trim() || !clinicId) return [];
  return patients.filter((patient) =>
    (patient as Patient & { clinic_id?: string }).clinic_id === clinicId &&
    normalizePatientName(patient.name) === normalizePatientName(name),
  );
}

export function assertDistinctPatient(values: Record<string, unknown>, matches: Patient[]) {
  if (!matches.length) return;
  const fields = ["cpf", "rg", "phone"] as const;
  if (!fields.some((field) => identity(values[field]))) {
    throw new Error("Já existe paciente com esse nome. Selecione o cadastro existente ou informe CPF, RG ou telefone para distinguir um novo paciente.");
  }
  if (matches.some((patient) => !fields.some((field) => {
    const next = identity(values[field]);
    return next && next !== identity(patient[field]);
  }))) {
    throw new Error("Os dados informados não distinguem o novo paciente. Selecione o cadastro existente ou informe outro identificador.");
  }
}