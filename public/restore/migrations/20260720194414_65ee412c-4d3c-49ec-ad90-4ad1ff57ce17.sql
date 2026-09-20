GRANT EXECUTE ON FUNCTION public.current_user_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
