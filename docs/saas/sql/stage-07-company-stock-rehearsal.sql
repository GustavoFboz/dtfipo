-- DISPOSABLE CI DATABASE ONLY. Synthetic SQL identities; never real MFA proof.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at) VALUES
 ('72300000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stock-a@example.invalid','',now(),now()),
 ('72300000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stock-b@example.invalid','',now(),now()),
 ('72300000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stock-user@example.invalid','',now(),now());
INSERT INTO public.clinics(id,name,owner_id,billing_exempt) VALUES
 ('72300000-0000-4000-8000-000000000010','Stock A','72300000-0000-4000-8000-000000000001',false),
 ('72300000-0000-4000-8000-000000000020','Stock B','72300000-0000-4000-8000-000000000002',false);
INSERT INTO public.clinic_members(clinic_id,user_id,role,status) VALUES
 ('72300000-0000-4000-8000-000000000010','72300000-0000-4000-8000-000000000001','CEO','active'),
 ('72300000-0000-4000-8000-000000000020','72300000-0000-4000-8000-000000000002','CEO','active'),
 ('72300000-0000-4000-8000-000000000010','72300000-0000-4000-8000-000000000003','USER','active');
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_profile_privilege_escalation;
UPDATE public.profiles SET clinic_id=CASE WHEN id='72300000-0000-4000-8000-000000000002' THEN '72300000-0000-4000-8000-000000000020'::uuid ELSE '72300000-0000-4000-8000-000000000010'::uuid END,
 role=CASE WHEN id='72300000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,
 account_subtype=CASE WHEN id='72300000-0000-4000-8000-000000000003' THEN 'USER' ELSE 'CEO' END,is_default_admin=false
 WHERE id IN ('72300000-0000-4000-8000-000000000001','72300000-0000-4000-8000-000000000002','72300000-0000-4000-8000-000000000003');
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_profile_privilege_escalation;
INSERT INTO public.user_roles(user_id,role) VALUES ('72300000-0000-4000-8000-000000000002','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.account_subscriptions(scope_type,clinic_id,plan_code,status,billing_day,current_period_start,current_period_end,billing_provider,provider_environment)
VALUES ('company','72300000-0000-4000-8000-000000000010','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox'),
 ('company','72300000-0000-4000-8000-000000000020','company_initial','active',22,now(),now()+interval '1 month','asaas','sandbox');
INSERT INTO public.component_categories(id,name,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000011','Same category name','72300000-0000-4000-8000-000000000010'),
 ('72300000-0000-4000-8000-000000000021','Same category name','72300000-0000-4000-8000-000000000020');
INSERT INTO public.implant_systems(id,name,line,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000031','Implant A','QA','72300000-0000-4000-8000-000000000010'),
 ('72300000-0000-4000-8000-000000000041','Implant B','QA','72300000-0000-4000-8000-000000000020');
INSERT INTO public.implant_component_types(id,name,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000033','Type A','72300000-0000-4000-8000-000000000010'),
 ('72300000-0000-4000-8000-000000000043','Type B','72300000-0000-4000-8000-000000000020');
INSERT INTO public.implant_system_components(id,implant_system_id,component_type_id,name,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000032','72300000-0000-4000-8000-000000000031','72300000-0000-4000-8000-000000000033','Component A','72300000-0000-4000-8000-000000000010'),
 ('72300000-0000-4000-8000-000000000042','72300000-0000-4000-8000-000000000041','72300000-0000-4000-8000-000000000043','Component B','72300000-0000-4000-8000-000000000020');
INSERT INTO public.stock_items(id,category,name,qty_on_hand,category_id,implant_system_component_id,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000012','component','A',10,'72300000-0000-4000-8000-000000000011','72300000-0000-4000-8000-000000000032','72300000-0000-4000-8000-000000000010'),
 ('72300000-0000-4000-8000-000000000022','component','B',10,'72300000-0000-4000-8000-000000000021','72300000-0000-4000-8000-000000000042','72300000-0000-4000-8000-000000000020');
INSERT INTO public.stock_item_custom_fields(stock_item_id,key,value,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000022','private','fixture','72300000-0000-4000-8000-000000000020');
INSERT INTO public.patients(id,name,clinic_id) VALUES
 ('72300000-0000-4000-8000-000000000013','Disposable A','72300000-0000-4000-8000-000000000010'),
 ('72300000-0000-4000-8000-000000000023','Disposable B','72300000-0000-4000-8000-000000000020');
INSERT INTO public.cases(id,patient_id,requested_by,status,delivery_date) VALUES
 ('72300000-0000-4000-8000-000000000014','72300000-0000-4000-8000-000000000013','72300000-0000-4000-8000-000000000003','pendente',current_date+7),
 ('72300000-0000-4000-8000-000000000024','72300000-0000-4000-8000-000000000023','72300000-0000-4000-8000-000000000002','pendente',current_date+7);

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72300000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72300000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n bigint; refused boolean; r json; BEGIN
 IF NOT public.saas_company_can_manage_stock('72300000-0000-4000-8000-000000000010') THEN RAISE EXCEPTION 'MANAGER_SETUP_INVALID'; END IF;
 IF (SELECT count(*) FROM public.stock_items WHERE id='72300000-0000-4000-8000-000000000012')<>1
  OR EXISTS(SELECT 1 FROM public.stock_items WHERE id='72300000-0000-4000-8000-000000000022')
  OR EXISTS(SELECT 1 FROM public.stock_item_custom_fields WHERE stock_item_id='72300000-0000-4000-8000-000000000022')
  OR EXISTS(SELECT 1 FROM public.profiles WHERE id='72300000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'FOREIGN_COMPANY_DATA_EXPOSED'; END IF;
 INSERT INTO public.stock_items(category,name) VALUES ('component','Automatically scoped');
 IF EXISTS(SELECT 1 FROM public.stock_items WHERE name='Automatically scoped' AND clinic_id IS DISTINCT FROM '72300000-0000-4000-8000-000000000010'::uuid) THEN RAISE EXCEPTION 'NEW_STOCK_NOT_SCOPED'; END IF;
 UPDATE public.stock_items SET name='Allowed own edit' WHERE id='72300000-0000-4000-8000-000000000012';
 UPDATE public.stock_items SET qty_on_hand=100 WHERE id='72300000-0000-4000-8000-000000000022'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FOREIGN_STOCK_CHANGED'; END IF;
 DELETE FROM public.stock_items WHERE id='72300000-0000-4000-8000-000000000022'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FOREIGN_STOCK_DELETED'; END IF;
 refused:=false; BEGIN UPDATE public.stock_items SET clinic_id='72300000-0000-4000-8000-000000000020' WHERE id='72300000-0000-4000-8000-000000000012'; EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'STOCK_COMPANY_REASSIGNED'; END IF;
 refused:=false; BEGIN UPDATE public.stock_items SET category_id='72300000-0000-4000-8000-000000000021' WHERE id='72300000-0000-4000-8000-000000000012'; EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'CROSS_COMPANY_CATEGORY_ACCEPTED'; END IF;
 refused:=false; BEGIN INSERT INTO public.stock_items(category,name,clinic_id) VALUES ('component','Spoof','72300000-0000-4000-8000-000000000020'); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'SPOOFED_COMPANY_INSERTED'; END IF;
 r:=public.update_team_member('72300000-0000-4000-8000-000000000002','Not applied','unchanged@example.invalid',NULL,'USER','{}'::uuid[],'{}'::text[]);
 IF COALESCE((r->>'success')::boolean,true) THEN RAISE EXCEPTION 'FOREIGN_TEAM_UPDATED'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72300000-0000-4000-8000-000000000003"}',true);
SELECT set_config('request.jwt.claim.sub','72300000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE refused boolean; result jsonb; usage uuid; BEGIN
 IF public.saas_company_can_manage_stock('72300000-0000-4000-8000-000000000010') OR NOT public.can_access_case('72300000-0000-4000-8000-000000000014') THEN RAISE EXCEPTION 'USER_SETUP_INVALID'; END IF;
 refused:=false; BEGIN PERFORM public.register_case_implant_tooth('72300000-0000-4000-8000-000000000014',11,'72300000-0000-4000-8000-000000000022'); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
 IF NOT refused THEN RAISE EXCEPTION 'DEFINER_CONSUMED_FOREIGN_STOCK'; END IF;
 result:=public.register_case_implant_tooth('72300000-0000-4000-8000-000000000014',11,'72300000-0000-4000-8000-000000000012');
 IF result->>'success'<>'true' OR (SELECT qty_on_hand FROM public.stock_items WHERE id='72300000-0000-4000-8000-000000000012')<>9 THEN RAISE EXCEPTION 'OWN_CASE_CONSUMPTION_FAILED'; END IF;
 usage:=(result->>'id')::uuid;
 result:=public.remove_case_implant_tooth(usage); result:=public.remove_case_implant_tooth(usage);
 IF (SELECT qty_on_hand FROM public.stock_items WHERE id='72300000-0000-4000-8000-000000000012')<>10 THEN RAISE EXCEPTION 'REVERSAL_NOT_IDEMPOTENT'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 IF (SELECT qty_on_hand FROM public.stock_items WHERE id='72300000-0000-4000-8000-000000000022')<>10
  OR (SELECT role FROM public.profiles WHERE id='72300000-0000-4000-8000-000000000002')<>'CEO' THEN RAISE EXCEPTION 'FOREIGN_STATE_NOT_PRESERVED'; END IF;
END $$;
UPDATE public.account_subscriptions SET status='suspended' WHERE clinic_id='72300000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72300000-0000-4000-8000-000000000001"}',true);
SELECT set_config('request.jwt.claim.sub','72300000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.stock_items WHERE clinic_id='72300000-0000-4000-8000-000000000010') THEN RAISE EXCEPTION 'SUSPENDED_STOCK_EXPOSED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'BILLING_IDENTITY_HIDDEN'; END IF;
END $$;
RESET ROLE;
SELECT 'passed' AS company_stock_isolation;
ROLLBACK;
