import { supabase } from "@/integrations/supabase/client";
import type { CaseRow, Patient } from "./types";

// Local contract until the owner applies the staged migration and regenerates
// managed types. Do not silently fall back to non-idempotent INSERT on 404.
type CreationRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { code?: string; message: string } | null;
}>;
const rpc = supabase.rpc.bind(supabase) as unknown as CreationRpc;

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("A criação segura aguarda a atualização autorizada do banco. Nenhum cadastro foi enviado pelo caminho antigo.");
    }
    if (/PATIENT_NAME_MATCH|PATIENT_DUPLICATE_NAME_REQUIRES_IDENTIFIER/.test(error.message)) throw new Error("Já existe paciente com esse nome. Selecione o cadastro existente ou informe CPF, RG ou telefone para cadastrar outra pessoa.");
    if (/PATIENT_DUPLICATE_IDENTITY_EXISTS|PATIENT_ID_MATCH/.test(error.message)) throw new Error("Já existe paciente com esse nome e identificador. Selecione o cadastro existente em vez de criar uma duplicata.");
    if (/PATIENT_CLINIC_REQUIRED|PATIENT_CLINIC_MISMATCH|PATIENT_COMPANY_MISMATCH/.test(error.message)) throw new Error("Não foi possível vincular o paciente à clínica ativa. Atualize a sessão e tente novamente.");
    if (error.message.includes("CASE_COMPANY_WRITE_NOT_ALLOWED")) throw new Error("Você não tem permissão para criar este caso nesta clínica.");
    if (error.message.includes("CREATION_KEY_CONFLICT")) throw new Error("Esta tentativa já foi enviada com outros dados. Recupere o cadastro anterior antes de iniciar outro.");
    throw error;
  }
  if (!data) throw new Error("O servidor não confirmou a criação. Tente novamente com a mesma tentativa.");
  return data as T;
}

export function createPatientConfirmed(values: Record<string, unknown>, key: string, id: string) {
  return call<Patient>("create_patient_idempotent_v1", { _key: key, _id: id, _values: values });
}

export function createCaseConfirmed(input: Record<string, unknown>, key: string) {
  return call<{ case: CaseRow; cases: CaseRow[]; replayed?: boolean }>("create_case_idempotent_v1", { _key: key, _input: input });
}