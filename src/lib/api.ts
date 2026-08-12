// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { CaseRow, Doctor, Cadista, Patient, CaseType, ToothColor, Stage, Phase, Component, Profile, Notification, ComponentCategory } from "./types";
import { autoRecordCaseMilling } from "./burrs";
import { broadcastEntity, markDeleted } from "./optimistic";


const CASE_SELECT = `
  *,
  patient:patients(*),
  doctor:doctors(*),
  cadista:cadistas(*),
  case_type:case_types!cases_case_type_id_fkey(*),
  tooth_color:tooth_colors(*),
  current_stage:stages!cases_current_stage_id_fkey(*),
  case_stages(id, pending_count, started_at, completed_at, stage:stages(*)),
  case_components(id, qty, notes, component:components(*)),
  case_types_link(case_type_id, case_type:case_types!case_types_link_case_type_id_fkey(*)),
  implant_system:implant_systems(*),
  scan_jig:scan_jigs(*)
`;

export async function fetchProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data as unknown as Profile;
}


export async function updateProfile(id: string, updates: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as Profile;
}

export async function fetchNotifications(): Promise<Notification[]> {

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*, sender:profiles!notifications_sender_id_fkey(*)")
    .or(`recipient_id.eq.${user.id},recipient_id.is.null`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationAsRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Marca como lidas as notificações do usuário atual relacionadas a um caso.
 * Usado para que, ao visualizar o "relacionado" (chat do caso, anexos, etc.),
 * o contador da central de notificações caia imediatamente.
 * Retorna os ids afetados (vazio quando não havia nada pendente).
 */
export async function markCaseNotificationsRead(caseId: string, types?: string[]): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("recipient_id", user.id)
    .filter("metadata->>case_id", "eq", caseId);
  if (types && types.length > 0) q = q.in("type", types);
  const { data, error } = await q.select("id");
  if (error) {
    console.error("markCaseNotificationsRead error:", error);
    return [];
  }
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function markAllNotificationsAsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("recipient_id", user.id);
  if (error) throw error;
}

export async function fetchCaseById(id: string): Promise<CaseRow | null> {
  const { data, error } = await supabase.from("cases").select(CASE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as CaseRow | null;
}


export async function sendInternalNotification(targetUserId: string | null, title: string, content: string, type: string = 'system') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const row = {
    id,
    sender_id: user.id,
    recipient_id: targetUserId,
    title,
    content,
    type,
    metadata: {},
    read_at: null,
    created_at: new Date().toISOString(),
  };
  // Broadcast otimista: peers recebem antes do round-trip do DB.
  try { broadcastEntity("notifications", "insert", row); } catch { /* ignore */ }
  const { error } = await supabase.from("notifications").insert(row as any);
  if (error) throw error;
}



export async function fetchCases(scope: "active" | "finished" | "deleted" | "all" = "active"): Promise<CaseRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  
  let query = supabase
    .from("cases")
    .select(CASE_SELECT);

  if (scope === "active") {
    query = query.not("status", "in", '("finalizado","arquivado","cancelado")');
  } else if (scope === "finished") {
    query = query.eq("status", "finalizado");
  } else if (scope === "deleted") {
    query = query.eq("status", "cancelado");
  }
  // "all" doesn't add a status filter

  // If user is CADISTA, filter by their cadista_id
  if (profile?.role === "CADISTA") {
    const { data: cadista } = await supabase.from("cadistas").select("id").eq("user_id", user.id).maybeSingle();
    if (cadista) {
      query = query.eq("cadista_id", cadista.id);
    } else {
      // If profile is CADISTA but no record in cadistas table, show nothing (security)
      return [];
    }
  }

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CaseRow[];
}

export async function restoreCase(id: string) {
  try { markDeleted(id, -1); } catch {} // Clear tombstone if exists
  const { error } = await supabase
    .from("cases")
    .update({ status: "em_andamento", finished_at: null } as any)
    .eq("id", id);
  if (error) throw error;
  try { broadcastEntity("cases", "update", { id, status: "em_andamento", finished_at: null, finished: false }); } catch {}
}

export async function permanentDeleteCase(id: string) {
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) throw error;
  try { markDeleted("cases", id); } catch {}
}



export async function fetchPatientCases(patientId: string): Promise<CaseRow[]> {
  const { data, error } = await supabase
    .from("cases")
    .select(CASE_SELECT)
    .eq("patient_id", patientId)
    .order("entry_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CaseRow[];
}

export const fetchPatients = async (): Promise<Patient[]> => {
  const { data, error } = await supabase.from("patients").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Patient[];
};

export const fetchPatient = async (id: string): Promise<Patient | null> => {
  const { data, error } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Patient | null;
};

export const fetchDoctors = async (): Promise<Doctor[]> => {
  const { data, error } = await supabase.from("doctors").select("*").order("name");
  if (error) throw error;
  return data ?? [];
};

export const fetchCadistas = async (): Promise<Cadista[]> => {
  const { data, error } = await supabase.from("cadistas").select("*").order("name");
  if (error) throw error;
  return data ?? [];
};

export const fetchCaseTypes = async (): Promise<CaseType[]> => {
  const { data, error } = await supabase
    .from("case_types")
    .select("*")
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const fetchToothColors = async (): Promise<ToothColor[]> => {
  const { data, error } = await supabase
    .from("tooth_colors")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("code");
  if (error) throw error;
  return data ?? [];
};

export type ImplantSystem = { id: string; name: string; line: string | null; sort_order: number | null };
export const fetchImplantSystems = async (): Promise<ImplantSystem[]> => {
  const { data, error } = await supabase
    .from("implant_systems" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ImplantSystem[];
};

export const createImplantSystem = async (input: { name: string; line?: string | null }): Promise<ImplantSystem> => {
  const { data, error } = await supabase
    .from("implant_systems" as never)
    .insert({ name: input.name, line: input.line ?? null, sort_order: 50 } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ImplantSystem;
};

export type ScanJig = { id: string; implant_system_id: string; name: string; sort_order: number };
export const fetchScanJigs = async (implantSystemId?: string | null): Promise<ScanJig[]> => {
  let q = supabase.from("scan_jigs" as never).select("*").order("sort_order").order("name");
  if (implantSystemId) q = q.eq("implant_system_id", implantSystemId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ScanJig[];
};

export const createScanJig = async (input: { implant_system_id: string; name: string }): Promise<ScanJig> => {
  const { data, error } = await supabase
    .from("scan_jigs" as never)
    .insert({ implant_system_id: input.implant_system_id, name: input.name, sort_order: 50 } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ScanJig;
};

export const fetchStages = async (): Promise<Stage[]> => {
  const { data, error } = await supabase.from("stages").select("*").order("position");
  if (error) throw error;
  return (data ?? []) as Stage[];
};

export const fetchPhases = async (): Promise<Phase[]> => {
  const { data, error } = await supabase.from("phases").select("*").order("position");
  if (error) throw error;
  return data ?? [];
};

export const fetchComponents = async (): Promise<Component[]> => {
  const { data, error } = await supabase.from("components").select("*").order("name");
  if (error) throw error;
  return data ?? [];
};

// ===== Component categories (Ti Base, Análogo, etc) =====

export async function fetchComponentCategories(): Promise<ComponentCategory[]> {
  const { data, error } = await supabase
    .from("component_categories")
    .select("id,name")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ComponentCategory[];
}
export async function createComponentCategory(name: string): Promise<ComponentCategory> {
  const { data, error } = await supabase
    .from("component_categories")
    .insert({ name: name.trim() } as never)
    .select("id,name")
    .single();
  if (error) throw error;
  return data as ComponentCategory;
}
export async function updateComponentCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("component_categories")
    .update({ name: name.trim() } as never)
    .eq("id", id);
  if (error) throw error;
}
export async function deleteComponentCategory(id: string): Promise<void> {
  const { error } = await supabase.from("component_categories").delete().eq("id", id);
  if (error) throw error;
}

// ===== Ti-Base options for cadista assignment =====
export type TiBaseOption = { id: string; label: string };
export async function fetchTiBaseOptions(): Promise<TiBaseOption[]> {
  const { data: cat } = await supabase
    .from("component_categories")
    .select("id")
    .eq("name", "Ti Base")
    .maybeSingle();
  if (!cat) return [];
  const { data: comps } = await supabase
    .from("components")
    .select("id")
    .eq("category_id", (cat as { id: string }).id);
  const componentIds = ((comps ?? []) as { id: string }[]).map((c) => c.id);
  if (componentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("stock_items")
    .select("id,name,brand,block_type,color")
    .in("component_id", componentIds)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string; brand: string | null; block_type: string | null; color: string | null }>).map((i) => ({
    id: i.id,
    label: [i.name, i.brand, i.block_type, i.color].filter(Boolean).join(" · "),
  }));
}

export async function updateCaseTiBases(caseId: string, map: Record<string, string>): Promise<void> {
  const { error } = await supabase
    .from("cases")
    .update({ tooth_ti_bases: map } as never)
    .eq("id", caseId);
  if (error) throw error;
}

export type CreateCaseInput = {
  patient_id: string;
  doctor_id: string | null;
  cadista_id: string | null;
  case_type_id: string | null;
  tooth_color_id: string | null;
  case_label: string | null;
  entry_date: string;
  delivery_date: string;
  folder_url?: string | null;
  current_stage_id?: string | null;
  arch?: string | null;
  notes?: string | null;
  component_ids?: string[];
  case_type_ids?: string[];
  teeth_numbers?: number[];
  teeth_zirconia?: number[];
  teeth_dissilicato?: number[];
  tooth_case_types?: Record<string, string[]>;
  implant_system_id?: string | null;
  implant_system_ids?: string[];
  has_provisional?: boolean;
  implant_teeth?: number[];
  tooth_implant_systems?: Record<string, string>;
  scan_jig_id?: string | null;
};

async function insertOneCase(input: CreateCaseInput & { also_arch?: string | null }, sibling_case_id: string | null = null) {
  const {
    component_ids,
    case_type_ids,
    also_arch: _ignoreAlsoArch,
    teeth_zirconia = [],
    teeth_dissilicato = [],
    teeth_numbers = [],
    tooth_case_types = {},
    ...rest
  } = input;
  void _ignoreAlsoArch;
  // Default to the first workflow stage (e.g. "Novo Caso") when none is provided
  if (!rest.current_stage_id) {
    const { data: firstStage } = await supabase
      .from("stages")
      .select("id")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstStage?.id) rest.current_stage_id = firstStage.id;
  }
  const payload = {
    ...rest,
    sibling_case_id,
    teeth_numbers,
    teeth_zirconia,
    teeth_dissilicato,
    tooth_case_types,
    elements_count: teeth_numbers.length,
    elements_zirconia: teeth_zirconia.length,
    elements_dissilicato: teeth_dissilicato.length,
  };
  const { data: row, error } = await supabase
    .from("cases")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  if (component_ids && component_ids.length) {
    const { error: e2 } = await supabase
      .from("case_components")
      .insert(component_ids.map((cid) => ({ case_id: row.id, component_id: cid })));
    if (e2) throw e2;
  }
  if (case_type_ids && case_type_ids.length) {
    await supabase
      .from("case_types_link")
      .insert(case_type_ids.map((ctid) => ({ case_id: row.id, case_type_id: ctid })));
  }
  if (rest.current_stage_id) {
    await supabase.from("case_stages").insert({
      case_id: row.id,
      stage_id: rest.current_stage_id,
      position: 0,
    });
  }
  // Auto-record burr usages
  if (teeth_zirconia.length) await autoRecordCaseMilling(row.id, "zirconia", teeth_zirconia);
  if (teeth_dissilicato.length) await autoRecordCaseMilling(row.id, "dissilicato", teeth_dissilicato);
  return row;
}

export async function createCase(input: CreateCaseInput & { also_arch?: "superior" | "inferior" | null }) {
  let created: any;
  if (input.arch && input.also_arch && input.arch !== input.also_arch) {
    const a = await insertOneCase({ ...input, arch: input.arch });
    const b = await insertOneCase({ ...input, arch: input.also_arch }, a.id);
    await supabase.from("cases").update({ sibling_case_id: b.id }).eq("id", a.id);
    created = a;
  } else {
    created = await insertOneCase(input);
  }

  // Envia o caso COMPLETO imediatamente para as outras sessões.
  // Antes era enviado só { id } e o outro computador dependia de refetch,
  // por isso a lista ficava atrasada (13 casos até a próxima busca).
  let fullCreated: CaseRow | null = null;
  try {
    if (created?.id) {
      fullCreated = await fetchCaseById(created.id);
      broadcastEntity("cases", "insert", fullCreated ?? created);
    }
  } catch (e) { console.warn("broadcast case insert failed", e); }

  // Notify cadista (if linked to a user) when a case is created and assigned to them
  try {
    if (input.cadista_id) {
      const { data: cadista } = await supabase
        .from("cadistas")
        .select("name, user_id")
        .eq("id", input.cadista_id)
        .maybeSingle();
      const { data: patient } = await supabase
        .from("patients")
        .select("name")
        .eq("id", input.patient_id)
        .maybeSingle();
      const { data: { user } } = await supabase.auth.getUser();
      const patientName = (patient as any)?.name ?? "paciente";
      if ((cadista as any)?.user_id) {
        const nId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        const notif = {
          id: nId,
          sender_id: user?.id ?? null,
          recipient_id: (cadista as any).user_id,
          title: "Novo caso atribuído a você",
          content: `Você foi designado(a) como cadista do caso de ${patientName}.`,
          type: "case_assigned",
          metadata: { case_id: created.id },
          read_at: null,
          created_at: new Date().toISOString(),
        };
        try { broadcastEntity("notifications", "insert", notif); } catch { /* ignore */ }
        await supabase.from("notifications").insert(notif as any);
      }

      // Activity log entry
      try {
        const { addCaseActivity } = await import("./case-activity");
        await addCaseActivity(created.id, "create", `Caso criado para ${patientName}.`, []);
      } catch (e) { console.warn(e); }
    }
  } catch (e) {
    console.warn("notify cadista on create failed", e);
  }

  return fullCreated ?? created;
}



export const updateCase = async (id: string, patch: Record<string, unknown>) => {
  // Optimistic peer broadcast BEFORE the round-trip: peers com o caso aberto
  // ou vendo a lista aplicam o patch instantaneamente. Se o UPDATE falhar,
  // o Realtime/postgres_changes seguinte reverte.
  try { broadcastEntity("cases", "update", { id, ...patch, updated_at: new Date().toISOString() }); } catch { /* ignore */ }
  const { error } = await supabase.from("cases").update(patch as never).eq("id", id);
  if (error) throw error;
};

export const finishCase = async (id: string) => {
  await updateCase(id, { status: "finalizado", finished_at: new Date().toISOString() });
  try {
    const { consumeCaseStock } = await import("./stock");
    await consumeCaseStock(id);
  } catch (e) {
    console.warn("consume_case_stock failed", e);
  }
};

export const reopenCase = async (id: string) => {
  const { data: c } = await supabase.from("cases").select("reopened_count").eq("id", id).single();
  const next = (c?.reopened_count ?? 0) + 1;
  try {
    const { reverseCaseStock } = await import("./stock");
    await reverseCaseStock(id);
  } catch (e) {
    console.warn("reverse_case_stock failed", e);
  }
  await updateCase(id, {
    status: "active",
    finished_at: null,
    reopened_at: new Date().toISOString(),
    reopened_count: next,
  });
};

// Reorder helper for stages/phases (admin)
export async function reorderItem(
  table: "stages" | "phases",
  items: Array<{ id: string; position: number }>,
  id: string,
  dir: "up" | "down",
) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= sorted.length) return;
  const a = sorted[idx];
  const b = sorted[swapWith];
  // swap positions
  await supabase.from(table).update({ position: b.position }).eq("id", a.id);
  await supabase.from(table).update({ position: a.position }).eq("id", b.id);
}

export const deleteCase = async (id: string) => {
  markDeleted(id);
  // 1. Cancel any in-flight uploads for this case (and auto-purge ones that
  //    still finish after the cancel signal).
  try {
    const { uploadManager } = await import("@/lib/upload-manager");
    uploadManager.cancelCase(id);
  } catch { /* ignore */ }

  // Discover deleter name for the broadcast notice + admin log
  let deleterName = "Alguém";
  let deleterId: string | null = null;
  try {
    const { data: u } = await supabase.auth.getUser();
    deleterId = u.user?.id ?? null;
    if (deleterId) {
      const { data: prof } = await supabase
        .from("profiles").select("full_name").eq("id", deleterId).maybeSingle();
      deleterName = (prof as { full_name?: string } | null)?.full_name || u.user?.email || "Alguém";
    }
  } catch { /* ignore */ }

  // Snapshot case + patient + attachments for the internal audit log
  let patientName: string | null = null;
  let caseSnapshot: unknown = null;
  const attachmentSnapshot: Array<{ id: string; file_name: string; storage_path: string; kind: string }> = [];
  try {
    const { data: cse } = await supabase
      .from("cases")
      .select("*, patient:patients(name)")
      .eq("id", id).maybeSingle();
    caseSnapshot = cse;
    patientName = ((cse as { patient?: { name?: string } } | null)?.patient?.name) ?? null;
  } catch { /* ignore */ }

  // IMMEDIATE broadcast so peers with the case open close/notify instantly,
  // before the heavy dependent-row cleanup runs.
  try {
    broadcastEntity("cases", "delete", {
      id,
      deleter_name: deleterName,
      patient_name: patientName,
      deleted_notice: true,
    });

    const ch = supabase.channel("case-deletions");
    await ch.subscribe();
    await ch.send({
      type: "broadcast",
      event: "case_deleted",
      payload: { case_id: id, deleter_name: deleterName, patient_name: patientName },
    });
    setTimeout(() => { supabase.removeChannel(ch); }, 500);
  } catch { /* ignore */ }


  // 2. Purge all storage files for this case's attachments
  try {
    const { data: atts } = await supabase
      .from("case_attachments")
      .select("id, file_name, storage_path, kind")
      .eq("case_id", id);
    const list = (atts ?? []) as Array<{ id: string; file_name: string; storage_path: string; kind: string }>;
    attachmentSnapshot.push(...list);
    const paths = list.map((a) => a.storage_path).filter(Boolean);
    if (paths.length) {
      for (let i = 0; i < paths.length; i += 100) {
        try { await supabase.storage.from("case-files").remove(paths.slice(i, i + 100)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // 3. Devolve ao estoque tudo que foi consumido por este caso
  //    (implantes por dente, uso por dente e regras automáticas).
  try {
    await supabase.rpc("reverse_all_case_stock" as never, { _case_id: id } as never);
  } catch (e) { console.error("reverse_all_case_stock", e); }

  // 4. Delete all dependent rows
  await supabase.from("model_annotations").delete().eq("case_id", id);
  await supabase.from("case_attachments" as never).delete().eq("case_id", id);
  await supabase.from("case_activity").delete().eq("case_id", id);
  await supabase.from("case_tooth_stock_usage").delete().eq("case_id", id);
  await supabase.from("case_stock_consumptions").delete().eq("case_id", id);
  await supabase.from("case_implant_teeth" as never).delete().eq("case_id", id);
  await supabase.from("case_stages").delete().eq("case_id", id);
  await supabase.from("case_components").delete().eq("case_id", id);
  await supabase.from("case_types_link").delete().eq("case_id", id);
  // Preserve inventory accounting: nullify case link on stock movements & burrs
  await supabase.from("stock_movements").update({ case_id: null }).eq("case_id", id);
  await supabase.from("burr_usages").update({ case_id: null }).eq("case_id", id);
  await supabase.from("cases").update({ sibling_case_id: null }).eq("sibling_case_id", id);

  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) throw error;

  // 4. Internal audit trail (not visible in normal UI)
  try {
    await supabase.from("admin_logs").insert([{
      admin_id: deleterId,
      action: "DELETE_CASE",
      details: {
        case_id: id,
        patient_name: patientName,
        deleter_name: deleterName,
        deleted_at: new Date().toISOString(),
        case_snapshot: caseSnapshot,
        attachments: attachmentSnapshot,
      } as never,
    }]);
  } catch { /* ignore */ }

  // Immediate broadcast was already sent above.

};

export async function syncCaseTypes(caseId: string, typeIds: string[]) {
  await supabase.from("case_types_link").delete().eq("case_id", caseId);
  if (typeIds.length) {
    await supabase
      .from("case_types_link")
      .insert(typeIds.map((t) => ({ case_id: caseId, case_type_id: t })));
  }
}


// Item 3: trocar etapa atual única
export const setCurrentStage = async (caseId: string, stageId: string | null) => {
  // Find phase of stage so we keep current_phase_id consistent
  let phaseId: string | null = null;
  if (stageId) {
    const { data: s } = await supabase.from("stages").select("phase_id").eq("id", stageId).single();
    phaseId = s?.phase_id ?? null;
  }
  const { error } = await supabase
    .from("cases")
    .update({ current_stage_id: stageId, current_phase_id: phaseId })
    .eq("id", caseId);
  if (error) throw error;
  if (stageId) {
    await supabase.from("case_stages").insert({
      case_id: caseId,
      stage_id: stageId,
      position: 0,
    });
  }
};

// Move case to a phase directly (sets current_phase_id; keeps stage if it belongs to phase, otherwise clears stage)
export const setCurrentPhase = async (caseId: string, phaseId: string | null) => {
  const patch: Record<string, unknown> = { current_phase_id: phaseId };
  if (phaseId === null) {
    patch.current_stage_id = null;
  } else {
    // If the current stage doesn't belong to the new phase, clear it
    const { data: c } = await supabase.from("cases").select("current_stage_id").eq("id", caseId).single();
    if (c?.current_stage_id) {
      const { data: s } = await supabase.from("stages").select("phase_id").eq("id", c.current_stage_id).single();
      if (s?.phase_id !== phaseId) patch.current_stage_id = null;
    }
  }
  const { error } = await supabase.from("cases").update(patch as never).eq("id", caseId);
  if (error) throw error;
};

// legacy timeline ops (mantidos para histórico)
export const addStageToCase = async (case_id: string, stage_id: string) => {
  const { error } = await supabase.from("case_stages").insert({ case_id, stage_id });
  if (error && !error.message.includes("duplicate")) throw error;
};
export const removeCaseStage = async (id: string) => {
  const { error } = await supabase.from("case_stages").delete().eq("id", id);
  if (error) throw error;
};
export const updateCaseStagePending = async (id: string, pending_count: number) => {
  const { error } = await supabase.from("case_stages").update({ pending_count }).eq("id", id);
  if (error) throw error;
};

// Upload de foto do paciente
export async function uploadPatientPhoto(patientId: string, file: Blob): Promise<string> {
  const path = `${patientId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("patient-photos")
    .upload(path, file, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  // Bucket is private; return a long-lived signed URL (10 years).
  const { data, error: signErr } = await supabase.storage
    .from("patient-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return data.signedUrl;
}

export async function uploadUserAvatar(file: Blob): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const path = `${user.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  const url = data.signedUrl;
  const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url } as never).eq("id", user.id);
  if (updErr) throw updErr;
  return url;
}

// Generic admin CRUD
export async function adminCreate<T extends Record<string, unknown>>(table: string, values: T) {
  const { error } = await supabase.from(table as never).insert(values as never);
  if (error) throw error;
}
export async function adminUpdate<T extends Record<string, unknown>>(table: string, id: string, values: T) {
  const { error } = await supabase.from(table as never).update(values as never).eq("id", id);
  if (error) throw error;
}
export async function adminDelete(table: string, id: string) {
  markDeleted(id);
  const { error } = await supabase.from(table as never).delete().eq("id", id);
  if (error) throw error;
}

// Patient attachments
import type { PatientAttachment } from "./types";

export async function fetchPatientAttachments(patientId: string): Promise<PatientAttachment[]> {
  const { data, error } = await supabase
    .from("patient_attachments" as never)
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PatientAttachment[];
}

export async function uploadPatientAttachment(
  patientId: string,
  file: File,
  meta: { title: string; description?: string | null; kind?: string },
): Promise<PatientAttachment> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${patientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("patient-files")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from("patient-files")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  const file_url = signed?.signedUrl ?? "";
  const isImage = (file.type || "").startsWith("image/");
  const { data, error } = await supabase
    .from("patient_attachments" as never)
    .insert({
      patient_id: patientId,
      title: meta.title,
      description: meta.description ?? null,
      kind: meta.kind ?? "other",
      file_url,
      file_path: path,
      thumbnail_url: isImage ? file_url : null,
      mime_type: file.type || null,
      size_bytes: file.size,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PatientAttachment;
}

export async function deletePatientAttachment(att: PatientAttachment) {
  markDeleted(att.id);
  await supabase.storage.from("patient-files").remove([att.file_path]);
  const { error } = await supabase.from("patient_attachments" as never).delete().eq("id", att.id);
  if (error) throw error;
}

export async function refreshAttachmentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("patient-files")
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

// ===== Case attachments (72h auto-expire) =====
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
  kind?: "fabrication" | "model" | "exocad_html" | "scans" | "gallery" | "comment_image" | "other" | null;
};

export async function fetchCaseAttachments(caseId: string): Promise<CaseAttachment[]> {
  const { data, error } = await supabase
    .from("case_attachments" as never)
    .select("*")
    .eq("case_id", caseId)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CaseAttachment[];
}

export type CaseAttachmentKind = "fabrication" | "model" | "exocad_html" | "scans" | "gallery" | "comment_image" | "other";

export async function uploadCaseAttachment(
  caseId: string,
  file: File,
  notes?: string,
  kind: CaseAttachmentKind = "other",
): Promise<CaseAttachment> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${caseId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("case-files")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("case_attachments" as never)
    .insert({
      case_id: caseId,
      file_name: file.name,
      storage_path: path,
      size_bytes: file.size,
      mime_type: file.type || null,
      uploaded_by: userRes.user?.id ?? null,
      notes: notes ?? null,
      kind,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as CaseAttachment;
}

export async function fetchCaseAttachmentText(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("case-files").download(path);
  if (error) throw error;
  return await data.text();
}

export async function getCaseAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("case-files")
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteCaseAttachment(att: CaseAttachment) {
  markDeleted(att.id);
  try { await supabase.storage.from("case-files").remove([att.storage_path]); } catch {}
  const { error } = await supabase.from("case_attachments" as never).delete().eq("id", att.id);
  if (error) throw error;
}

// ===== Ad-hoc component on a case (creates component then links) =====
export async function addAdhocCaseComponent(caseId: string, name: string, qty = 1, notes?: string) {
  const { data: comp, error: e1 } = await supabase
    .from("components")
    .insert({ name, category: "Avulso" })
    .select()
    .single();
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("case_components")
    .insert({ case_id: caseId, component_id: comp.id, qty, notes: notes ?? null });
  if (e2) throw e2;
}

export async function addCaseComponent(caseId: string, componentId: string, qty = 1, notes?: string) {
  const { error } = await supabase
    .from("case_components")
    .insert({ case_id: caseId, component_id: componentId, qty, notes: notes ?? null });
  if (error) throw error;
}

export async function removeCaseComponent(id: string) {
  markDeleted(id);
  const { error } = await supabase.from("case_components").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Clinics & memberships ----------
import type { Clinic, ClinicMember } from "./types";

export async function fetchClinics(): Promise<Clinic[]> {
  const { data, error } = await supabase.from("clinics").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Clinic[];
}

export async function fetchMyMemberships(): Promise<ClinicMember[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("clinic_members")
    .select("*, clinic:clinics(*)")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []) as unknown as ClinicMember[];
}

export async function fetchPendingJoinRequests(): Promise<ClinicMember[]> {
  const currentProfile = await fetchProfile();
  const canReviewRequests = currentProfile?.role === "CEO" || currentProfile?.role === "DR";
  if (!canReviewRequests || !currentProfile?.clinic_id) return [];

  const { data, error } = await supabase
    .from("clinic_members")
    .select("*, clinic:clinics(*)")
    .eq("status", "pending")
    .eq("clinic_id", currentProfile.clinic_id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const memberships = (data ?? []) as unknown as ClinicMember[];
  const userIds = memberships.map((membership) => membership.user_id);

  if (userIds.length === 0) return memberships;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);
  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile as unknown as Profile]));

  return memberships.map((membership) => ({
    ...membership,
    profile: profilesById.get(membership.user_id),
  }));
}

export async function requestJoinClinic(clinicId: string) {
  const { data, error } = await supabase.rpc("request_join_clinic", { p_clinic_id: clinicId });
  if (error) throw error;
  const r = data as any;
  if (r && r.success === false) throw new Error(r.error || "Erro");
  return r;
}

export async function approveJoinRequest(memberId: string, role: string) {
  const { data, error } = await supabase.rpc("approve_join_request", { p_member_id: memberId, p_role: role });
  if (error) throw error;
  const r = data as any;
  if (r && r.success === false) throw new Error(r.error || "Erro");
}

export async function rejectJoinRequest(memberId: string) {
  const { data, error } = await supabase.rpc("reject_join_request", { p_member_id: memberId });
  if (error) throw error;
  const r = data as any;
  if (r && r.success === false) throw new Error(r.error || "Erro");
}

export async function adminSetMemberPassword(userId: string, password: string) {
  const { data, error } = await supabase.rpc("admin_set_member_password", { p_user_id: userId, p_password: password });
  if (error) throw error;
  const r = data as any;
  if (r && r.success === false) throw new Error(r.error || "Erro");
}

// Lightweight: members of current user's clinic (active) for assignment pickers
export async function fetchClinicTeamProfiles(): Promise<Profile[]> {
  const currentProfile = await fetchProfile();
  let query = supabase.from("profiles").select("*").order("full_name", { ascending: true });
  if (currentProfile?.clinic_id) {
    query = query.eq("clinic_id", currentProfile.clinic_id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}
