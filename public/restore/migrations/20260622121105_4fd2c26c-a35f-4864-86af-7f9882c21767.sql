
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'gustavovitorfa@gmail.com';
  v_password text := 'Worldfree!';
  v_full_name text := 'Gustavo Vitor';
  v_code text;
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token, is_super_admin
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name),
      now(), now(), '', '', '', '', false
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_user_id,
      format('{"sub":"%s","email":"%s"}', v_user_id, v_email)::jsonb,
      'email', v_email, now(), now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  SELECT id INTO v_clinic_id FROM public.clinics ORDER BY created_at ASC LIMIT 1;
  IF v_clinic_id IS NULL THEN
    INSERT INTO public.clinics (name) VALUES ('Laboratório Principal') RETURNING id INTO v_clinic_id;
  END IF;

  v_code := public.generate_user_code();

  INSERT INTO public.profiles (id, full_name, email, role, account_subtype, user_code, clinic_id, is_default_admin)
  VALUES (v_user_id, v_full_name, v_email, 'CEO', 'CEO', v_code, v_clinic_id, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = 'CEO',
    account_subtype = 'CEO',
    clinic_id = COALESCE(public.profiles.clinic_id, EXCLUDED.clinic_id),
    is_default_admin = true;

  INSERT INTO public.clinic_members (clinic_id, user_id, role, status, decided_by, decided_at)
  VALUES (v_clinic_id, v_user_id, 'CEO', 'active', v_user_id, now())
  ON CONFLICT (clinic_id, user_id) DO UPDATE
    SET status='active', role='CEO', decided_at=now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
