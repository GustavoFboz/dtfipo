import { supabase } from "@/integrations/supabase/client";

export type ChecklistTemplate = {
  id: string;
  title: string;
  items: string[];
  created_at: string;
};

export type ChecklistItem = {
  id: string;
  checklist_id: string;
  label: string;
  position: number;
  checked_by: string | null;
  checked_at: string | null;
};

export type CaseChecklist = {
  id: string;
  case_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  items: ChecklistItem[];
};

export async function fetchChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const { data, error } = await supabase
    .from("checklist_templates" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ChecklistTemplate[];
}

export async function saveChecklistTemplate(title: string, items: string[]) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase.from("checklist_templates" as never).insert({
    title,
    items,
    created_by: userRes.user?.id ?? null,
  } as never);
  if (error) throw error;
}

export async function deleteChecklistTemplate(id: string) {
  const { error } = await supabase.from("checklist_templates" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function fetchCaseChecklists(caseId: string): Promise<CaseChecklist[]> {
  const { data, error } = await supabase
    .from("case_checklists" as never)
    .select("*, items:case_checklist_items(*)")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const list = (data ?? []) as unknown as CaseChecklist[];
  return list.map((c) => ({
    ...c,
    items: [...(c.items ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export async function createCaseChecklist(caseId: string, title: string, labels: string[]) {
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("case_checklists" as never)
    .insert({ case_id: caseId, title, created_by: userRes.user?.id ?? null } as never)
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as unknown as { id: string }).id;
  const rows = labels
    .map((l, i) => ({ checklist_id: id, label: l.trim(), position: i }))
    .filter((r) => r.label);
  if (rows.length) {
    const { error: e2 } = await supabase.from("case_checklist_items" as never).insert(rows as never);
    if (e2) throw e2;
  }
  await supabase.from("case_activity" as never).insert({
    case_id: caseId,
    kind: "checklist",
    actor_id: userRes.user?.id ?? null,
    user_id: userRes.user?.id ?? null,
    message: `Checklist criado: ${title}`,
    metadata: { checklist_id: id },
  } as never);
  return id;
}

export async function deleteCaseChecklist(id: string) {
  const { error } = await supabase.from("case_checklists" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleChecklistItem(
  caseId: string,
  item: ChecklistItem,
  checklistTitle: string,
) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  const willCheck = !item.checked_at;
  const { error } = await supabase
    .from("case_checklist_items" as never)
    .update({
      checked_at: willCheck ? new Date().toISOString() : null,
      checked_by: willCheck ? uid : null,
    } as never)
    .eq("id", item.id);
  if (error) throw error;

  await supabase.from("case_activity" as never).insert({
    case_id: caseId,
    kind: "checklist",
    actor_id: uid,
    user_id: uid,
    message: willCheck
      ? `✓ ${item.label} — ${checklistTitle}`
      : `Desmarcado: ${item.label} — ${checklistTitle}`,
    metadata: { checklist_id: item.checklist_id, item_id: item.id, checked: willCheck },
  } as never);
}

export async function addChecklistItem(checklistId: string, label: string, position: number) {
  const { error } = await supabase
    .from("case_checklist_items" as never)
    .insert({ checklist_id: checklistId, label, position } as never);
  if (error) throw error;
}
