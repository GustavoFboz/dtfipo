-- Compatibilidade idempotente para instalações que tenham aplicado a primeira
-- versão da migration clínica antes do ajuste de status de membership.
CREATE OR REPLACE FUNCTION public.current_clinic_role(_clinic_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(COALESCE(NULLIF(trim(p.account_subtype), ''), NULLIF(trim(cm.role), ''), NULLIF(trim(p.role), ''), 'USER'))
  FROM public.profiles p
  LEFT JOIN public.clinic_members cm
    ON cm.user_id = p.id
   AND cm.clinic_id = _clinic_id
   AND cm.status = 'active'
  WHERE p.id = auth.uid()
    AND p.clinic_id = _clinic_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_clinic_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_clinic_role(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
