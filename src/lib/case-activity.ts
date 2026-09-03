import { supabase } from "@/integrations/supabase/client";

export type CaseActivity = {
  id: string;
  case_id: string;
  user_id: string | null;
  kind: string; // 'comment' | 'upload' | 'delete_upload' | 'create' | 'system'
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

// Fetch users involved in a case (cadista user + CEO + DR + PROTETICO)
export async function fetchCaseStakeholderIds(caseId: string): Promise<string[]> {
  const ids = new Set<string>();

  // Case-specific participants only.
  const { data: caseData } = await supabase
    .from("cases")
    .select("requested_by,accepted_by,cadista:cadistas(user_id),doctor:doctors(user_id)")
    .eq("id", caseId)
    .maybeSingle();

  const row = caseData as any;
  [
    row?.requested_by,
    row?.accepted_by,
    row?.cadista?.user_id,
    row?.doctor?.user_id,
  ].filter(Boolean).forEach((id) => ids.add(id));

  // Only the explicitly global roles may receive every case notification.
  const { data: profs } = await supabase
    .from("profiles")
    .select("id,role,account_subtype,is_default_admin,notification_preferences");

  (profs ?? []).forEach((p: any) => {
    const effectiveType = String(p.account_subtype || p.role || "").toUpperCase();
    if (p.is_default_admin || ["CEO", "ADMIN", "PROTETICO"].includes(effectiveType)) {
      ids.add(p.id);
    }
  });

  return Array.from(ids);
}

export async function notifyCaseStakeholders(opts: {
  caseId: string;
  title: string;
  content: string;
  type?: string;
  extraRecipientIds?: string[];
  excludeSelf?: boolean;
  activityId?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const baseIds = await fetchCaseStakeholderIds(opts.caseId);
  // Mentions cannot expand visibility beyond legitimate case stakeholders.
  const allowed = new Set(baseIds);
  const all = new Set<string>(baseIds);
  for (const id of opts.extraRecipientIds ?? []) {
    if (allowed.has(id)) all.add(id);
  }
  if (opts.excludeSelf !== false && user?.id) all.delete(user.id);
  if (all.size === 0) return;

  // Dados de apresentação (usados nas notificações do sistema operacional).
  let senderName: string | null = null;
  let senderAvatar: string | null = null;
  let caseLabel: string | null = null;
  try {
    const [{ data: prof }, { data: cse }] = await Promise.all([
      user?.id
        ? supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null } as never),
      supabase.from("cases").select("patient:patients(name)").eq("id", opts.caseId).maybeSingle(),
    ]);
    senderName = (prof as any)?.full_name ?? (prof as any)?.email ?? null;
    senderAvatar = (prof as any)?.avatar_url ?? null;
    caseLabel = (cse as any)?.patient?.name ?? null;
  } catch { /* apresentação é opcional */ }

  const rows = Array.from(all).map((rid) => ({
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    sender_id: user?.id ?? null,
    recipient_id: rid,
    title: opts.title,
    content: opts.content,
    type: opts.type ?? "case",
    metadata: {
      case_id: opts.caseId,
      activity_id: opts.activityId ?? null,
      sender_name: senderName,
      sender_avatar: senderAvatar,
      case_label: caseLabel,
    },
    read_at: null,
    created_at: new Date().toISOString(),
  }));

  // Broadcast otimista para cada destinatário antes do round-trip.
  try {
    const { broadcastEntity } = await import("./optimistic");
    rows.forEach((r) => broadcastEntity("notifications", "insert", r));
  } catch { /* ignore */ }
  const { error } = await supabase.from("notifications").insert(rows as any);
  if (error) console.error("notifyCaseStakeholders error:", error);
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
