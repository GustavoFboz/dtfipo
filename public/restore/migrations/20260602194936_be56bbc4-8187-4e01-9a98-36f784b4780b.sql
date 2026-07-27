-- Stock control (N8)
CREATE TYPE public.stock_category AS ENUM ('zirconia','dissilicato','component','hygiene');
CREATE TYPE public.stock_movement_type AS ENUM ('in','out','auto_case','reverse_case','adjust');

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.stock_category NOT NULL,
  name text NOT NULL,
  brand text,
  color text,
  block_type text,
  unit text NOT NULL DEFAULT 'un',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  min_qty numeric NOT NULL DEFAULT 0,
  component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_items_category ON public.stock_items(category);
CREATE INDEX idx_stock_items_component ON public.stock_items(component_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_items_staff_select ON public.stock_items FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_items_staff_insert ON public.stock_items FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_staff_update ON public.stock_items FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));
CREATE POLICY stock_items_admin_delete ON public.stock_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_stock_items_updated_at BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  qty numeric NOT NULL,
  qty_before numeric NOT NULL,
  qty_after numeric NOT NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_item ON public.stock_movements(stock_item_id, created_at DESC);
CREATE INDEX idx_stock_movements_case ON public.stock_movements(case_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at DESC);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_staff_select ON public.stock_movements FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND NOT is_cadista(auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY stock_movements_staff_insert ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','recepcionista','protetico']::app_role[]));

-- Apply movement to stock_items.qty_on_hand atomically
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_qty numeric;
BEGIN
  SELECT qty_on_hand INTO current_qty FROM public.stock_items WHERE id = NEW.stock_item_id FOR UPDATE;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'Stock item % not found', NEW.stock_item_id; END IF;
  NEW.qty_before := current_qty;
  NEW.qty_after := current_qty + NEW.qty;
  UPDATE public.stock_items SET qty_on_hand = NEW.qty_after, updated_at = now()
    WHERE id = NEW.stock_item_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_stock_movement BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Add lot selection on cases
ALTER TABLE public.cases
  ADD COLUMN zirconia_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  ADD COLUMN dissilicato_stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  ADD COLUMN stock_consumed_at timestamptz;

-- Consume stock for a case (called when finishing)
CREATE OR REPLACE FUNCTION public.consume_case_stock(_case_id uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c RECORD;
  comp RECORD;
  zcount int;
  dcount int;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RAISE EXCEPTION 'Case % not found', _case_id; END IF;
  IF c.stock_consumed_at IS NOT NULL THEN RETURN; END IF;

  zcount := COALESCE(array_length(c.teeth_zirconia,1),0);
  dcount := COALESCE(array_length(c.teeth_dissilicato,1),0);

  IF zcount > 0 AND c.zirconia_stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (c.zirconia_stock_item_id,'auto_case',-zcount,0,0,_case_id,_user,'Consumo automático (zircônia)');
  END IF;
  IF dcount > 0 AND c.dissilicato_stock_item_id IS NOT NULL THEN
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (c.dissilicato_stock_item_id,'auto_case',-dcount,0,0,_case_id,_user,'Consumo automático (dissilicato)');
  END IF;

  FOR comp IN
    SELECT cc.qty, si.id AS stock_item_id
    FROM public.case_components cc
    JOIN public.stock_items si ON si.component_id = cc.component_id
    WHERE cc.case_id = _case_id
  LOOP
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (comp.stock_item_id,'auto_case',-comp.qty,0,0,_case_id,_user,'Consumo automático (componente)');
  END LOOP;

  UPDATE public.cases SET stock_consumed_at = now() WHERE id = _case_id;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_case_stock(_case_id uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT * FROM public.stock_movements
    WHERE case_id = _case_id AND type = 'auto_case'
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements m2 WHERE m2.case_id=_case_id AND m2.type='reverse_case' AND m2.stock_item_id=stock_movements.stock_item_id AND m2.qty = -stock_movements.qty)
  LOOP
    INSERT INTO public.stock_movements(stock_item_id,type,qty,qty_before,qty_after,case_id,user_id,notes)
    VALUES (m.stock_item_id,'reverse_case',-m.qty,0,0,_case_id,_user,'Reabertura do caso');
  END LOOP;
  UPDATE public.cases SET stock_consumed_at = NULL WHERE id = _case_id;
END $$;