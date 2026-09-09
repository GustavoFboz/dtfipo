-- DentalFlow 0.3.2 — company invite onboarding, one-company professional accounts,
-- billing QA enrollment, and server-side entitlement enforcement.

-- Neutralize the legacy two-argument checkout overload so every checkout follows
-- the company-only implementation created in the previous migration.
drop function if exists public.create_checkout_intent(text,uuid);
create function public.create_checkout_intent(p_plan_code text, p_clinic_id uuid)
returns jsonb
language sql security definer set search_path=public as $$
  select public.create_checkout_intent(p_plan_code,p_clinic_id,null::text[])
$$;
grant execute on function public.create_checkout_intent(text,uuid) to authenticated;

-- A professional code is validated before auth signup so an invalid/expired code
-- cannot leave behind a login account with no company.
create or replace function public.validate_company_invite_code(p_invite_code text)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  c public.clinics%rowtype;
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  member_count integer;
begin
  if length(trim(coalesce(p_invite_code,'')))<4 then
    return jsonb_build_object('valid',false,'reason','invalid_code');
  end if;

  select * into c from public.clinics
  where upper(trim(invite_code))=upper(trim(p_invite_code)) limit 1;
  if c.id is null then return jsonb_build_object('valid',false,'reason','invalid_code'); end if;

  select * into s from public.account_subscriptions
  where clinic_id=c.id and status<>'canceled' order by created_at desc limit 1;
  if s.id is null or public.subscription_access_mode(s.status,s.current_period_end,s.grace_until)<>'full' then
    return jsonb_build_object('valid',false,'reason','company_inactive','clinic_name',c.name);
  end if;

  select * into p from public.billing_plans where code=s.plan_code and account_scope='company' and is_active;
  select count(*) into member_count from public.clinic_members
  where clinic_id=c.id and status in ('active','accepted');

  if p.max_members>0 and member_count>=p.max_members then
    return jsonb_build_object('valid',false,'reason','seat_limit','clinic_name',c.name);
  end if;

  return jsonb_build_object(
    'valid',true,'clinic_name',c.name,'plan_name',p.name,
    'members_used',member_count,'members_limit',p.max_members
  );
end $$;
grant execute on function public.validate_company_invite_code(text) to anon,authenticated;

-- Company admins can retrieve the private invite code and current seat usage,
-- without exposing the company directory publicly.
create or replace function public.company_team_invite_info()
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  cid uuid;
  c public.clinics%rowtype;
  s public.account_subscriptions%rowtype;
  p public.billing_plans%rowtype;
  member_count integer;
  code text;
  allowed boolean;
begin
  if uid is null then raise exception 'Sessão inválida.'; end if;
  select clinic_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Empresa não encontrada.'; end if;

  select exists(select 1 from public.clinics x where x.id=cid and x.owner_id=uid)
    or exists(select 1 from public.clinic_members m where m.clinic_id=cid and m.user_id=uid and m.status in ('active','accepted') and upper(m.role) in ('CEO','ADMIN'))
  into allowed;
  if not allowed then raise exception 'Somente o administrador pode convidar membros.'; end if;

  select * into c from public.clinics where id=cid;
  code:=nullif(trim(c.invite_code),'');
  if code is null then
    loop
      code:=upper(encode(gen_random_bytes(6),'hex'));
      exit when not exists(select 1 from public.clinics x where upper(coalesce(x.invite_code,''))=code);
    end loop;
    update public.clinics set invite_code=code,updated_at=now() where id=cid;
  end if;

  select * into s from public.account_subscriptions
  where clinic_id=cid and status<>'canceled' order by created_at desc limit 1;
  if s.id is not null then select * into p from public.billing_plans where code=s.plan_code; end if;
  select count(*) into member_count from public.clinic_members where clinic_id=cid and status in ('active','accepted');

  return jsonb_build_object(
    'clinic_id',cid,'clinic_name',c.name,'invite_code',code,
    'plan_code',p.code,'plan_name',p.name,'members_used',member_count,'members_limit',coalesce(p.max_members,0),
    'access_mode',case when s.id is null then 'billing_only' else public.subscription_access_mode(s.status,s.current_period_end,s.grace_until) end
  );
end $$;
grant execute on function public.company_team_invite_info() to authenticated;

-- Professional accounts are company seats, never multi-company identities.
create or replace function public.enforce_professional_single_company()
returns trigger language plpgsql security definer set search_path=public as $$
declare acct text;
begin
  if new.status not in ('active','accepted') then return new; end if;
  select account_type into acct from public.profiles where id=new.user_id;
  if acct='professional' and exists(
    select 1 from public.clinic_members m
    where m.user_id=new.user_id and m.clinic_id<>new.clinic_id
      and m.status in ('active','accepted') and m.id<>new.id
  ) then
    raise exception 'Uma conta profissional só pode pertencer a uma empresa.';
  end if;
  return new;
end $$;
drop trigger if exists trg_professional_single_company on public.clinic_members;
create trigger trg_professional_single_company
before insert or update of clinic_id,user_id,status on public.clinic_members
for each row execute function public.enforce_professional_single_company();

drop function if exists public.unlink_professional_company(uuid);

-- One-time QA codes let a fresh test company exercise the paid lifecycle without
-- opening a client-controlled "mark as paid" backdoor.
create table if not exists public.billing_test_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text,
  expires_at timestamptz not null,
  max_redemptions integer not null default 1 check(max_redemptions between 1 and 20),
  redemption_count integer not null default 0 check(redemption_count>=0),
  created_at timestamptz not null default now()
);
alter table public.billing_test_tokens enable row level security;
-- No table policies: codes are only consumed through the SECURITY DEFINER RPC.

create or replace function public.billing_test_redeem_token(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.billing_test_tokens%rowtype; until_at timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  if length(trim(coalesce(p_token,'')))<8 then return jsonb_build_object('success',false,'error','Código de teste inválido.'); end if;

  select * into t from public.billing_test_tokens
  where token_hash=encode(digest(upper(trim(p_token)),'sha256'),'hex')
    and expires_at>now() and redemption_count<max_redemptions
  for update;
  if t.id is null then return jsonb_build_object('success',false,'error','Código de teste inválido, usado ou expirado.'); end if;

  update public.billing_test_tokens set redemption_count=redemption_count+1 where id=t.id;
  until_at:=least(t.expires_at,now()+interval '48 hours');
  insert into public.billing_test_access(user_id,enabled_until,created_by)
  values(auth.uid(),until_at,'one_time_token')
  on conflict(user_id) do update set enabled_until=greatest(billing_test_access.enabled_until,excluded.enabled_until),created_by='one_time_token';

  return jsonb_build_object('success',true,'enabled',true,'until',until_at);
end $$;
grant execute on function public.billing_test_redeem_token(text) to authenticated;

-- Email-confirmation-safe onboarding. Signup metadata is user supplied but every
-- field is revalidated by the authoritative company/professional creation RPCs.
create or replace function public.finalize_pending_onboarding()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  claims jsonb:=auth.jwt();
  meta jsonb;
  mode text;
  sessions text[];
  existing_profile public.profiles%rowtype;
  cid uuid;
begin
  if uid is null then return jsonb_build_object('success',false,'error','Sessão inválida.'); end if;
  select * into existing_profile from public.profiles where id=uid;
  if existing_profile.clinic_id is not null then return jsonb_build_object('success',true,'already_finalized',true); end if;
  if exists(select 1 from public.clinics where owner_id=uid) then return jsonb_build_object('success',true,'already_finalized',true); end if;

  meta:=coalesce(claims->'user_metadata','{}'::jsonb);
  mode:=coalesce(meta->>'pending_account_mode','');
  if mode='professional' then
    return public.create_professional_account(
      coalesce(meta->>'full_name',''),
      coalesce(meta->>'pending_profession_type','OUTRO'),
      coalesce(meta->>'pending_invite_code','')
    );
  elsif mode='company' then
    select coalesce(array_agg(value),'{}'::text[]) into sessions
    from jsonb_array_elements_text(coalesce(meta->'pending_company_sessions','[]'::jsonb));
    return public.create_company_account(
      coalesce(meta->>'pending_company_name',''),
      case when sessions[1]='clinic' then 'consultorio' when sessions[1]='radiology' then 'radiologia' else 'laboratorio' end,
      coalesce(meta->>'full_name',''),
      coalesce(meta->>'pending_company_plan','company_initial'),
      sessions
    );
  end if;
  return jsonb_build_object('success',true,'nothing_pending',true);
end $$;
grant execute on function public.finalize_pending_onboarding() to authenticated;

-- Paid state must be authoritative below the UI as well. These role helpers are
-- used throughout legacy RLS policies, so expired companies lose operational
-- REST/storage access even if a client attempts to bypass SubscriptionGate.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id and ur.role=_role and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id and ur.role=any(_roles) and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.is_cadista(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_role(_user_id,'cadista'::public.app_role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.user_roles ur
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=_user_id
      and ur.role in ('admin','dentista','recepcionista','auxiliar','protetico','SOLICITANTE')
      and p.clinic_id is not null and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role in ('CEO','DR') and p.clinic_id is not null
      and public.company_has_operational_access(p.clinic_id)
  )
$$;

create or replace function public.can_access_case(_case_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.clinic_id is not null and public.company_has_operational_access(p.clinic_id)
  ) and (
    public.is_staff(auth.uid()) or public.current_user_is_admin() or exists(
      select 1 from public.cases c where c.id=_case_id and (
        c.requested_by=auth.uid() or exists(select 1 from public.cadistas cd where cd.id=c.cadista_id and cd.user_id=auth.uid())
      )
    )
  )
$$;

create or replace function public.can_access_patient(_patient_id uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_type text:=''; v_admin boolean:=false; v_clinic uuid;
begin
  if v_user is null then return false; end if;
  select upper(coalesce(nullif(trim(p.account_subtype),''),nullif(trim(p.role),''),'')),coalesce(p.is_default_admin,false),p.clinic_id
    into v_type,v_admin,v_clinic from public.profiles p where p.id=v_user;
  if v_clinic is null or not public.company_has_operational_access(v_clinic) then return false; end if;
  if v_admin or v_type in ('CEO','ADMIN','PROTETICO') then return true; end if;
  return exists(select 1 from public.cases c where c.patient_id=_patient_id and public.can_access_case(c.id));
end $$;

-- Clinical permission checks also fail closed when the company period expires.
create or replace function public.clinical_permission_allowed(_clinic_id uuid, _permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_role text;
begin
  if auth.uid() is null then return false; end if;
  if not public.company_has_operational_access(_clinic_id) then return false; end if;
  if not public.is_clinic_member(_clinic_id,auth.uid()) then return false; end if;
  if not public.clinic_module_enabled(_clinic_id,'clinical') then return false; end if;
  if public.can_manage_clinic_permissions(_clinic_id) then return true; end if;
  v_role:=public.current_clinic_role(_clinic_id);
  return exists(select 1 from public.clinic_role_permissions p where p.clinic_id=_clinic_id and upper(p.role)=upper(coalesce(v_role,'USER')) and p.permission=_permission and p.allowed=true);
end $$;

-- DICOM read access follows the same paid entitlement as write access.
drop policy if exists dicom_objects_read on storage.objects;
create policy dicom_objects_read on storage.objects for select to authenticated using (
  bucket_id='dicom-files' and exists(
    select 1 from public.clinics c
    where c.id::text=split_part(name,'/',1) and public.user_can_use_company_session(c.id,'radiology')
  )
);

drop policy if exists radiology_studies_member_read on public.radiology_studies;
create policy radiology_studies_member_read on public.radiology_studies for select to authenticated using (
  public.user_can_use_company_session(clinic_id,'radiology')
);

grant execute on function public.has_role(uuid,public.app_role),public.has_any_role(uuid,public.app_role[]),public.is_cadista(uuid),public.is_staff(uuid),public.current_user_is_admin(),public.can_access_case(uuid),public.can_access_patient(uuid),public.clinical_permission_allowed(uuid,text) to authenticated;
