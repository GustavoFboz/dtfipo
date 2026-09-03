-- Return complete case data only after the current user is authorized for that
-- case. This avoids partial nested objects when related tables have independent
-- RLS policies while keeping the case itself as the authorization boundary.

CREATE OR REPLACE FUNCTION public.get_case_bundle(_case_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_jsonb(c)
    || jsonb_build_object(
      'patient', CASE WHEN p.id IS NULL THEN NULL ELSE to_jsonb(p) END,
      'doctor', CASE WHEN d.id IS NULL THEN NULL ELSE to_jsonb(d) END,
      'cadista', CASE WHEN cd.id IS NULL THEN NULL ELSE to_jsonb(cd) END,
      'case_type', CASE WHEN ct.id IS NULL THEN NULL ELSE to_jsonb(ct) END,
      'tooth_color', CASE WHEN tc.id IS NULL THEN NULL ELSE to_jsonb(tc) END,
      'current_stage', CASE WHEN st.id IS NULL THEN NULL ELSE to_jsonb(st) END,
      'implant_system', CASE WHEN ims.id IS NULL THEN NULL ELSE to_jsonb(ims) END,
      'scan_jig', CASE WHEN sj.id IS NULL THEN NULL ELSE to_jsonb(sj) END,
      'case_stages', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', cs.id,
            'pending_count', cs.pending_count,
            'started_at', cs.started_at,
            'completed_at', cs.completed_at,
            'stage', CASE WHEN s2.id IS NULL THEN NULL ELSE to_jsonb(s2) END
          )
          ORDER BY s2.position NULLS LAST, cs.started_at
        )
        FROM public.case_stages cs
        LEFT JOIN public.stages s2 ON s2.id = cs.stage_id
        WHERE cs.case_id = c.id
      ), '[]'::jsonb),
      'case_components', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', cc.id,
            'qty', cc.qty,
            'notes', cc.notes,
            'component', CASE WHEN comp.id IS NULL THEN NULL ELSE to_jsonb(comp) END
          )
          ORDER BY cc.id
        )
        FROM public.case_components cc
        LEFT JOIN public.components comp ON comp.id = cc.component_id
        WHERE cc.case_id = c.id
      ), '[]'::jsonb),
      'case_types_link', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'case_type_id', ctl.case_type_id,
            'case_type', CASE WHEN ct2.id IS NULL THEN NULL ELSE to_jsonb(ct2) END
          )
          ORDER BY ct2.name
        )
        FROM public.case_types_link ctl
        LEFT JOIN public.case_types ct2 ON ct2.id = ctl.case_type_id
        WHERE ctl.case_id = c.id
      ), '[]'::jsonb)
    )
  FROM public.cases c
  LEFT JOIN public.patients p ON p.id = c.patient_id
  LEFT JOIN public.doctors d ON d.id = c.doctor_id
  LEFT JOIN public.cadistas cd ON cd.id = c.cadista_id
  LEFT JOIN public.case_types ct ON ct.id = c.case_type_id
  LEFT JOIN public.tooth_colors tc ON tc.id = c.tooth_color_id
  LEFT JOIN public.stages st ON st.id = c.current_stage_id
  LEFT JOIN public.implant_systems ims ON ims.id = c.implant_system_id
  LEFT JOIN public.scan_jigs sj ON sj.id = c.scan_jig_id
  WHERE c.id = _case_id
    AND public.can_access_case(c.id)
$$;

CREATE OR REPLACE FUNCTION public.get_case_bundles(_case_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_case_bundle(c.id)
  FROM public.cases c
  WHERE c.id = ANY(_case_ids)
    AND public.can_access_case(c.id)
  ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.get_case_bundle(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_case_bundles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_case_bundle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_case_bundles(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
