
-- 1) Fix search_path on remaining functions
ALTER FUNCTION public.normalize_text(text) SET search_path = public;
ALTER FUNCTION public.patients_set_unaccent() SET search_path = public;

-- 2) Avatars: restrict SELECT to authenticated
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- 3) Unify admin check across systems
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('CEO','DR')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- has_role: keep behavior but treat CEO/DR as implicit 'admin'
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  ) OR (
    _role = 'admin'::app_role
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role IN ('CEO','DR'))
  );
$$;

-- 4) Backups: use unified admin check
DROP POLICY IF EXISTS backups_admin_all ON public.backups;
CREATE POLICY backups_admin_all ON public.backups
  FOR ALL TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

-- 5) profiles_self_update: rebind to authenticated, harden NULL handling
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR public.current_user_is_admin())
  WITH CHECK (
    public.current_user_is_admin()
    OR (
      id = auth.uid()
      AND COALESCE(role, '') = COALESCE((SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()), '')
      AND COALESCE(account_subtype, '') = COALESCE((SELECT p.account_subtype FROM public.profiles p WHERE p.id = auth.uid()), '')
      AND COALESCE(is_default_admin, false) = COALESCE((SELECT p.is_default_admin FROM public.profiles p WHERE p.id = auth.uid()), false)
      AND COALESCE(clinic_id::text, '') = COALESCE((SELECT p.clinic_id::text FROM public.profiles p WHERE p.id = auth.uid()), '')
    )
  );

-- 6) Lock down function EXECUTE grants
-- Revoke EXECUTE from PUBLIC and anon on all public functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Revoke EXECUTE from authenticated on internal/trigger-only functions
DO $$
DECLARE
  fn text;
  internal text[] := ARRAY[
    'handle_new_user','sync_profile_to_team','apply_stock_movement',
    'touch_last_restocked','prevent_profile_privilege_escalation',
    'patients_set_unaccent','update_updated_at_column','set_updated_at',
    'ensure_first_user_is_admin','prevent_unsafe_truncate',
    'generate_user_code','generate_clinic_invite_code','normalize_text',
    'consume_case_stock','reverse_case_stock','reverse_stock_rules_for_stage',
    'apply_stock_rules_for_stage','validate_tooth_rules_for_stage',
    'eligible_teeth_for_rule','profile_role','profile_is_default_admin'
  ];
  r record;
BEGIN
  FOREACH fn IN ARRAY internal LOOP
    FOR r IN
      SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                     r.nspname, r.proname, r.args);
    END LOOP;
  END LOOP;
END $$;
