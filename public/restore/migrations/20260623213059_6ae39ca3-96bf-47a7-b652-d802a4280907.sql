
DROP POLICY IF EXISTS profiles_insert_self_or_admin ON public.profiles;

CREATE POLICY profiles_insert_self_only
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
  AND COALESCE(role, 'USER') = 'USER'
  AND COALESCE(is_default_admin, false) = false
);
