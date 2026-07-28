
-- Helper: current_user_is_admin
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('CEO','DR')
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

-- Table: user_stock_access
CREATE TABLE IF NOT EXISTS public.user_stock_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.component_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (user_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stock_access TO authenticated;
GRANT ALL ON public.user_stock_access TO service_role;

ALTER TABLE public.user_stock_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage stock access" ON public.user_stock_access;
CREATE POLICY "Admins manage stock access"
  ON public.user_stock_access FOR ALL
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS "Users can view own stock access" ON public.user_stock_access;
CREATE POLICY "Users can view own stock access"
  ON public.user_stock_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_stock_access_user ON public.user_stock_access(user_id);

-- Function: update_team_member
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_category_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('CEO','DR') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  UPDATE public.profiles
     SET full_name = p_full_name,
         email = p_email,
         phone = p_phone,
         role = p_role,
         account_subtype = p_role,
         updated_at = now()
   WHERE id = p_user_id;

  DELETE FROM public.user_stock_access
   WHERE user_id = p_user_id
     AND (p_category_ids IS NULL OR NOT (category_id = ANY(p_category_ids)));

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO public.user_stock_access(user_id, category_id, created_by)
    SELECT p_user_id, c, auth.uid() FROM unnest(p_category_ids) AS c
    ON CONFLICT (user_id, category_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;

REVOKE ALL ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) TO authenticated;
