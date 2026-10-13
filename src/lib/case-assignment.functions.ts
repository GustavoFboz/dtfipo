// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DirectoryKind = "cadista" | "doctor";

function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function adminContext(supabase: any, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,clinic_id,role,account_subtype,is_default_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.clinic_id) throw new Error("Empresa não encontrada para esta sessão.");

  const effective = String(profile.account_subtype || profile.role || "").toUpperCase();
  const manager = Boolean(profile.is_default_admin) || ["CEO", "ADMIN", "PROTETICO"].includes(effective);
  if (!manager) throw new Error("Somente administradores da empresa podem alterar responsáveis de casos.");
  return { clinicId: profile.clinic_id as string, effective };
}

async function activeMembersForClinic(admin: any, clinicId: string) {
  const { data: memberships, error: membershipError } = await admin
    .from("clinic_members")
    .select("user_id,role,status")
    .eq("clinic_id", clinicId)
    .in("status", ["active", "accepted"]);
  if (membershipError) throw membershipError;

  const ids = Array.from(new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean)));
  if (!ids.length) return [] as any[];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id,full_name,role,account_subtype,clinic_id")
    .in("id", ids);
  if (profilesError) throw profilesError;

  const membershipByUser = new Map((memberships ?? []).map((m: any) => [m.user_id, m]));
  return (profiles ?? []).map((p: any) => ({
    ...p,
    membership_role: membershipByUser.get(p.id)?.role ?? null,
  }));
}

function effectiveMemberType(member: any) {
  return String(member.account_subtype || member.membership_role || member.role || "").toUpperCase();
}

async function ensureDirectoryRows(admin: any, members: any[], kind: DirectoryKind) {
  const table = kind === "cadista" ? "cadistas" : "doctors";
  const acceptedTypes = kind === "cadista" ? new Set(["CADISTA"]) : new Set(["DR", "DENTISTA"]);
  const eligible = members.filter((m) => acceptedTypes.has(effectiveMemberType(m)));

  const { data: directoryRows, error } = await admin.from(table).select("id,name,user_id,created_at").order("created_at");
  if (error) throw error;

  let linked = 0;
  let created = 0;
  const rows = [...(directoryRows ?? [])];

  for (const member of eligible) {
    if (rows.some((row: any) => row.user_id === member.id)) continue;

    const wanted = normalizeName(member.full_name);
    const unlinkedMatches = rows.filter((row: any) => !row.user_id && normalizeName(row.name) === wanted);
    if (unlinkedMatches.length === 1) {
      const row = unlinkedMatches[0];
      const { error: updateError } = await admin.from(table).update({ user_id: member.id }).eq("id", row.id);
      if (updateError) throw updateError;
      row.user_id = member.id;
      linked += 1;
      continue;
    }

    // Never guess between duplicate legacy rows. Create one authoritative,
    // account-linked directory row instead and leave legacy rows untouched.
    const label = String(member.full_name || "").trim();
    if (!label) continue;
    const { data: inserted, error: insertError } = await admin
      .from(table)
      .insert({ name: label, user_id: member.id })
      .select("id,name,user_id,created_at")
      .single();
    if (insertError) throw insertError;
    rows.push(inserted);
    created += 1;
  }

  return { rows, linked, created };
}

async function reconcileParticipants(admin: any, cadistaRows: any[], doctorRows: any[]) {
  const cadistaById = new Map(cadistaRows.filter((r: any) => r.user_id).map((r: any) => [r.id, r.user_id]));
  const doctorById = new Map(doctorRows.filter((r: any) => r.user_id).map((r: any) => [r.id, r.user_id]));
  const cadistaIds = [...cadistaById.keys()];
  const doctorIds = [...doctorById.keys()];

  const cases: any[] = [];
  if (cadistaIds.length) {
    const { data, error } = await admin
      .from("cases")
      .select("id,status,cadista_id,doctor_id")
      .in("cadista_id", cadistaIds)
      .neq("status", "pendente");
    if (error) throw error;
    cases.push(...(data ?? []));
  }
  if (doctorIds.length) {
    const { data, error } = await admin
      .from("cases")
      .select("id,status,cadista_id,doctor_id")
      .in("doctor_id", doctorIds)
      .neq("status", "pendente");
    if (error) throw error;
    for (const row of data ?? []) if (!cases.some((c) => c.id === row.id)) cases.push(row);
  }

  if (!cases.length) return { opened: 0, closed: 0 };

  const caseIds = cases.map((c) => c.id);
  const { data: activeRows, error: participantError } = await admin
    .from("case_participants")
    .select("id,case_id,user_id,participant_role,joined_at,left_at")
    .in("case_id", caseIds)
    .is("left_at", null)
    .in("participant_role", ["CADISTA", "DENTISTA"]);
  if (participantError) throw participantError;

  const active = activeRows ?? [];
  let opened = 0;
  let closed = 0;
  const now = new Date().toISOString();

  for (const c of cases) {
    const expected: Array<{ role: string; userId: string | null }> = [
      { role: "CADISTA", userId: c.cadista_id ? cadistaById.get(c.cadista_id) ?? null : null },
      { role: "DENTISTA", userId: c.doctor_id ? doctorById.get(c.doctor_id) ?? null : null },
    ];

    for (const item of expected) {
      const stale = active.filter(
        (p: any) => p.case_id === c.id && p.participant_role === item.role && (!item.userId || p.user_id !== item.userId),
      );
      for (const p of stale) {
        const { error } = await admin.from("case_participants").update({ left_at: now }).eq("id", p.id);
        if (error) throw error;
        p.left_at = now;
        closed += 1;
      }

      if (!item.userId) continue;
      const exists = active.some(
        (p: any) => p.case_id === c.id && p.participant_role === item.role && p.user_id === item.userId && !p.left_at,
      );
      if (!exists) {
        // Privacy invariant: a repaired/reassigned specialist starts NOW. This
        // intentionally prevents historical chat/activity from becoming visible.
        const { error } = await admin.from("case_participants").insert({
          case_id: c.id,
          user_id: item.userId,
          participant_role: item.role,
          joined_at: now,
        });
        if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) throw error;
        opened += 1;
      }
    }
  }

  return { opened, closed };
}

export const reconcileCaseProfessionalAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { clinicId } = await adminContext(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const members = await activeMembersForClinic(supabaseAdmin, clinicId);
    const cadistas = await ensureDirectoryRows(supabaseAdmin, members, "cadista");
    const doctors = await ensureDirectoryRows(supabaseAdmin, members, "doctor");
    const participants = await reconcileParticipants(supabaseAdmin, cadistas.rows, doctors.rows);

    return {
      success: true,
      repaired: cadistas.linked + cadistas.created + doctors.linked + doctors.created + participants.opened + participants.closed,
      cadistas_linked: cadistas.linked,
      cadistas_created: cadistas.created,
      doctors_linked: doctors.linked,
      doctors_created: doctors.created,
      participant_intervals_opened: participants.opened,
      participant_intervals_closed: participants.closed,
    };
  });

export const ensureCaseProfessionalDirectoryLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cadista_id?: string | null; doctor_id?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { clinicId } = await adminContext(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const members = await activeMembersForClinic(supabaseAdmin, clinicId);
    const activeIds = new Set(members.map((m) => m.id));
    const cadistas = await ensureDirectoryRows(supabaseAdmin, members, "cadista");
    const doctors = await ensureDirectoryRows(supabaseAdmin, members, "doctor");

    if (data.cadista_id) {
      const row = cadistas.rows.find((r: any) => r.id === data.cadista_id);
      if (!row?.user_id || !activeIds.has(row.user_id)) {
        throw new Error("O cadista selecionado não está vinculado a uma conta ativa desta empresa. Atualize a equipe e selecione o membro novamente.");
      }
    }

    if (data.doctor_id) {
      const row = doctors.rows.find((r: any) => r.id === data.doctor_id);
      if (!row?.user_id || !activeIds.has(row.user_id)) {
        throw new Error("O dentista selecionado não está vinculado a uma conta ativa desta empresa. Atualize a equipe e selecione o membro novamente.");
      }
    }

    return { success: true };
  });
