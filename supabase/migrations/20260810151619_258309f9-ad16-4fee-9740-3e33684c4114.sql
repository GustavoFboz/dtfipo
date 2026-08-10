-- Synchronize all CEO and DR users to the doctors table
INSERT INTO public.doctors (name, user_id)
SELECT full_name, id 
FROM public.profiles 
WHERE role IN ('CEO', 'DR')
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

-- Ensure cadistas and proteticos are also synced for existing users
INSERT INTO public.cadistas (name, user_id)
SELECT full_name, id 
FROM public.profiles 
WHERE role = 'CADISTA'
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.proteticos (name, user_id)
SELECT full_name, id 
FROM public.profiles 
WHERE role = 'PROTETICO'
ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name;
