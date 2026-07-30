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
  const { data: caseData } = await supabase
    .from("cases")
    .select("cadista:cadistas(user_id)")
    .eq("id", caseId)
    .maybeSingle();
  const cadistaUserId = (caseData as any)?.cadista?.user_id;
  if (cadistaUserId) ids.add(cadistaUserId);

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, role, notification_preferences");
  (profs ?? []).forEach((p: any) => {
    const role = (p.role || "").toUpperCase();
    const prefs = p.notification_preferences || {};
    if (role === "CEO" || role === "PROTETICO" || role === "ATENDIMENTO") ids.add(p.id);
    if (role === "DR" && prefs.prosthesis_updates !== false) ids.add(p.id);
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
  const all = new Set<string>([...baseIds, ...(opts.extraRecipientIds ?? [])]);
  if (opts.excludeSelf !== false && user?.id) all.delete(user.id);
  if (all.size === 0) return;
  const rows = Array.from(all).map((rid) => ({
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    sender_id: user?.id ?? null,
    recipient_id: rid,
    title: opts.title,
    content: opts.content,
    type: opts.type ?? "case",
    metadata: { case_id: opts.caseId, activity_id: opts.activityId ?? null },
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

export async function fetchMentionableProfiles(query: string) {
  const q = query.trim();
  let req = supabase.from("profiles").select("id, full_name, email, role").limit(8);
  if (q) req = req.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string | null }>;
}
