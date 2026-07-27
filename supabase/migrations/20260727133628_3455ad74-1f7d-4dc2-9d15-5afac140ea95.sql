UPDATE auth.users
SET email_confirmed_at = now(),
    raw_user_meta_data = raw_user_meta_data || jsonb_build_object('email_verified', true)
WHERE email = 'gustavovitorfa@gmail.com';