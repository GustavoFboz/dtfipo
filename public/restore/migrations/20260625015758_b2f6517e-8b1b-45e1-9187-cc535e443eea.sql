
-- 1) component_categories used as stock categories
ALTER TABLE public.component_categories
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 100;

-- 2) Extend stock_items
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.component_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS last_restocked_at timestamptz,
  ALTER COLUMN category DROP NOT NULL;

-- 3) Custom fields
CREATE TABLE IF NOT EXISTS public.stock_item_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_item_custom_fields_item_idx ON public.stock_item_custom_fields(stock_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_custom_fields TO authenticated;
GRANT ALL ON public.stock_item_custom_fields TO service_role;

ALTER TABLE public.stock_item_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_item_custom_fields_select ON public.stock_item_custom_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY stock_item_custom_fields_write ON public.stock_item_custom_fields
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4) Seed/ensure default categories and migrate existing items
INSERT INTO public.component_categories (name, position)
VALUES ('Zircônia', 10), ('Dissilicato', 20), ('Componentes', 30), ('Higiene', 40)
ON CONFLICT DO NOTHING;

UPDATE public.stock_items si
   SET category_id = cc.id
  FROM public.component_categories cc
 WHERE si.category_id IS NULL
   AND (
     (si.category::text = 'zirconia'    AND cc.name = 'Zircônia') OR
     (si.category::text = 'dissilicato' AND cc.name = 'Dissilicato') OR
     (si.category::text = 'component'   AND cc.name = 'Componentes') OR
     (si.category::text = 'hygiene'     AND cc.name = 'Higiene')
   );

-- 5) Trigger to maintain last_restocked_at on positive stock movements
CREATE OR REPLACE FUNCTION public.touch_last_restocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.qty > 0 THEN
    UPDATE public.stock_items SET last_restocked_at = now() WHERE id = NEW.stock_item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_last_restocked ON public.stock_movements;
CREATE TRIGGER trg_touch_last_restocked
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.touch_last_restocked();
