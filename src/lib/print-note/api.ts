// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PRINT_TEMPLATE, type PrintNoteTemplate } from "./types";

export async function fetchMyPrintTemplate(): Promise<PrintNoteTemplate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PRINT_TEMPLATE;
  const { data } = await supabase
    .from("profiles")
    .select("print_note_template")
    .eq("id", user.id)
    .maybeSingle();
  const tpl = (data as any)?.print_note_template as PrintNoteTemplate | null;
  if (!tpl || tpl.version !== 1) return DEFAULT_PRINT_TEMPLATE;
  return tpl;
}

export async function saveMyPrintTemplate(tpl: PrintNoteTemplate): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const { error } = await supabase
    .from("profiles")
    .update({ print_note_template: tpl as any })
    .eq("id", user.id);
  if (error) throw error;
}
