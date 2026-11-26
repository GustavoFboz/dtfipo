import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isTeamAdmin, sanitizeEmail, toDbAppRole, type AppRole } from "./team.server";
import { newPasswordError } from "./auth/password-policy";

type TeamContext = { supabase: SupabaseClient<Database>; userId: string };

type TeamProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  account_subtype: string | null;
  is_default_admin: boolean | null;
  user_code: string | null;
  clinic_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function listTeamMembersHandler({ context }: { context: TeamContext }) {
  const { supabase, userId } = context;

  const { data: caller, error: callerErr } = await supabase
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (callerErr) return { success: false, error: callerErr.message, members: [] as TeamProfile[] };

  let clinicId = caller?.clinic_id ?? null;

  if (!isTeamAdmin(caller?.role)) {
    const { data: self, error: selfErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (selfErr) return { success: false, error: selfErr.message, members: [] as TeamProfile[] };
    return { success: true, members: self ? ([self] as TeamProfile[]) : [] };
  }
  if (!clinicId) return { success: false, error: "Sua conta não está vinculada a uma empresa.", members: [] as TeamProfile[] };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  query = query.eq("clinic_id", clinicId);
  const { data: members, error } = await query;
  if (error) return { success: false, error: error.message, members: [] as TeamProfile[] };

  return { success: true, members: (members ?? []) as TeamProfile[] };
}

export async function setTeamMemberPasswordHandler({ data, context }: { data: { user_id: string; password: string }; context: TeamContext }) {
  const { supabase, userId } = context;
  const password = data.password;
  const targetUserId = String(data.user_id ?? "");

  if (!targetUserId) return { success: false, error: "Membro inválido." };
  const passwordError = newPasswordError(password);
  if (passwordError) return { success: false, error: passwordError };

  const { data: caller, error: callerErr } = await supabase
    .from("profiles")
    .select("clinic_id, role, account_subtype, is_default_admin")
    .eq("id", userId)
    .maybeSingle();
  if (callerErr) return { success: false, error: callerErr.message };
  if (!caller) return { success: false, error: "Perfil administrativo não encontrado." };
  if (!caller.clinic_id) return { success: false, error: "Sua conta não está vinculada a uma empresa." };

  const effectiveRole = String(caller.account_subtype || caller.role || "").toUpperCase();
  const canManage = Boolean(caller.is_default_admin) || effectiveRole === "CEO" || effectiveRole === "ADMIN";
  if (!canManage) {
    return { success: false, error: "Apenas CEO ou Administrador Avançado pode redefinir senhas da equipe." };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: target, error: targetErr } = await supabaseAdmin
    .from("profiles")
    .select("id, clinic_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetErr) return { success: false, error: targetErr.message };
  if (!target) return { success: false, error: "Membro não encontrado." };

  if (target.clinic_id !== caller.clinic_id) {
    return { success: false, error: "Você só pode redefinir a senha de membros da sua própria empresa." };
  }

  const { data: authBefore, error: authLookupErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (authLookupErr || !authBefore?.user) {
    return { success: false, error: authLookupErr?.message ?? "Usuário de autenticação não encontrado." };
  }
  const loginEmail = authBefore.user.email?.trim().toLowerCase() ?? "";
  if (!loginEmail) return { success: false, error: "O membro não possui e-mail de login no Auth." };

  const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password });
  if (authErr) return { success: false, error: authErr.message };

  // Verificação end-to-end da credencial recém-definida. Isso impede a UI de
  // confirmar sucesso se o Auth não aceitar a nova senha de fato.
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return { success: false, error: "Backend de autenticação indisponível para validar a nova senha." };
  }
  const verify = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: loginEmail, password }),
  });
  if (!verify.ok) {
    let detail = "A senha foi enviada ao Auth, mas a validação do novo login falhou.";
    try {
      const body = await verify.json() as { msg?: string; error_description?: string; message?: string };
      detail = body.msg || body.error_description || body.message || detail;
    } catch {
      // Keep the safe generic message.
    }
    return { success: false, error: detail };
  }

  return { success: true, login_email: loginEmail };
}

export async function createTeamMemberHandler({ data, context }: { data: { email: string; full_name: string; phone?: string; role: AppRole; password: string }; context: TeamContext }) {
  const { supabase, userId } = context;
  const email = sanitizeEmail(data.email);

  const { data: caller, error: callerErr } = await supabase
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (callerErr) return { success: false, error: callerErr.message };
  if (!isTeamAdmin(caller?.role)) {
    return { success: false, error: "Apenas CEO ou Dentista administrador pode cadastrar membros." };
  }

  const clinicId = caller?.clinic_id;
  if (!clinicId) return { success: false, error: "Sua conta não está vinculada a uma empresa." };
  const passwordError = newPasswordError(data.password);
  if (passwordError) return { success: false, error: passwordError };

  const enumRole = toDbAppRole(data.role);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.full_name, phone: data.phone ?? null },
  });

  const newUserId = created?.user?.id;
  if (createErr || !newUserId) {
    // Existing identities must use invitation/onboarding. Never reset or move
    // somebody else's Auth account because createUser reports a duplicate.
    const message = createErr?.message ?? "Falha ao criar usuário";
    return { success: false, error: /already|registered|exists|duplicate/i.test(message)
      ? "Este e-mail já possui uma conta. Use o fluxo de convite da empresa."
      : message };
  }

  if (!newUserId) return { success: false, error: "Falha ao criar usuário" };

  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: newUserId,
        full_name: data.full_name,
        email,
        phone: data.phone ?? null,
        clinic_id: clinicId ?? null,
        role: data.role,
        account_subtype: data.role,
      } as never,
      { onConflict: "id" },
    );
  if (profErr) return { success: false, error: profErr.message };

  const { error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: newUserId, role: enumRole as never }, { onConflict: "user_id,role" });
  if (roleErr) return { success: false, error: roleErr.message };

  if (clinicId) {
    const { error: memErr } = await supabaseAdmin
      .from("clinic_members")
      .upsert(
        {
          clinic_id: clinicId,
          user_id: newUserId,
          role: data.role as never,
          status: "active",
          invited_by: userId,
          decided_by: userId,
          decided_at: new Date().toISOString(),
        },
        { onConflict: "clinic_id,user_id" },
      );
    if (memErr) return { success: false, error: memErr.message };
  }

  // Se for CADISTA, garantir registro em public.cadistas para aparecer nos dropdowns
  if (enumRole === "cadista") {
    const { data: existingCad } = await supabaseAdmin
      .from("cadistas")
      .select("id")
      .eq("user_id", newUserId)
      .maybeSingle();
    if (!existingCad) {
      await supabaseAdmin.from("cadistas").insert({ name: data.full_name, user_id: newUserId } as never);
    } else {
      await supabaseAdmin.from("cadistas").update({ name: data.full_name } as never).eq("user_id", newUserId);
    }
  }

  return { success: true, user_id: newUserId };
}
