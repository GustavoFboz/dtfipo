-- Synthetic PostgreSQL 17 fixture for CI only. No Supabase/live provider/data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text NOT NULL, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE public.clinics(id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text);
CREATE TABLE public.checkout_intents(id uuid PRIMARY KEY, user_id uuid NOT NULL, clinic_id uuid REFERENCES public.clinics(id), status text NOT NULL DEFAULT 'pending');
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $auth_role$
  SELECT current_setting('request.jwt.claim.role',true)
$auth_role$;
INSERT INTO auth.users VALUES
('70000000-0000-4000-8000-000000000001','allowed@example.invalid',now()),
('70000000-0000-4000-8000-000000000002','uninvited@example.invalid',now()),
('70000000-0000-4000-8000-000000000003','notverified@example.invalid',null),
('70000000-0000-4000-8000-000000000004','expired@example.invalid',now());
