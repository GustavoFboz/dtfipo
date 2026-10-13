import { normalizeText } from "./utils";

export type PatientIdentityField = "cpf" | "rg" | "phone";

export function normalizePatientName(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

export function normalizePatientIdentifier(field: PatientIdentityField, value: unknown): string {
  const raw = String(value ?? "").trim();
  if (field === "cpf" || field === "phone") return raw.replace(/\D/g, "");
  return normalizeText(raw).replace(/[^a-z0-9]/g, "");
}

export function hasPatientIdentifier(patient: Record<string, unknown>): boolean {
  return Boolean(
    normalizePatientIdentifier("cpf", patient.cpf) ||
    normalizePatientIdentifier("rg", patient.rg) ||
    normalizePatientIdentifier("phone", patient.phone),
  );
}

/** Compare only strong identifiers; phone is used only when neither record has CPF/RG. */
export function samePatientIdentity(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  const existingCpf = normalizePatientIdentifier("cpf", existing.cpf);
  const incomingCpf = normalizePatientIdentifier("cpf", incoming.cpf);
  if (existingCpf && incomingCpf) return existingCpf === incomingCpf;

  const existingRg = normalizePatientIdentifier("rg", existing.rg);
  const incomingRg = normalizePatientIdentifier("rg", incoming.rg);
  if (existingRg && incomingRg) return existingRg === incomingRg;

  const noStrongId =
    !existingCpf && !incomingCpf && !existingRg && !incomingRg;
  const existingPhone = normalizePatientIdentifier("phone", existing.phone);
  const incomingPhone = normalizePatientIdentifier("phone", incoming.phone);
  return noStrongId && Boolean(existingPhone && incomingPhone && existingPhone === incomingPhone);
}

export function patientDuplicateErrorMessage(error: unknown): string | null {
  const message = String((error as any)?.message ?? error ?? "").toUpperCase();
  if (message.includes("PATIENT_DUPLICATE_NAME_REQUIRES_IDENTIFIER")) {
    return "Já existe um paciente com esse nome. Selecione o cadastro existente ou informe CPF, RG ou telefone para cadastrar outra pessoa.";
  }
  if (message.includes("PATIENT_DUPLICATE_IDENTITY_EXISTS")) {
    return "Já existe um paciente com esse nome e identificador. Se for a mesma pessoa, selecione o cadastro existente.";
  }
  if (message.includes("PATIENT_CLINIC_MISMATCH") || message.includes("PATIENT_CLINIC_REQUIRED")) {
    return "Não foi possível vincular o paciente à clínica ativa. Atualize a sessão e tente novamente.";
  }
  return null;
}
