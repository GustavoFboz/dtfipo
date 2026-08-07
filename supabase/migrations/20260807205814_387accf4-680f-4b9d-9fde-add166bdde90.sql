-- 1) profiles: self or staff
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_self_or_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()) OR public.current_user_is_admin());

-- 2) business tables: restrict open ALL policies to staff/admin
DROP POLICY IF EXISTS checklist_templates_all ON public.checklist_templates;
CREATE POLICY checklist_templates_staff_all ON public.checklist_templates
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.current_user_is_admin())
  WITH CHECK (public.is_staff(auth.uid()) OR public.current_user_is_admin());

DROP POLICY IF EXISTS case_checklists_all ON public.case_checklists;
CREATE POLICY case_checklists_case_access ON public.case_checklists
  FOR ALL TO authenticated
  USING (public.can_access_case(case_id) OR public.current_user_is_admin())
  WITH CHECK (public.can_access_case(case_id) OR public.current_user_is_admin());

DROP POLICY IF EXISTS case_checklist_items_all ON public.case_checklist_items;
CREATE POLICY case_checklist_items_case_access ON public.case_checklist_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.case_checklists cc WHERE cc.id = checklist_id AND (public.can_access_case(cc.case_id) OR public.current_user_is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.case_checklists cc WHERE cc.id = checklist_id AND (public.can_access_case(cc.case_id) OR public.current_user_is_admin())));

DROP POLICY IF EXISTS resin_pots_all ON public.resin_pots;
CREATE POLICY resin_pots_staff_all ON public.resin_pots
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.current_user_is_admin())
  WITH CHECK (public.is_staff(auth.uid()) OR public.current_user_is_admin());

DROP POLICY IF EXISTS resin_weighings_all ON public.resin_weighings;
CREATE POLICY resin_weighings_staff_all ON public.resin_weighings
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.current_user_is_admin())
  WITH CHECK (public.is_staff(auth.uid()) OR public.current_user_is_admin());

-- 3) config tables: restrict SELECT to staff/admin
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workflow_settings','phase_assignments','stage_assignments','stage_return_reasons','stock_item_custom_fields','stock_consumption_rules']
  LOOP
    pol := t || '_select';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR public.current_user_is_admin())',
      t || '_select_staff', t);
  END LOOP;
END $$;

-- 4) storage: drop legacy bucket-only permissive policies
DROP POLICY IF EXISTS avatars_auth_select ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_update ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_delete ON storage.objects;
DROP POLICY IF EXISTS case_files_auth_select ON storage.objects;
DROP POLICY IF EXISTS case_files_auth_insert ON storage.objects;
DROP POLICY IF EXISTS case_files_auth_update ON storage.objects;
DROP POLICY IF EXISTS case_files_auth_delete ON storage.objects;
DROP POLICY IF EXISTS patient_files_auth_select ON storage.objects;
DROP POLICY IF EXISTS patient_files_auth_insert ON storage.objects;
DROP POLICY IF EXISTS patient_files_auth_update ON storage.objects;
DROP POLICY IF EXISTS patient_files_auth_delete ON storage.objects;
DROP POLICY IF EXISTS patient_photos_auth_select ON storage.objects;
DROP POLICY IF EXISTS patient_photos_auth_insert ON storage.objects;
DROP POLICY IF EXISTS patient_photos_auth_update ON storage.objects;
DROP POLICY IF EXISTS patient_photos_auth_delete ON storage.objects;

-- avatars: readable by authenticated, writable only in own folder
DROP POLICY IF EXISTS avatars_authenticated_read ON storage.objects;
CREATE POLICY avatars_authenticated_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS avatars_user_insert ON storage.objects;
CREATE POLICY avatars_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_user_update ON storage.objects;
CREATE POLICY avatars_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS avatars_user_delete ON storage.objects;
CREATE POLICY avatars_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- case-files: keep ownership-checked policies; add missing UPDATE
DROP POLICY IF EXISTS case_files_update ON storage.objects;
CREATE POLICY case_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'case-files' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'case-files' AND public.is_staff(auth.uid()));

-- patient-files: staff only
DROP POLICY IF EXISTS patient_files_staff_select ON storage.objects;
CREATE POLICY patient_files_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files' AND (public.is_staff(auth.uid()) OR public.current_user_is_admin()));
DROP POLICY IF EXISTS patient_files_staff_insert ON storage.objects;
CREATE POLICY patient_files_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files' AND (public.is_staff(auth.uid()) OR public.current_user_is_admin()));
DROP POLICY IF EXISTS patient_files_staff_update ON storage.objects;
CREATE POLICY patient_files_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-files' AND (public.is_staff(auth.uid()) OR public.current_user_is_admin()))
  WITH CHECK (bucket_id = 'patient-files' AND (public.is_staff(auth.uid()) OR public.current_user_is_admin()));
DROP POLICY IF EXISTS patient_files_staff_delete ON storage.objects;
CREATE POLICY patient_files_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files' AND (public.is_staff(auth.uid()) OR public.current_user_is_admin()));

-- 5) function hardening: fixed search_path + revoke EXECUTE from anon/PUBLIC
ALTER FUNCTION public.generate_user_code() SET search_path = public;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- trigger/internal-only functions must not be callable by signed-in users
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('handle_new_user','apply_stock_movement','apply_resin_weighing',
                               'touch_last_restocked','set_updated_at','sync_cadista_from_profile',
                               'generate_user_code','update_updated_at_column',
                               'prevent_profile_privilege_escalation','patients_set_unaccent')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;