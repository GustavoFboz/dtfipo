import { supabase } from "@/integrations/supabase/client";

export const CLINIC_PERMISSIONS = [
  "clinical.dashboard",
  "clinical.appointments",
  "clinical.patients",
  "clinical.financial",
  "clinical.team",
  "clinical.settings",
] as const;

export type ClinicPermission = (typeof CLINIC_PERMISSIONS)[number];

export type ClinicContext = {
  clinicId: string | null;
  clinicName: string | null;
  modules: string[];
  role: string;
  isAdvanced: boolean;
  hasClinicalModule: boolean;
  permissions: Record<ClinicPermission, boolean>;
};

const blankPermissions = () => Object.fromEntries(CLINIC_PERMISSIONS.map((p) => [p, false])) as Record<ClinicPermission, boolean>;

export async function fetchClinicContext(): Promise<ClinicContext> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sessão inválida.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clinic_id,role,account_subtype,is_default_admin")
    .eq("id", uid)
    .maybeSingle();
  if (profileError) throw profileError;

  const clinicId = profile?.clinic_id ?? null;
  const role = String(profile?.account_subtype || profile?.role || "USER").toUpperCase();
  const isAdvanced = Boolean(profile?.is_default_admin) || ["CEO", "ADMIN"].includes(role);
  if (!clinicId) return { clinicId: null, clinicName: null, modules: [], role, isAdvanced, hasClinicalModule: false, permissions: blankPermissions() };

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .select("id,name,modules_enabled")
    .eq("id", clinicId)
    .maybeSingle();
  if (clinicError) throw clinicError;
  const modules = Array.isArray((clinic as any)?.modules_enabled) ? (clinic as any).modules_enabled.map((x: unknown) => String(x).toLowerCase()) : [];
  const hasClinicalModule = modules.includes("clinical");
  const permissions = blankPermissions();

  if (hasClinicalModule) {
    if (isAdvanced) {
      for (const p of CLINIC_PERMISSIONS) permissions[p] = true;
    } else {
      try {
        const { data } = await (supabase as any)
          .from("clinic_role_permissions")
          .select("permission,allowed")
          .eq("clinic_id", clinicId)
          .eq("role", role);
        for (const row of data ?? []) {
          if (CLINIC_PERMISSIONS.includes(row.permission as ClinicPermission)) {
            permissions[row.permission as ClinicPermission] = Boolean(row.allowed);
          }
        }
      } catch {
        // A migration clínica pode ainda não ter sido aplicada; a UI falha fechada.
      }
    }
  }

  return {
    clinicId,
    clinicName: clinic?.name ?? null,
    modules,
    role,
    isAdvanced,
    hasClinicalModule,
    permissions,
  };
}

export async function fetchClinicAppointments(start?: string, end?: string) {
  let q = (supabase as any)
    .from("clinic_appointments")
    .select("*, patient:patients(id,name,photo_url,phone,email,cpf,birth_date,gender,created_at), doctor:doctors(id,name)")
    .order("starts_at", { ascending: true });
  if (start) q = q.gte("starts_at", start);
  if (end) q = q.lt("starts_at", end);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveClinicAppointment(input: {
  id?: string;
  clinic_id: string;
  patient_id: string;
  doctor_id?: string | null;
  title?: string | null;
  starts_at: string;
  ends_at: string;
  status?: string;
  notes?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const payload = { ...input, created_by: auth.user?.id ?? null };
  if (input.id) {
    const { id, ...patch } = payload;
    const { data, error } = await (supabase as any).from("clinic_appointments").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  const { id: _id, ...insert } = payload;
  const { data, error } = await (supabase as any).from("clinic_appointments").insert(insert).select().single();
  if (error) throw error;
  return data;
}

export async function cancelClinicAppointment(id: string) {
  const { error } = await (supabase as any).from("clinic_appointments").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

export async function fetchClinicFinancialEntries(month?: string) {
  let q = (supabase as any)
    .from("clinic_financial_entries")
    .select("*, patient:patients(id,name)")
    .order("due_date", { ascending: false });
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const next = new Date(y, m, 1).toISOString().slice(0, 10);
    q = q.gte("due_date", start).lt("due_date", next);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function saveClinicFinancialEntry(input: {
  id?: string;
  clinic_id: string;
  kind: "revenue" | "expense";
  description: string;
  category?: string | null;
  amount_cents: number;
  due_date?: string | null;
  status?: "pending" | "paid" | "cancelled";
  patient_id?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const payload = {
    ...input,
    created_by: auth.user?.id ?? null,
    paid_at: input.status === "paid" ? new Date().toISOString() : null,
  };
  if (input.id) {
    const { id, ...patch } = payload;
    const { data, error } = await (supabase as any).from("clinic_financial_entries").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  const { id: _id, ...insert } = payload;
  const { data, error } = await (supabase as any).from("clinic_financial_entries").insert(insert).select().single();
  if (error) throw error;
  return data;
}

export async function fetchClinicRolePermissions(clinicId: string) {
  const { data, error } = await (supabase as any)
    .from("clinic_role_permissions")
    .select("id,role,permission,allowed")
    .eq("clinic_id", clinicId)
    .order("role")
    .order("permission");
  if (error) throw error;
  return data ?? [];
}

export async function setClinicRolePermission(clinicId: string, role: string, permission: ClinicPermission, allowed: boolean) {
  const { error } = await (supabase as any).from("clinic_role_permissions").upsert({
    clinic_id: clinicId,
    role: role.toUpperCase(),
    permission,
    allowed,
  }, { onConflict: "clinic_id,role,permission" });
  if (error) throw error;
}