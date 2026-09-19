GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_default_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_is_default_admin(uuid) TO authenticated;

-- Keep these explicit because the app calls them during the authenticated route guard.
GRANT EXECUTE ON FUNCTION public.current_user_has_clinic() TO authenticated;
GRANT EXECUTE ON FUNCTION public.heal_current_user_clinic_link() TO authenticated;
