import { supabase } from "@/integrations/supabase/client";

export type CaseAttachmentKind = "gallery" | "scans" | "exocad_html" | "model" | "elementos" | "comment_image" | "other";

export type CaseAttachment = {
  id: string;
  case_id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  expires_at: string;
  expired_at: string | null;
  notes: string | null;
  kind: CaseAttachmentKind;
};

export async function fetchCaseAttachments(caseId: string, kind?: string): Promise<CaseAttachment[]> {
  let q = supabase
    .from("case_attachments" as never)
    .select("*")
    .eq("case_id", caseId)
    .is("expired_at", null)
    .order("uploaded_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CaseAttachment[];
}

export async function uploadCaseAttachment(
  caseId: string,
  file: File,
  notes?: string,
  kind: CaseAttachmentKind = "scans",
) {
  const { data: { user } } = await supabase.auth.getUser();
  const fileExt = file.name.split(".").pop();
  const filePath = `${caseId}/${kind}/${Math.random().toString(36).slice(2, 10)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from("case-files").upload(filePath, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("case_attachments" as never)
    .insert({
      case_id: caseId,
      file_name: file.name,
      storage_path: filePath,
      size_bytes: file.size,
      mime_type: file.type || null,
      uploaded_by: user?.id,
      notes: notes || null,
      kind,
    } as never)
    .select()
    .single();

  if (error) throw error;
  return data as CaseAttachment;
}

export async function deleteCaseAttachment(id: string) {
  const { data: att } = await supabase.from("case_attachments" as any).select("storage_path").eq("id", id).single();
  if (att) {
    await supabase.storage.from("case-files").remove([att.storage_path]);
  }
  const { error } = await supabase.from("case_attachments" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function getCaseAttachmentUrl(path: string) {
  const { data, error } = await supabase.storage.from("case-files").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
