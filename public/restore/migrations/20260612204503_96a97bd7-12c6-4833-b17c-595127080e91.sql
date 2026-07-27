
-- Backfill missing profiles from auth.users
INSERT INTO public.profiles (id, full_name, email, role)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name', u.email),
       u.email,
       COALESCE(u.raw_user_meta_data->>'role', 'USER')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Promote gustavovitorfa@gmail.com to master CEO
UPDATE public.profiles
SET role = 'CEO', is_default_admin = true
WHERE email = 'gustavovitorfa@gmail.com';

-- Ensure admin role in user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE p.email = 'gustavovitorfa@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
