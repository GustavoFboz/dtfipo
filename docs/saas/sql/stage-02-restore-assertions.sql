\set ON_ERROR_STOP on

begin transaction read only;

do $$
begin
  if to_regclass('public.billing_provider_operations') is null then
    raise exception 'Stage 02: billing_provider_operations ausente';
  end if;

  if to_regprocedure('public.billing_claim_provider_operation(text,text,text,text,text,integer)') is null
     or to_regprocedure('public.billing_finish_provider_operation(uuid,uuid,text,text,text)') is null
     or to_regprocedure('public.billing_get_asaas_provisioning_context(uuid,uuid,text)') is null
     or to_regprocedure('public.billing_bind_asaas_subscription(uuid,text,text,text)') is null then
    raise exception 'Stage 02: RPC privada ausente';
  end if;

  if has_table_privilege('anon', 'public.billing_provider_operations', 'select')
     or has_table_privilege('authenticated', 'public.billing_provider_operations', 'select')
     or not has_table_privilege('service_role', 'public.billing_provider_operations', 'select') then
    raise exception 'Stage 02: fronteira da tabela de operações inválida';
  end if;

  if has_function_privilege(
       'anon',
       'public.billing_claim_provider_operation(text,text,text,text,text,integer)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.billing_claim_provider_operation(text,text,text,text,text,integer)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.billing_claim_provider_operation(text,text,text,text,text,integer)',
       'execute'
     ) then
    raise exception 'Stage 02: claim financeiro não está restrito ao backend';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.billing_get_asaas_provisioning_context(uuid,uuid,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.billing_bind_asaas_subscription(uuid,text,text,text)',
       'execute'
     ) then
    raise exception 'Stage 02: contexto fiscal ou vínculo Asaas exposto ao cliente';
  end if;
end;
$$;

select jsonb_build_object(
  'stage', '02',
  'result', 'passed',
  'operations_rls', c.relrowsecurity,
  'operation_columns', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'billing_provider_operations'
  ),
  'authenticated_can_claim', has_function_privilege(
    'authenticated',
    'public.billing_claim_provider_operation(text,text,text,text,text,integer)',
    'execute'
  ),
  'service_role_can_claim', has_function_privilege(
    'service_role',
    'public.billing_claim_provider_operation(text,text,text,text,text,integer)',
    'execute'
  )
) as stage_02_restore_report
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'billing_provider_operations';

rollback;

