import { supabase } from "@/integrations/supabase/client";
import type { CaseRow, Patient } from "./types";

// Local contract until the owner applies the staged migration and regenerates
// managed types. Do not silently fall back to non-idempotent INSERT on 404.
type CreationRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { code?: string; message: string } | null;
}>;
async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // Resolve the RPC only when used. Importing a shared API module must not
  // require the creation transport during storage-only tests or bootstrap.
  const rpc = supabase.rpc.bind(supabase) as unknown as CreationRpc;
  const { data, error } = await rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("A criação segura aguarda a atualização autorizada do banco. Nenhum cadastro foi enviado pelo caminho antigo.");
    }
    if (error.message.includes("PATIENT_NAME_MATCH")) throw new Error("Existe paciente com esse nome. Selecione o existente ou informe CPF, RG ou telefone diferente.");
    if (error.message.includes("CREATION_KEY_CONFLICT")) throw new Error("Esta tentativa já foi enviada com outros dados. Recupere o cadastro anterior antes de iniciar outro.");
    if (error.message.includes("CREATION_RESULT_UNAVAILABLE")) throw new Error("O cadastro desta tentativa foi excluído ou seu acesso mudou. Atualize a lista antes de iniciar outro cadastro.");
    throw error;
  }
  if (!data) throw new Error("O servidor não confirmou a criação. Tente novamente com a mesma tentativa.");
  return data as T;
}

export function createPatientConfirmed(values: Record<string, unknown>, key: string, id: string) {
  return call<Patient>("create_patient_idempotent_v1", { _key: key, _id: id, _values: values });
}

export function createCaseConfirmed(input: Record<string, unknown>, key: string) {
  return call<{ case: CaseRow; cases: CaseRow[] }>("create_case_idempotent_v1", { _key: key, _input: input });
}
