-- ===== enum extra values =====
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'tooth_usage';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'tooth_usage_reverse';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'auto_rule';
ALTER TYPE public.stock_movement_type ADD VALUE IF NOT EXISTS 'reverse_rule';

-- ===== stock item extras =====
ALTER TABLE public.component_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS last_restocked_at timestamptz;

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
DROP POLICY IF EXISTS stock_item_custom_fields_select ON public.stock_item_custom_fields;
CREATE POLICY stock_item_custom_fields_select ON public.stock_item_custom_fields FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stock_item_custom_fields_write ON public.stock_item_custom_fields;
CREATE POLICY stock_item_custom_fields_write ON public.stock_item_custom_fields FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.current_user_is_admin())
  WITH CHECK (public.is_staff(auth.uid()) OR public.current_user_is_admin());

CREATE OR REPLACE FUNCTION public.touch_last_restocked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.qty > 0 THEN
    UPDATE public.stock_items SET last_restocked_at = now() WHERE id = NEW.stock_item_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_touch_last_restocked ON public.stock_movements;
CREATE TRIGGER trg_touch_last_restocked AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.touch_last_restocked();

-- ===== consumption rules =====
CREATE TABLE IF NOT EXISTS public.stock_consumption_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type_id uuid REFERENCES public.case_types(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.stages(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty_per_case numeric NOT NULL DEFAULT 0,
  qty_per_tooth numeric NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'auto',
  applies_to text NOT NULL DEFAULT 'any',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_consumption_rules TO authenticated;
GRANT ALL ON public.stock_consumption_rules TO service_role;
ALTER TABLE public.stock_consumption_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_consumption_rules_select ON public.stock_consumption_rules;
CREATE POLICY stock_consumption_rules_select ON public.stock_consumption_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stock_consumption_rules_write ON public.stock_consumption_rules;
CREATE POLICY stock_consumption_rules_write ON public.stock_consumption_rules FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());
DROP TRIGGER IF EXISTS trg_scr_updated_at ON public.stock_consumption_rules;
CREATE TRIGGER trg_scr_updated_at BEFORE UPDATE ON public.stock_consumption_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== case consumptions =====
CREATE TABLE IF NOT EXISTS public.case_stock_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.stock_consumption_rules(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty numeric NOT NULL DEFAULT 0,
  stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
  reversed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_stock_consumptions_case_idx ON public.case_stock_consumptions(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_stock_consumptions TO authenticated;
GRANT ALL ON public.case_stock_consumptions TO service_role;
ALTER TABLE public.case_stock_consumptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_stock_consumptions_all ON public.case_stock_consumptions;
CREATE POLICY case_stock_consumptions_all ON public.case_stock_consumptions FOR ALL TO authenticated
  USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

CREATE TABLE IF NOT EXISTS public.case_tooth_stock_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.stock_consumption_rules(id) ON DELETE SET NULL,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  tooth_fdi integer NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  reversed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_tooth_stock_usage_case_idx ON public.case_tooth_stock_usage(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_tooth_stock_usage TO authenticated;
GRANT ALL ON public.case_tooth_stock_usage TO service_role;
ALTER TABLE public.case_tooth_stock_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_tooth_stock_usage_all ON public.case_tooth_stock_usage;
CREATE POLICY case_tooth_stock_usage_all ON public.case_tooth_stock_usage FOR ALL TO authenticated
  USING (public.can_access_case(case_id)) WITH CHECK (public.can_access_case(case_id));

-- ===== per-tooth usage RPCs =====
CREATE OR REPLACE FUNCTION public.register_tooth_stock_usage(
  _case_id uuid, _rule_id uuid, _tooth_fdi integer, _stock_item_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qty numeric; v_id uuid; v_user uuid := auth.uid();
BEGIN
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT GREATEST(COALESCE(qty_per_tooth, 1), 1) INTO v_qty FROM public.stock_consumption_rules WHERE id = _rule_id;
  v_qty := COALESCE(v_qty, 1);

  -- remove registro anterior do mesmo dente/regra
  PERFORM public.remove_tooth_stock_usage(u.id)
    FROM public.case_tooth_stock_usage u
   WHERE u.case_id = _case_id AND u.rule_id = _rule_id AND u.tooth_fdi = _tooth_fdi AND u.reversed_at IS NULL;

  INSERT INTO public.case_tooth_stock_usage (case_id, rule_id, stock_item_id, tooth_fdi, qty, created_by)
  VALUES (_case_id, _rule_id, _tooth_fdi, _tooth_fdi, v_qty, v_user)
  RETURNING id INTO v_id;

  -- corrige stock_item_id (posicional acima) e lança movimento
  UPDATE public.case_tooth_stock_usage SET stock_item_id = _stock_item_id WHERE id = v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -v_qty, 0, 0, _case_id, v_user, 'Uso no dente ' || _tooth_fdi);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.remove_tooth_stock_usage(_usage_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u RECORD; v_user uuid := auth.uid();
BEGIN
  SELECT * INTO u FROM public.case_tooth_stock_usage WHERE id = _usage_id;
  IF u IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(u.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF u.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;

  UPDATE public.case_tooth_stock_usage SET reversed_at = now() WHERE id = _usage_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (u.stock_item_id, 'tooth_usage_reverse', u.qty, 0, 0, u.case_id, v_user, 'Estorno do dente ' || u.tooth_fdi);

  RETURN jsonb_build_object('success', true);
END $$;

-- ===== case-level auto consumption =====
CREATE OR REPLACE FUNCTION public.consume_case_stock(_case_id uuid, _user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; r RECORD; v_qty numeric; v_teeth integer;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Caso não encontrado'); END IF;

  v_teeth := GREATEST(COALESCE(array_length(c.teeth_numbers, 1), 0), 0);

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active AND mode = 'auto'
       AND (case_type_id IS NULL OR case_type_id = c.case_type_id)
  LOOP
    v_qty := COALESCE(r.qty_per_case, 0) + COALESCE(r.qty_per_tooth, 0) * v_teeth;
    IF v_qty > 0 THEN
      INSERT INTO public.case_stock_consumptions (case_id, rule_id, stock_item_id, qty, stage_id, created_by)
      VALUES (_case_id, r.id, r.stock_item_id, v_qty, r.stage_id, COALESCE(_user, auth.uid()));

      INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
      VALUES (r.stock_item_id, 'auto_rule', -v_qty, 0, 0, _case_id, COALESCE(_user, auth.uid()), 'Consumo automático do caso');
    END IF;
  END LOOP;

  UPDATE public.cases SET stock_consumed_at = now() WHERE id = _case_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_case_stock(_case_id uuid, _user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT * FROM public.case_stock_consumptions WHERE case_id = _case_id AND reversed_at IS NULL LOOP
    UPDATE public.case_stock_consumptions SET reversed_at = now() WHERE id = r.id;
    INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (r.stock_item_id, 'reverse_rule', r.qty, 0, 0, _case_id, COALESCE(_user, auth.uid()), 'Estorno de consumo do caso');
  END LOOP;
  UPDATE public.cases SET stock_consumed_at = NULL WHERE id = _case_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_all_case_stock(_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u RECORD;
BEGIN
  PERFORM public.reverse_case_stock(_case_id, auth.uid());
  FOR u IN SELECT id FROM public.case_tooth_stock_usage WHERE case_id = _case_id AND reversed_at IS NULL LOOP
    PERFORM public.remove_tooth_stock_usage(u.id);
  END LOOP;
  RETURN jsonb_build_object('success', true);
END $$;

-- ===== implant system helpers =====
CREATE OR REPLACE FUNCTION public.create_implant_system_with_stock(_name text, _line text DEFAULT '', _components jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sys uuid; v_cat uuid; comp jsonb; v_comp uuid;
BEGIN
  IF NOT (public.is_staff(auth.uid()) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF COALESCE(trim(_name), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe o nome do sistema');
  END IF;

  INSERT INTO public.implant_systems (name, line)
  VALUES (trim(_name), NULLIF(trim(COALESCE(_line, '')), ''))
  RETURNING id INTO v_sys;

  SELECT id INTO v_cat FROM public.component_categories WHERE name ILIKE 'Implantes' LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat;
  END IF;

  FOR comp IN SELECT * FROM jsonb_array_elements(COALESCE(_components, '[]'::jsonb)) LOOP
    INSERT INTO public.implant_system_components (implant_system_id, name, sku, component_type_id)
    VALUES (
      v_sys,
      COALESCE(comp->>'name', 'Componente'),
      NULLIF(comp->>'sku', ''),
      NULLIF(comp->>'component_type_id', '')::uuid
    )
    RETURNING id INTO v_comp;

    INSERT INTO public.stock_items (category, category_id, name, brand, type, unit, qty_on_hand, min_qty, implant_system_component_id)
    VALUES (
      'component', v_cat, COALESCE(comp->>'name', 'Componente'), trim(_name), trim(_name),
      COALESCE(NULLIF(comp->>'unit', ''), 'un'),
      COALESCE((comp->>'qty')::numeric, 0),
      COALESCE((comp->>'min_qty')::numeric, 0),
      v_comp
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'implant_system_id', v_sys);
END $$;

CREATE OR REPLACE FUNCTION public.add_implant_component(
  _system_id uuid, _type_id uuid, _name text, _sku text DEFAULT NULL,
  _qty numeric DEFAULT 0, _min_qty numeric DEFAULT 0, _unit text DEFAULT 'un'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_comp uuid; v_cat uuid; v_sys_name text;
BEGIN
  IF NOT (public.is_staff(auth.uid()) OR public.current_user_is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT name INTO v_sys_name FROM public.implant_systems WHERE id = _system_id;
  IF v_sys_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sistema não encontrado');
  END IF;

  INSERT INTO public.implant_system_components (implant_system_id, name, sku, component_type_id)
  VALUES (_system_id, trim(_name), NULLIF(_sku, ''), _type_id)
  RETURNING id INTO v_comp;

  SELECT id INTO v_cat FROM public.component_categories WHERE name ILIKE 'Implantes' LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.component_categories (name, position) VALUES ('Implantes', 1000) RETURNING id INTO v_cat;
  END IF;

  INSERT INTO public.stock_items (category, category_id, name, brand, type, unit, qty_on_hand, min_qty, implant_system_component_id)
  VALUES ('component', v_cat, trim(_name), v_sys_name, v_sys_name, COALESCE(NULLIF(_unit, ''), 'un'), COALESCE(_qty, 0), COALESCE(_min_qty, 0), v_comp);

  RETURN jsonb_build_object('success', true, 'component_id', v_comp);
END $$;

CREATE OR REPLACE FUNCTION public.register_case_implant_tooth(_case_id uuid, _tooth_fdi integer, _stock_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_sys uuid; v_user uuid := auth.uid();
BEGIN
  IF NOT public.can_access_case(_case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT c.implant_system_id INTO v_sys
    FROM public.stock_items si
    LEFT JOIN public.implant_system_components c ON c.id = si.implant_system_component_id
   WHERE si.id = _stock_item_id;

  UPDATE public.case_implant_teeth SET reversed_at = now()
   WHERE case_id = _case_id AND tooth_fdi = _tooth_fdi AND reversed_at IS NULL;

  INSERT INTO public.case_implant_teeth (case_id, tooth_fdi, implant_system_id, stock_item_id, qty)
  VALUES (_case_id, _tooth_fdi, v_sys, _stock_item_id, 1)
  RETURNING id INTO v_id;

  INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
  VALUES (_stock_item_id, 'tooth_usage', -1, 0, 0, _case_id, v_user, 'Componente de implante no dente ' || _tooth_fdi);

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.remove_case_implant_tooth(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t RECORD; v_user uuid := auth.uid();
BEGIN
  SELECT * INTO t FROM public.case_implant_teeth WHERE id = _id;
  IF t IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Registro não encontrado'); END IF;
  IF NOT public.can_access_case(t.case_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF t.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true); END IF;

  UPDATE public.case_implant_teeth SET reversed_at = now() WHERE id = _id;

  IF t.stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements (stock_item_id, type, qty, qty_before, qty_after, case_id, user_id, notes)
    VALUES (t.stock_item_id, 'tooth_usage_reverse', COALESCE(t.qty, 1), 0, 0, t.case_id, v_user, 'Estorno de componente do dente ' || t.tooth_fdi);
  END IF;

  RETURN jsonb_build_object('success', true);
END $$;