-- Grant full access to service_role to ensure background tasks work
GRANT ALL ON public.profiles TO service_role;

-- Update INSERT policy to allow admins to insert profiles for others
DROP POLICY IF EXISTS "profiles_self_insert" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  (id = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (role = 'CEO' OR role = 'DR')
  ))
);

-- Ensure authenticated users have insert permissions on the table
GRANT INSERT ON public.profiles TO authenticated;