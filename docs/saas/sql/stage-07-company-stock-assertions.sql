-- Read-only. Reusable on the restored schema and the live backend.
BEGIN READ ONLY;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['component_categories','components','implant_systems','implant_component_types',
 'implant_system_components','scan_jigs','stock_items','stock_item_custom_fields','stock_movements',
 'stock_consumption_rules','case_stock_consumptions','case_tooth_stock_usage','case_implant_teeth',
 'holders','burrs','burr_usages','resin_pots','resin_weighings','user_stock_access','cadistas','doctors','proteticos'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='saas_company_boundary' AND permissive='RESTRICTIVE' AND cmd='ALL')
   OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='clinic_id')
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='aaa_saas_company_guard' AND tgenabled='O') THEN
   RAISE EXCEPTION 'COMPANY_OWNERSHIP_GUARD_MISSING: %',t;
  END IF;
 END LOOP;
 IF has_function_privilege('anon','public.saas_owned_parent_company(text,uuid)','execute')
  OR has_function_privilege('authenticated','public.saas_owned_parent_company(text,uuid)','execute')
  OR has_function_privilege('anon','public.register_case_implant_tooth(uuid,integer,uuid)','execute') THEN
  RAISE EXCEPTION 'COMPANY_INTERNAL_HELPER_EXPOSED';
 END IF;
 IF position('saas_require_stock_case_pair' in pg_get_functiondef('public.register_case_implant_tooth(uuid,integer,uuid)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'RESTORE_OVERWROTE_STOCK_RPC_GUARD';
 END IF;
 IF EXISTS(SELECT 1 FROM public.stock_items s JOIN public.component_categories c ON c.id=s.category_id WHERE s.clinic_id IS DISTINCT FROM c.clinic_id)
  OR EXISTS(SELECT 1 FROM public.stock_movements m JOIN public.stock_items s ON s.id=m.stock_item_id WHERE m.clinic_id IS DISTINCT FROM s.clinic_id) THEN
  RAISE EXCEPTION 'EXISTING_STOCK_COMPANY_MISMATCH';
 END IF;
END $$;
SELECT 'passed' AS company_stock_schema;
ROLLBACK;
