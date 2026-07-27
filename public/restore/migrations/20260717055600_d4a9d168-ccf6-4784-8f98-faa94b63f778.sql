
CREATE TABLE IF NOT EXISTS public.beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.beta_testers TO authenticated;
GRANT ALL ON public.beta_testers TO service_role;

ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view beta testers"
  ON public.beta_testers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage beta testers"
  ON public.beta_testers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_beta_tester(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.beta_testers bt
    JOIN auth.users u ON lower(u.email) = lower(bt.email)
    WHERE u.id = _user_id AND bt.active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_beta_tester(uuid) TO authenticated;

INSERT INTO public.beta_testers (email, notes)
VALUES ('gustavovitorfa@gmail.com', 'Primeiro testador beta — acesso completo')
ON CONFLICT (email) DO UPDATE SET active = true;
