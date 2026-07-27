REVOKE EXECUTE ON FUNCTION public.case_stage_requirement_blockers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.case_stage_requirement_blockers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.case_stage_requirement_blockers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.case_stage_requirement_blockers(uuid) TO service_role;