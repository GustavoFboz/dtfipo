
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'stock_items','stock_movements','case_types','burrs','user_roles','clinic_members',
    'component_categories','components','holders','implant_systems','tooth_colors',
    'case_components','case_stock_consumptions','workflow_settings','profiles',
    'case_stages','stage_assignments','phase_assignments','stage_return_reasons',
    'stock_consumption_rules','stock_item_custom_fields','user_stock_access',
    'cadistas','scan_jigs','clinics','burr_usages'
  ]) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
  FOR t IN SELECT unnest(ARRAY[
    'cases','patients','doctors','case_activity','case_attachments',
    'case_tooth_stock_usage','case_types_link','model_annotations','notifications','phases','stages'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
