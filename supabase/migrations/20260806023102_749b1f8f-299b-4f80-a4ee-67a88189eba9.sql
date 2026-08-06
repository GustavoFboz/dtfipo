-- ============ n4: checklists ============
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  items text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_templates_all" ON public.checklist_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.case_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_checklists TO authenticated;
GRANT ALL ON public.case_checklists TO service_role;
ALTER TABLE public.case_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_checklists_all" ON public.case_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.case_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.case_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  checked_by uuid,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_checklist_items_checklist ON public.case_checklist_items(checklist_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_checklist_items TO authenticated;
GRANT ALL ON public.case_checklist_items TO service_role;
ALTER TABLE public.case_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_checklist_items_all" ON public.case_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ n6: resinas por peso ============
CREATE TABLE IF NOT EXISTS public.resin_pots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text,
  type text,
  color text,
  expires_on date,
  tare_g numeric NOT NULL DEFAULT 0,
  declared_net_g numeric NOT NULL DEFAULT 0,
  current_net_g numeric NOT NULL DEFAULT 0,
  min_net_g numeric NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resin_pots TO authenticated;
GRANT ALL ON public.resin_pots TO service_role;
ALTER TABLE public.resin_pots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resin_pots_all" ON public.resin_pots FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_resin_pots_updated ON public.resin_pots;
CREATE TRIGGER trg_resin_pots_updated BEFORE UPDATE ON public.resin_pots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.resin_weighings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id uuid NOT NULL REFERENCES public.resin_pots(id) ON DELETE CASCADE,
  gross_g numeric NOT NULL,
  net_g numeric NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resin_weighings_pot ON public.resin_weighings(pot_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resin_weighings TO authenticated;
GRANT ALL ON public.resin_weighings TO service_role;
ALTER TABLE public.resin_weighings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resin_weighings_all" ON public.resin_weighings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.apply_resin_weighing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tare numeric;
BEGIN
  SELECT tare_g INTO v_tare FROM public.resin_pots WHERE id = NEW.pot_id;
  NEW.net_g := GREATEST(COALESCE(NEW.gross_g,0) - COALESCE(v_tare,0), 0);
  UPDATE public.resin_pots SET current_net_g = NEW.net_g, updated_at = now() WHERE id = NEW.pot_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apply_resin_weighing ON public.resin_weighings;
CREATE TRIGGER trg_apply_resin_weighing BEFORE INSERT ON public.resin_weighings FOR EACH ROW EXECUTE FUNCTION public.apply_resin_weighing();

INSERT INTO public.component_categories (name, position)
SELECT 'Resinas', 1100 WHERE NOT EXISTS (SELECT 1 FROM public.component_categories WHERE name ILIKE 'Resinas');

-- ============ n7: consumo por implante ============
ALTER TABLE public.stock_consumption_rules ADD COLUMN IF NOT EXISTS qty_per_implant numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.consume_case_stock(_case_id uuid, _user uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c RECORD; r RECORD; v_qty numeric; v_teeth integer; v_implants integer;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  v_teeth := GREATEST(COALESCE(array_length(c.teeth_numbers, 1), 0), 0);
  v_implants := GREATEST(COALESCE(array_length(c.implant_teeth, 1), 0), 0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active AND mode = 'auto'
       AND (case_type_id IS NULL OR case_type_id = c.case_type_id)
  LOOP
    v_qty := COALESCE(r.qty_per_case, 0)
           + COALESCE(r.qty_per_tooth, 0) * v_teeth
           + COALESCE(r.qty_per_implant, 0) * v_implants;
    IF v_qty > 0 THEN
      INSERT INTO public.case_stock_consumptions (case_id, rule_id, stock_item_id, qty, stage_id, created_by)
      VALUES (_case_id, r.id, r.stock_item_id, v_qty, r.stage_id, COALESCE(_user, auth.uid()));

      INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
      VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, COALESCE(_user, auth.uid()), 'Consumo automático do caso');
    END IF;
  END LOOP;

  UPDATE public.cases SET stock_consumed_at = now() WHERE id = _case_id;
  RETURN jsonb_build_object('success', true);
END $function$;