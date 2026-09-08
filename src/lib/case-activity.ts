import { supabase } from "@/integrations/supabase/client";

export type CaseActivity = {
  id: string;
  case_id: string;
  user_id: string | null;
  kind: string;
  content: string | null;
  mentions: string[];
  attachment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user?: { id: string; full_name: string | null; email: string | null; role: string | null } | null;
};

export async function fetchCaseActivity(caseId: string): Promise<CaseActivity[]> {
  const { data, error } = await supabase
    .from("case_activity" as never)
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as CaseActivity[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  if (userIds.length === 0) return rows;
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", userIds);
  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({ ...r, user: r.user_id ? (map.get(r.user_id) as any) ?? null : null }));
}

export async function addCaseActivity(
  caseId: string,
  kind: string,
  content: string | null,
  mentions: string[] = [],
  metadata: Record<string, unknown> = {},
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const { data, error } = await supabase
    .from("case_activity" as never)
    .insert({ case_id: caseId, user_id: user.id, kind, content, mentions, metadata } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as CaseActivity;
}

export async function deleteCaseActivity(id: string) {
  const { error } = await supabase.from("case_activity" as never).delete().eq("id", id);
  if (error) throw error;
}

async function readCaseStakeholderFallback(caseId: string) {
  try {
    const [{ isDentalFlowDesktop, localCacheGet }, { resolveDesktopOwnerId }] = await Promise.all([
      import("./desktop-local"),
      import("./desktop-identity"),
    ]);
    if (!isDentalFlowDesktop()) return null;
    const ownerId = await resolveDesktopOwnerId();
    if (!ownerId) return null;
    const direct = await localCacheGet<any>(ownerId, "cases:v1", caseId).catch(() => null);
    if (direct?.payload) return direct.payload;
    const all = await localCacheGet<any[]>(ownerId, "cases:v1", "all").catch(() => null);
    return all?.payload?.find((row: any) => row?.id === caseId) ?? null;
  } catch {
    return null;
  }
}

export async function fetchCaseStakeholderIds(caseId: string): Promise<string[]> {
  const ids = new Set<string>();
  let row: any = null;

  try {
    const { data: caseData, error } = await supabase
      .from("cases")
      .select("requested_by,accepted_by,cadista:cadistas(user_id),doctor:doctors(user_id)")
      .eq("id", caseId)
      .maybeSingle();
    if (error) throw error;
    row = caseData as any;
  } catch (error) {
    row = await readCaseStakeholderFallback(caseId);
    if (!row) throw error;
  }

  [
    row?.requested_by,
    row?.accepted_by,
    row?.cadista?.user_id,
    row?.doctor?.user_id,
  ].filter(Boolean).forEach((id) => ids.add(String(id)));

  // CEO/admin oversight is global. On Desktop, use the durable team mirror when
  // a session transition prevents the supplemental profiles query.
  try {
    const { data: profs, error } = await supabase
      .from("profiles")
      .select("id,role,account_subtype,is_default_admin,notification_preferences");
    if (error) throw error;
    (profs ?? []).forEach((p: any) => {
      const effectiveType = String(p.account_subtype || p.role || "").toUpperCase();
      if (p.is_default_admin || ["CEO", "ADMIN"].includes(effectiveType)) ids.add(String(p.id));
    });
  } catch {
    try {
      const { fetchTeamMembersLocalFirst } = await import("./team-local-first");
      const team = await fetchTeamMembersLocalFirst();
      team.forEach((p) => {
        const effectiveType = String(p.account_subtype || p.role || "").toUpperCase();
        if (p.is_default_admin || ["CEO", "ADMIN"].includes(effectiveType)) ids.add(String(p.id));
      });
    } catch { /* case-specific participants above remain valid */ }
  }

  return Array.from(ids);
}

type StakeholderNotificationOptions = {
  caseId: string;
  title: string;
  content: string;
  type?: string;
  extraRecipientIds?: string[];
  excludeSelf?: boolean;
  activityId?: string;
};

async function queueOfflineStakeholderNotifications(opts: StakeholderNotificationOptions): Promise<boolean> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return false;

  const { isDentalFlowDesktop } = await import("./desktop-local");
  if (!isDentalFlowDesktop()) return false;

  const [{ fetchCaseByIdLocalFirst }, { sendInternalNotificationLocalFirst }] = await Promise.all([
    import("./cases-local-first"),
    import("./notifications-local-first"),
  ]);
  const [{ data: auth }, caseRow] = await Promise.all([
    supabase.auth.getUser(),
    fetchCaseByIdLocalFirst(opts.caseId),
  ]);
  if (!caseRow) throw new Error("O caso offline não está disponível no cache local para notificação.");

  const row = caseRow as any;
  const allowed = new Set<string>();
  [
    row.requested_by,
    row.accepted_by,
    row.cadista?.user_id,
    row.doctor?.user_id,
  ].filter(Boolean).forEach((id) => allowed.add(String(id)));

  const recipients = new Set<string>(allowed);
  for (const id of opts.extraRecipientIds ?? []) {
    if (allowed.has(id)) recipients.add(id);
  }
  if (opts.excludeSelf !== false && auth.user?.id) recipients.delete(auth.user.id);

  await Promise.all(Array.from(recipients).map((recipientId) =>
    sendInternalNotificationLocalFirst(
      recipientId,
      opts.title,
      opts.content,
      opts.type ?? "case",
      {
        case_id: opts.caseId,
        activity_id: opts.activityId ?? null,
        case_label: row.patient?.name ?? row.case_label ?? null,
        queued_offline: true,
      },
    )
  ));
  return true;
}

export async function notifyCaseStakeholders(opts: StakeholderNotificationOptions) {
  if (await queueOfflineStakeholderNotifications(opts)) return;

  const { data: { user } } = await supabase.auth.getUser();
  const baseIds = await fetchCaseStakeholderIds(opts.caseId);
  const allowed = new Set(baseIds);
  const all = new Set<string>(baseIds);
  for (const id of opts.extraRecipientIds ?? []) {
    if (allowed.has(id)) all.add(id);
  }
  if (opts.excludeSelf !== false && user?.id) all.delete(user.id);
  if (all.size === 0) return;

  let senderName: string | null = null;
  let senderAvatar: string | null = null;
  let caseLabel: string | null = null;
  try {
    const [{ data: prof }, { data: cse }] = await Promise.all([
      user?.id
        ? supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null } as never),
      supabase.from("cases").select("patient:patients(name),case_label").eq("id", opts.caseId).maybeSingle(),
    ]);
    senderName = (prof as any)?.full_name ?? (prof as any)?.email ?? null;
    senderAvatar = (prof as any)?.avatar_url ?? null;
    caseLabel = (cse as any)?.patient?.name ?? (cse as any)?.case_label ?? null;
  } catch {
    const cachedCase = await readCaseStakeholderFallback(opts.caseId);
    caseLabel = cachedCase?.patient?.name ?? cachedCase?.case_label ?? null;
  }

  const metadata = {
    case_id: opts.caseId,
    activity_id: opts.activityId ?? null,
    sender_name: senderName,
    sender_avatar: senderAvatar,
    case_label: caseLabel,
  };

  const { isDentalFlowDesktop } = await import("./desktop-local");
  if (isDentalFlowDesktop()) {
    // Every recipient uses the durable outbox-aware path. If the chat message is
    // saved while auth is briefly revalidating, the alert is queued instead of
    // being swallowed by CaseComments and lost forever.
    const { sendInternalNotificationLocalFirst } = await import("./notifications-local-first");
    await Promise.all(Array.from(all).map((recipientId) =>
      sendInternalNotificationLocalFirst(
        recipientId,
        opts.title,
        opts.content,
        opts.type ?? "case",
        metadata,
      )
    ));
    return;
  }

  const rows = Array.from(all).map((rid) => ({
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    sender_id: user?.id ?? null,
    recipient_id: rid,
    title: opts.title,
    content: opts.content,
    type: opts.type ?? "case",
    metadata,
    read_at: null,
    created_at: new Date().toISOString(),
  }));

  try {
    const { broadcastEntity } = await import("./optimistic");
    rows.forEach((r) => broadcastEntity("notifications", "insert", r));
  } catch { /* ignore */ }
  const { error } = await supabase.from("notifications").insert(rows as any);
  if (error) throw error;
}

export async function fetchMentionableProfiles(caseId: string, query: string) {
  const ids = await fetchCaseStakeholderIds(caseId);
  if (ids.length === 0) return [];
  const q = query.trim();
  let req = supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", ids)
    .limit(8);
  if (q) req = req.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string | null }>;
}