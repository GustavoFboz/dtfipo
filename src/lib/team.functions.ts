// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTeamAdmin, sanitizeEmail, toDbAppRole, type AppRole } from "./team.server";

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

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data: members, error } = await query;
    if (error) return { success: false, error: error.message, members: [] as TeamProfile[] };

    return { success: true, members: (members ?? []) as TeamProfile[] };
  });

export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      email: string;
      full_name: string;
      phone?: string;
      role: AppRole;
      password: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
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
    if (data.password.length < 8) return { success: false, error: "A senha deve ter pelo menos 8 caracteres." };

    const enumRole = toDbAppRole(data.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone ?? null },
    });

    let newUserId = created?.user?.id;
    if (createErr || !newUserId) {
      const message = createErr?.message ?? "Falha ao criar usuário";
      const mayAlreadyExist = /already|registered|exists|duplicate/i.test(message);
      if (!mayAlreadyExist) return { success: false, error: message };

      const { data: usersPage, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return { success: false, error: listErr.message };
      const existing = usersPage.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) {
        return {
          success: false,
          error: "Este e-mail já existe no login, mas não foi possível localizá-lo para vincular à equipe.",
        };
      }

      const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: data.password,
        email_confirm: true,
        user_metadata: { ...existing.user_metadata, full_name: data.full_name, phone: data.phone ?? null },
      });
      if (updateAuthErr) return { success: false, error: updateAuthErr.message };
      newUserId = existing.id;
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
  });

