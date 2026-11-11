-- Preço do catálogo para NOVOS checkouts. Assinaturas Asaas já criadas
-- mantêm o valor do seu contrato; alterações no provedor exigem ação separada.
update public.billing_plans set monthly_price_cents = 500
where code = 'company_initial' and account_scope = 'company'
  and monthly_price_cents = 100;
do $$ begin
  if (select monthly_price_cents from public.billing_plans where code = 'company_initial') <> 500 then
    raise exception 'BILLING_PLAN_PRICE_EXPECTED_100_CENTS';
  end if;
end $$;
notify pgrst, 'reload schema';
