-- Read-only boundary verification, safe on both restored and live databases.
begin transaction read only;
do $$
declare v_name text; v_oid oid;
begin
  foreach v_name in array array[
    'billing_apply_asaas_payment_lifecycle(uuid,uuid,text,text,text,integer,date,text)',
    'billing_apply_asaas_subscription_lifecycle(uuid,uuid,text,text,text,integer,text,text)',
    'billing_list_asaas_expired_grace(text,integer)',
    'billing_suspend_asaas_expired_grace(uuid,text,text,text,text,text)'
  ] loop
    v_oid := to_regprocedure('public.' || v_name);
    if v_oid is null then raise exception 'Missing Stage 05 function: %', v_name; end if;
    if has_function_privilege('anon', v_oid, 'execute')
      or has_function_privilege('authenticated', v_oid, 'execute')
      or not has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Unsafe Stage 05 grant: %', v_name;
    end if;
  end loop;
end $$;
select 'passed' as stage_05_restore_contract;
rollback;
