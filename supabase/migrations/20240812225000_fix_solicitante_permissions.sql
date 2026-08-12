-- Update is_staff to include SOLICITANTE so they can access clinical dropdowns/stock
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
      AND role IN ('admin', 'dentista', 'recepcionista', 'auxiliar', 'protetico', 'SOLICITANTE')
  )
$$;

-- Allow SOLICITANTE to see all clinical team members
DROP POLICY IF EXISTS profiles_select_self_or_staff ON public.profiles;
CREATE POLICY profiles_select_self_or_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()) OR public.current_user_is_admin());

-- Ensure SOLICITANTE can read core clinical and stock data
DO $$
DECLARE t text; pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'doctors', 'cadistas', 'case_types', 'tooth_colors', 'implant_systems', 
    'scan_jigs', 'components', 'stock_items', 'component_categories'
  ]
  LOOP
    pol := t || '_select_solicitante';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      pol, t);
  END LOOP;
END $$;

-- Update can_access_case to include requester (SOLICITANTE)
CREATE OR REPLACE FUNCTION public.can_access_case(_case_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT 
    public.is_staff(auth.uid()) OR 
    public.current_user_is_admin() OR
    EXISTS (
      SELECT 1 FROM public.cases c 
      WHERE c.id = _case_id 
        AND (c.requested_by = auth.uid() OR EXISTS (
          SELECT 1 FROM public.cadistas cd WHERE cd.id = c.cadista_id AND cd.user_id = auth.uid()
        ))
    )
$$;
