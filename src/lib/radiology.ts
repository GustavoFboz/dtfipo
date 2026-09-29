import { supabase } from "@/integrations/supabase/client";

export type RadiologyStudy = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  requested_by: string | null;
  study_instance_uid: string;
  accession_number: string | null;
  modality: string | null;
  study_description: string | null;
  study_date: string | null;
  patient_external_id: string | null;
  status: "received" | "processing" | "ready" | "reported" | "archived" | "error";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  patient?: { id: string; name: string } | null;
};

export type RadiologyUploadInput = {
  clinicId: string;
  patientId?: string | null;
  modality?: string | null;
  description?: string | null;
  studyDate?: string | null;
  files: File[];
};

function localUid(prefix: "study" | "series" | "instance") {
  return `local:${prefix}:${crypto.randomUUID()}`;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-160) || "image.dcm";
}

export async function fetchRadiologyStudies(): Promise<RadiologyStudy[]> {
  const { data, error } = await (supabase as any)
    .from("radiology_studies")
    .select("*, patient:patients(id,name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RadiologyStudy[];
}

export async function uploadDicomStudy(input: RadiologyUploadInput): Promise<RadiologyStudy> {
  if (!input.files.length) throw new Error("Selecione ao menos um arquivo DICOM.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sessão inválida.");

  const studyId = crypto.randomUUID();
  const seriesId = crypto.randomUUID();
  const studyUid = localUid("study");
  const seriesUid = localUid("series");
  const accession = `DF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${studyId.slice(0, 8).toUpperCase()}`;

  const { data: study, error: studyError } = await (supabase as any)
    .from("radiology_studies")
    .insert({
      id: studyId,
      clinic_id: input.clinicId,
      patient_id: input.patientId ?? null,
      requested_by: auth.user.id,
      study_instance_uid: studyUid,
      accession_number: accession,
      modality: input.modality ?? null,
      study_description: input.description?.trim() || null,
      study_date: input.studyDate ?? new Date().toISOString().slice(0, 10),
      status: "processing",
      metadata: { source: "dentalflow_upload", dicom_metadata_state: "pending_parser", file_count: input.files.length },
    })
    .select("*")
    .single();
  if (studyError) throw studyError;

  const { error: seriesError } = await (supabase as any)
    .from("radiology_series")
    .insert({
      id: seriesId,
      study_id: studyId,
      series_instance_uid: seriesUid,
      modality: input.modality ?? null,
      series_number: 1,
      description: input.description?.trim() || null,
      instance_count: input.files.length,
      metadata: { source: "dentalflow_upload" },
    });
  if (seriesError) {
    await (supabase as any).from("radiology_studies").delete().eq("id", studyId);
    throw seriesError;
  }

  const uploadedPaths: string[] = [];
  try {
    for (let index = 0; index < input.files.length; index += 1) {
      const file = input.files[index];
      const instanceId = crypto.randomUUID();
      const fileName = `${String(index + 1).padStart(4, "0")}-${instanceId.slice(0, 8)}-${sanitizeName(file.name)}`;
      const path = `${input.clinicId}/${studyId}/${seriesId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("dicom-files").upload(path, file, {
        upsert: false,
        contentType: file.type || "application/dicom",
        cacheControl: "31536000",
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);

      const { error: instanceError } = await (supabase as any).from("radiology_instances").insert({
        id: instanceId,
        series_id: seriesId,
        sop_instance_uid: localUid("instance"),
        instance_number: index + 1,
        storage_path: path,
        byte_size: file.size,
        metadata: { original_name: file.name, mime_type: file.type || null, dicom_metadata_state: "pending_parser" },
      });
      if (instanceError) throw instanceError;
    }

    const { data: ready, error: readyError } = await (supabase as any)
      .from("radiology_studies")
      .update({ status: "ready" })
      .eq("id", studyId)
      .select("*, patient:patients(id,name)")
      .single();
    if (readyError) throw readyError;
    return ready as RadiologyStudy;
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("dicom-files").remove(uploadedPaths);
    await (supabase as any).from("radiology_studies").update({ status: "error" }).eq("id", studyId);
    throw error;
  }
}

export async function getFirstDicomSignedUrl(studyId: string) {
  const { data: series, error: seriesError } = await (supabase as any)
    .from("radiology_series")
    .select("id")
    .eq("study_id", studyId)
    .order("series_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (seriesError) throw seriesError;
  if (!series?.id) throw new Error("O estudo ainda não possui imagens.");

  const { data: instance, error: instanceError } = await (supabase as any)
    .from("radiology_instances")
    .select("storage_path")
    .eq("series_id", series.id)
    .order("instance_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (instanceError) throw instanceError;
  if (!instance?.storage_path) throw new Error("O estudo ainda não possui imagens.");

  const { data, error } = await supabase.storage.from("dicom-files").createSignedUrl(instance.storage_path, 300);
  if (error) throw error;
  return data.signedUrl;
}
