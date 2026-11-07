-- DISPOSABLE CI ONLY. Concatenate before the exact ownership migration.
BEGIN;
INSERT INTO public.clinics(id,name,billing_exempt) VALUES
 ('ea00a3cd-6816-42f4-845d-56468c77414e','Disposable confirmed legacy company',true)
 ON CONFLICT(id) DO UPDATE SET billing_exempt=true;
ALTER TABLE public.component_categories DISABLE TRIGGER USER;
ALTER TABLE public.stock_items DISABLE TRIGGER USER;
ALTER TABLE public.stock_movements DISABLE TRIGGER USER;
ALTER TABLE public.patients DISABLE TRIGGER USER;
INSERT INTO public.component_categories(id,name,clinic_id) VALUES ('72400000-0000-4000-8000-000000000001','Legacy backfill fixture',NULL);
INSERT INTO public.stock_items(id,category,name,qty_on_hand,category_id,clinic_id,created_at,updated_at) VALUES
 ('72400000-0000-4000-8000-000000000002','component','Legacy stock',7,'72400000-0000-4000-8000-000000000001',NULL,'2001-01-01','2002-02-02');
INSERT INTO public.stock_movements(id,stock_item_id,type,qty,qty_before,qty_after,clinic_id,created_at) VALUES
 ('72400000-0000-4000-8000-000000000003','72400000-0000-4000-8000-000000000002','in',5,2,7,NULL,'2002-02-02');
INSERT INTO public.patients(id,name,clinic_id) VALUES ('72400000-0000-4000-8000-000000000004','Unknown provenance fixture',NULL);
ALTER TABLE public.component_categories ENABLE TRIGGER USER;
ALTER TABLE public.stock_items ENABLE TRIGGER USER;
ALTER TABLE public.stock_movements ENABLE TRIGGER USER;
ALTER TABLE public.patients ENABLE TRIGGER USER;
CREATE TEMP TABLE ownership_history_before AS
 SELECT 'item' AS source,to_jsonb(s)-'clinic_id' AS data FROM public.stock_items s WHERE id='72400000-0000-4000-8000-000000000002'
 UNION ALL SELECT 'movement',to_jsonb(m)-'clinic_id' FROM public.stock_movements m WHERE id='72400000-0000-4000-8000-000000000003';
CREATE TEMP TABLE ownership_triggers_before AS SELECT tgrelid,tgname,tgenabled FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('public.stock_items'::regclass,'public.stock_movements'::regclass);
