
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_self_or_staff" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "profiles_insert_self_or_admin" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid()
      AND COALESCE(role, 'USER') = 'USER'
      AND COALESCE(is_default_admin, false) = false
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('CEO','DR')
    )
  );

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('CEO','DR')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('CEO','DR'))
    OR (
      id = auth.uid()
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      AND COALESCE(is_default_admin,false) = COALESCE((SELECT p.is_default_admin FROM public.profiles p WHERE p.id=auth.uid()), false)
    )
  );

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can mark their own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark their own notifications as read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Admins can insert logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Admins can view all logs" ON public.admin_logs;
CREATE POLICY "Admins can insert logs" ON public.admin_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('CEO','DR')));
CREATE POLICY "Admins can view all logs" ON public.admin_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('CEO','DR')));

DROP POLICY IF EXISTS "case_files_update" ON storage.objects;
CREATE POLICY "case_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'case-files' AND public.is_staff(auth.uid()) AND public.can_access_case(((storage.foldername(name))[1])::uuid))
  WITH CHECK (bucket_id = 'case-files' AND public.is_staff(auth.uid()) AND public.can_access_case(((storage.foldername(name))[1])::uuid));

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.ensure_first_user_is_admin() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.create_team_member(text,text,text,text) SET search_path = public;
ALTER FUNCTION public.delete_team_member(uuid,text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.create_team_member(text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_team_member(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_case_stock(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_case_stock(uuid,uuid) FROM PUBLIC, anon, authenticated;
