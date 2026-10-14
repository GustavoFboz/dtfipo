import { supabase } from "@/integrations/supabase/client";
import type { CaseRow, Patient } from "./types";

// Resolve rpc lazily: unrelated API modules and their tests may mock only the
// Supabase surfaces they use. Binding at module evaluation would crash those
// imports before any creation request is made.
type CreationRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { code?: string; message: string } | null;
}>;

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const rpcMethod = (supabase as unknown as { rpc?: CreationRpc }).rpc;
  if (typeof rpcMethod !== "function") {
    throw new Error("A operação de criação segura não está disponível nesta sessão. Atualize a página e tente novamente.");
  }
  const { data, error } = await rpcMethod.call(supabase, name, args);
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
