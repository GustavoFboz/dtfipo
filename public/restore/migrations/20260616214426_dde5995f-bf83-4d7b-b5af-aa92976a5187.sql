
-- Attach trigger so every new auth user gets a profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles for existing users
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
