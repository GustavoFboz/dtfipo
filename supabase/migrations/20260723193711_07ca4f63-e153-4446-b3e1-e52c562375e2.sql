
CREATE OR REPLACE FUNCTION public.update_team_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role text,
  p_category_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dentista')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão');
  END IF;

  UPDATE public.profiles
     SET full_name = COALESCE(p_full_name, full_name),
         email     = COALESCE(p_email, email),
         phone     = COALESCE(p_phone, phone),
         role      = COALESCE(p_role, role),
         updated_at = now()
   WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_member(uuid, text, text, text, text, uuid[]) TO authenticated;
