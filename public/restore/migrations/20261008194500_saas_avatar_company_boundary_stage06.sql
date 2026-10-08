-- Intersect legacy broad authenticated avatar SELECT policies without removing
-- them. Owners, their paid company, and explicit case participants retain access.
CREATE OR REPLACE FUNCTION public.can_access_user_avatar(_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    _owner_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles me JOIN public.profiles owner ON owner.id=_owner_id
      WHERE me.id=auth.uid() AND me.clinic_id=owner.clinic_id AND me.clinic_id IS NOT NULL
        AND public.company_has_operational_access(me.clinic_id))
    OR EXISTS (SELECT 1 FROM public.cases c
      WHERE public.can_access_case(c.id) AND (
        c.requested_by=_owner_id
        OR EXISTS (SELECT 1 FROM public.cadistas cd WHERE cd.id=c.cadista_id AND cd.user_id=_owner_id)
        OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.id=c.doctor_id AND d.user_id=_owner_id)
      ))
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_user_avatar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_user_avatar(uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS avatars_company_read_boundary ON storage.objects;
CREATE POLICY avatars_company_read_boundary ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    bucket_id<>'avatars' OR public.can_access_user_avatar(public.patient_id_from_storage_path(name))
  );
NOTIFY pgrst, 'reload schema';
