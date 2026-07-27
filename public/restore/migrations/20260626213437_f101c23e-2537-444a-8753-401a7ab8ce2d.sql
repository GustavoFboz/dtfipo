
CREATE TABLE IF NOT EXISTS public.user_stock_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.component_categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (user_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stock_access TO authenticated;
GRANT ALL ON public.user_stock_access TO service_role;

ALTER TABLE public.user_stock_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage stock access"
  ON public.user_stock_access FOR ALL
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Users can view own stock access"
  ON public.user_stock_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_stock_access_user ON public.user_stock_access(user_id);
