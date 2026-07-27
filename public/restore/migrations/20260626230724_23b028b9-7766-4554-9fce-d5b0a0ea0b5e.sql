
CREATE OR REPLACE FUNCTION public.eligible_teeth_for_rule(_case_id uuid, _applies_to text)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c RECORD; v int[];
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c IS NULL THEN RETURN ARRAY[]::int[]; END IF;
  IF _applies_to = 'implant_only' THEN
    v := COALESCE(c.implant_teeth, ARRAY[]::int[]);
  ELSE
    v := COALESCE(c.teeth_numbers, ARRAY[]::int[]);
    IF array_length(v,1) IS NULL THEN
      v := COALESCE(c.teeth_zirconia, ARRAY[]::int[]) || COALESCE(c.teeth_dissilicato, ARRAY[]::int[]) || COALESCE(c.implant_teeth, ARRAY[]::int[]);
    END IF;
  END IF;
  -- dedupe
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), ARRAY[]::int[]) INTO v FROM unnest(v) AS t;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_tooth_rules_for_stage(_case_id uuid, _stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD; v_case_type uuid; v_eligible int[]; v_covered int; v_total int;
BEGIN
  IF _stage_id IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;
  SELECT case_type_id INTO v_case_type FROM public.case_types_link WHERE case_id = _case_id LIMIT 1;

  FOR r IN
    SELECT * FROM public.stock_consumption_rules
     WHERE active = true AND stage_id = _stage_id AND mode = 'per_tooth_selection' AND required = true
       AND (case_type_id IS NULL OR case_type_id = v_case_type)
  LOOP
    v_eligible := public.eligible_teeth_for_rule(_case_id, r.applies_to);
    v_total := COALESCE(array_length(v_eligible,1),0);
    IF v_total > 0 THEN
      SELECT count(DISTINCT tooth_fdi) INTO v_covered
        FROM public.case_tooth_stock_usage
        WHERE case_id=_case_id AND rule_id=r.id AND reversed_at IS NULL AND tooth_fdi = ANY(v_eligible);
      IF v_covered < v_total THEN
        RETURN jsonb_build_object('ok', false, 'error',
          'Registre o item para todos os dentes elegíveis antes de avançar (faltam ' ||
          (v_total - v_covered)::text || ').');
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $function$;
