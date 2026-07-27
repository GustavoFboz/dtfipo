
-- Recreate the missing trigger that creates a public.profiles row for every new auth user.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any pre-existing users that were signed up while the trigger was missing.
INSERT INTO public.profiles (id, full_name, email, role, user_code, clinic_id)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.email,
       'USER',
       public.generate_user_code(),
       NULL
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
