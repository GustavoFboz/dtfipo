import { supabase } from "@/integrations/supabase/client";
import type * as THREE_NS from "three";
import type { Annotation } from "@/components/model-viewer/annotation-types";

export type SerializedVec = { x: number; y: number; z: number };

export type SerializedAnnotation =
  | { id: string; type: "stroke"; color: string; width: number; points: SerializedVec[] }
  | { id: string; type: "rect" | "circle" | "arrow"; color: string; width: number; a: SerializedVec; b: SerializedVec }
  | { id: string; type: "comment"; color: string; text: string; anchor: SerializedVec };

export type CameraState = { pos: SerializedVec; target: SerializedVec };

export type ModelAnnotationRow = {
  id: string;
  case_id: string;
  attachment_id: string | null;
  normalized_name: string;
  author_id: string;
  payload: SerializedAnnotation;
  camera: CameraState | null;
  mentions: string[];
  created_at: string;
  updated_at: string;
};

const v = (p: THREE_NS.Vector3): SerializedVec => ({ x: p.x, y: p.y, z: p.z });

export function serializeAnnotation(a: Annotation): SerializedAnnotation {
  if (a.type === "stroke") return { id: a.id, type: "stroke", color: a.color, width: a.width, points: a.points.map(v) };
  if (a.type === "comment") return { id: a.id, type: "comment", color: a.color, text: a.text, anchor: v(a.anchor) };
  return { id: a.id, type: a.type, color: a.color, width: a.width, a: v(a.a), b: v(a.b) };
}

export function deserializeAnnotation(THREE: typeof THREE_NS, s: SerializedAnnotation): Annotation {
  const V = (p: SerializedVec) => new THREE.Vector3(p.x, p.y, p.z);
  if (s.type === "stroke") return { id: s.id, type: "stroke", color: s.color, width: s.width, points: s.points.map(V) };
  if (s.type === "comment") return { id: s.id, type: "comment", color: s.color, text: s.text, anchor: V(s.anchor) };
  return { id: s.id, type: s.type, color: s.color, width: s.width, a: V(s.a), b: V(s.b) };
}

export async function fetchModelAnnotations(caseId: string, normalizedName: string): Promise<ModelAnnotationRow[]> {
  const { data, error } = await supabase
    .from("model_annotations" as never)
    .select("*")
    .eq("case_id", caseId)
    .eq("normalized_name", normalizedName)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ModelAnnotationRow[];
}

export async function saveModelAnnotation(opts: {
  caseId: string;
  attachmentId?: string;
  normalizedName: string;
  payload: SerializedAnnotation;
  camera?: CameraState | null;
  mentions?: string[];
}): Promise<ModelAnnotationRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("model_annotations" as never)
    .insert({
      case_id: opts.caseId,
      attachment_id: opts.attachmentId ?? null,
      normalized_name: opts.normalizedName,
      author_id: user.id,
      payload: opts.payload,
      camera: opts.camera ?? null,
      mentions: opts.mentions ?? [],
    } as never)
    .select()
    .single();
  if (error) { console.error("saveModelAnnotation", error); return null; }
  return data as unknown as ModelAnnotationRow;
}

export async function deleteModelAnnotation(id: string): Promise<boolean> {
  const { error } = await supabase.from("model_annotations" as never).delete().eq("id", id);
  if (error) { console.warn("deleteModelAnnotation", error.message); return false; }
  return true;
}

export function subscribeModelAnnotations(
  caseId: string,
  handlers: {
    onInsert?: (row: ModelAnnotationRow) => void;
    onUpdate?: (row: ModelAnnotationRow) => void;
    onDelete?: (id: string) => void;
  },
) {
  const channel = supabase
    .channel(`model_annotations:${caseId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "model_annotations", filter: `case_id=eq.${caseId}` },
      (p) => handlers.onInsert?.(p.new as ModelAnnotationRow),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "model_annotations", filter: `case_id=eq.${caseId}` },
      (p) => handlers.onUpdate?.(p.new as ModelAnnotationRow),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "model_annotations", filter: `case_id=eq.${caseId}` },
      (p) => handlers.onDelete?.((p.old as { id: string }).id),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
