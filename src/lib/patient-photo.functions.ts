// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAuthorizedPatientPhotoUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { patient_ids: string[] }) => ({
    patient_ids: Array.from(
      new Set(
        (Array.isArray(data?.patient_ids) ? data.patient_ids : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 200),
  }))
  .handler(async ({ data, context }) => {
    const ids = data.patient_ids;
    if (!ids.length) return { success: true, photos: {} as Record<string, string> };

    // Authorization boundary: ask with the caller's authenticated client which
    // case rows are actually visible. RLS remains authoritative.
    const { data: visibleCases, error: caseError } = await context.supabase
      .from("cases")
      .select("patient_id")
      .in("patient_id", ids);

    if (caseError) throw caseError;

    const allowedIds = Array.from(
      new Set((visibleCases ?? []).map((row: any) => row.patient_id).filter(Boolean)),
    ) as string[];

    if (!allowedIds.length) {
      return { success: true, photos: {} as Record<string, string> };
    }

    // Read only the already-authorized patients with the server client. This
    // repairs partial nested case payloads without widening patient access.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: patients, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id,photo_url")
      .in("id", allowedIds);

    if (patientError) throw patientError;

    const photos: Record<string, string> = {};
    for (const patient of patients ?? []) {
      const id = String((patient as any)?.id || "");
      const url = String((patient as any)?.photo_url || "").trim();
      if (id && url) photos[id] = url;
    }

    return { success: true, photos };
  });
