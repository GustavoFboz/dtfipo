-- Complete the already-shipped creation RPC contract. These functions execute
-- as the caller: existing clinical RLS, company guards and triggers still apply.
-- No historical patient/case/financial row is rewritten by this migration.
alter table public.cases add column if not exists prosthesis_groups jsonb not null default '[]'::jsonb;

-- No clinical payload is cached here. A retry re-reads its result through RLS;
-- missing/deleted/revoked results fail closed rather than creating another row.
create table public.clinical_creation_requests (
 actor_id uuid not null references auth.users(id),
 clinic_id uuid not null references public.clinics(id),
 kind text not null check(kind in ('patient','case')),
 request_key uuid not null,
 input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 result_ids uuid[] not null check(cardinality(result_ids) between 1 and 2 and array_position(result_ids,null) is null),
 created_at timestamptz not null default now(),
 primary key(actor_id,kind,request_key)
);
alter table public.clinical_creation_requests enable row level security;
create policy clinical_creation_own_read on public.clinical_creation_requests
 for select to authenticated using(actor_id=auth.uid() and clinic_id=public.saas_company_current_id()
  and public.company_has_operational_access(clinic_id));
create policy clinical_creation_own_insert on public.clinical_creation_requests
 for insert to authenticated with check(actor_id=auth.uid() and clinic_id=public.saas_company_current_id()
  and public.company_has_operational_access(clinic_id)
  and ((kind='patient' and cardinality(result_ids)=1 and exists(select 1 from public.patients p
    where p.id=result_ids[1] and p.clinic_id=clinical_creation_requests.clinic_id))
   or (kind='case' and cardinality(result_ids)=(select count(*) from public.cases c where c.id=any(result_ids)))));
revoke all on public.clinical_creation_requests from public,anon,authenticated,service_role;
grant select,insert on public.clinical_creation_requests to authenticated;
grant select on public.clinical_creation_requests to service_role;

create function public.create_patient_idempotent_v1(_key uuid,_id uuid,_values jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); company uuid:=public.saas_company_current_id();
 r public.clinical_creation_requests%rowtype; p public.patients%rowtype;
 normalized text; fingerprint text:=encode(sha256(convert_to(jsonb_build_object('id',_id,'values',_values)::text,'UTF8')),'hex');
begin
 if actor is null or auth.role()<>'authenticated' or company is null or _key is null or _id is null
  or not public.company_has_operational_access(company) then raise exception 'CREATION_FORBIDDEN' using errcode='42501'; end if;
 if jsonb_typeof(_values) is distinct from 'object' or octet_length(_values::text)>65536
  or nullif(btrim(_values->>'name'),'') is null
  or (_values?'clinic_id' and (_values->>'clinic_id')::uuid is distinct from company)
  or exists(select 1 from jsonb_object_keys(_values) k where k not in
   ('clinic_id','name','first_name','last_name','age','birth_date','gender','cpf','rg','phone','email','address',
    'medical_history','allergies','medications','clinical_notes','notes')) then raise exception 'CREATION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':patient:'||_key::text,0));
 select * into r from public.clinical_creation_requests where actor_id=actor and kind='patient' and request_key=_key;
 if found then
  if r.input_hash is distinct from fingerprint then raise exception 'CREATION_KEY_CONFLICT'; end if;
  select * into p from public.patients where id=r.result_ids[1];
  if not found then raise exception 'CREATION_RESULT_UNAVAILABLE'; end if;
  return to_jsonb(p);
 end if;
 normalized:=lower(regexp_replace(btrim(_values->>'name'),'\s+',' ','g'));
 -- Serialize equal names even when two tabs use different request keys.
 perform pg_advisory_xact_lock(hashtextextended(company::text||':patient-name:'||normalized,0));
 if exists(select 1 from public.patients existing where existing.clinic_id=company
  and lower(regexp_replace(btrim(existing.name),'\s+',' ','g'))=normalized
  and not exists(select 1 from unnest(array['cpf','rg','phone']) f
   where regexp_replace(lower(coalesce(_values->>f,'')),'[^a-z0-9]','','g')<>''
    and regexp_replace(lower(coalesce(_values->>f,'')),'[^a-z0-9]','','g')
     is distinct from regexp_replace(lower(coalesce(to_jsonb(existing)->>f,'')),'[^a-z0-9]','','g')))
  then raise exception 'PATIENT_NAME_MATCH'; end if;
 p:=jsonb_populate_record(null::public.patients,_values);
 insert into public.patients(id,clinic_id,name,first_name,last_name,age,birth_date,gender,cpf,rg,phone,email,address,
  medical_history,allergies,medications,clinical_notes,notes)
 values(_id,company,btrim(p.name),p.first_name,p.last_name,coalesce(p.age,0),p.birth_date,p.gender,p.cpf,p.rg,p.phone,p.email,p.address,
  p.medical_history,p.allergies,p.medications,p.clinical_notes,p.notes);
 -- The existing patient read policy resolves ownership through a STABLE
 -- helper. Re-read in the next statement, after the insert is visible to it.
 select * into p from public.patients where id=_id;
 if not found then raise exception 'CREATION_RESULT_UNAVAILABLE'; end if;
 insert into public.clinical_creation_requests(actor_id,clinic_id,kind,request_key,input_hash,result_ids)
 values(actor,company,'patient',_key,fingerprint,array[p.id]);
 return to_jsonb(p);
end $$;

create function public.create_case_idempotent_v1(_key uuid,_input jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); company uuid:=public.saas_company_current_id();
 request public.clinical_creation_requests%rowtype; c public.cases%rowtype; result jsonb:='[]';
 ids uuid[]:='{}'; original_id uuid; sibling uuid; chosen_arch text; arches text[];
 component uuid; case_type uuid; milling_material text; burr uuid; teeth integer[];
 effective_type text; owner_company uuid; fingerprint text:=encode(sha256(convert_to(_input::text,'UTF8')),'hex');
begin
 if actor is null or auth.role()<>'authenticated' or company is null or _key is null
  or not public.company_has_operational_access(company) then raise exception 'CREATION_FORBIDDEN' using errcode='42501'; end if;
 if jsonb_typeof(_input) is distinct from 'object' or octet_length(_input::text)>65536
  or exists(select 1 from jsonb_object_keys(_input) k where k not in
   ('id','patient_id','doctor_id','cadista_id','case_type_id','tooth_color_id','case_label','entry_date','delivery_date',
    'folder_url','current_stage_id','arch','notes','component_ids','case_type_ids','teeth_numbers','teeth_zirconia',
    'teeth_dissilicato','tooth_case_types','implant_system_id','implant_system_ids','has_provisional','has_mockup',
    'prosthesis_groups','implant_teeth','tooth_implant_systems','scan_jig_id','requested_by','also_arch','gum_info'))
  then raise exception 'CREATION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':case:'||_key::text,0));
 select * into request from public.clinical_creation_requests where actor_id=actor and kind='case' and request_key=_key;
 if found then
  if request.input_hash is distinct from fingerprint then raise exception 'CREATION_KEY_CONFLICT'; end if;
  select jsonb_agg(to_jsonb(existing) order by array_position(request.result_ids,existing.id)) into result
   from public.cases existing where existing.id=any(request.result_ids);
  if coalesce(jsonb_array_length(result),0)<>cardinality(request.result_ids) then raise exception 'CREATION_RESULT_UNAVAILABLE'; end if;
  return jsonb_build_object('case',result->0,'cases',result);
 end if;
 c:=jsonb_populate_record(null::public.cases,_input);
 if c.patient_id is null or c.delivery_date is null or not public.can_access_patient(c.patient_id)
  then raise exception 'CREATION_FORBIDDEN' using errcode='42501'; end if;
 select upper(coalesce(nullif(account_subtype,''),role)) into effective_type from public.profiles where id=actor;
 owner_company:=case when effective_type='SOLICITANTE' then company else public.resolve_patient_clinic_id(c.patient_id) end;
 if c.current_stage_id is null then
  select id into c.current_stage_id from public.stages where clinic_id=owner_company order by position,id limit 1;
 elsif not exists(select 1 from public.stages where id=c.current_stage_id and clinic_id=owner_company) then
  raise exception 'CREATION_FOREIGN_STAGE' using errcode='42501';
 end if;
 arches:=array[c.arch];
 if nullif(_input->>'also_arch','') is not null and c.arch is not null and c.arch<>_input->>'also_arch' then
  if c.arch not in ('superior','inferior') or _input->>'also_arch' not in ('superior','inferior') then raise exception 'CREATION_INVALID'; end if;
  arches:=array[c.arch,_input->>'also_arch'];
 end if;
 original_id:=coalesce(c.id,gen_random_uuid());
 foreach chosen_arch in array arches loop
  insert into public.cases(id,patient_id,doctor_id,cadista_id,case_type_id,tooth_color_id,case_label,entry_date,delivery_date,
   folder_url,current_stage_id,arch,notes,teeth_numbers,teeth_zirconia,teeth_dissilicato,tooth_case_types,
   elements_count,elements_zirconia,elements_dissilicato,implant_system_id,implant_system_ids,implant_teeth,
   tooth_implant_systems,scan_jig_id,has_provisional,has_mockup,prosthesis_groups,gum_info,requested_by,status,sibling_case_id)
  values(case when cardinality(ids)=0 then original_id else gen_random_uuid() end,c.patient_id,c.doctor_id,c.cadista_id,
   c.case_type_id,c.tooth_color_id,c.case_label,coalesce(c.entry_date,current_date),c.delivery_date,c.folder_url,c.current_stage_id,
   chosen_arch,c.notes,coalesce(c.teeth_numbers,'{}'),coalesce(c.teeth_zirconia,'{}'),coalesce(c.teeth_dissilicato,'{}'),
   coalesce(c.tooth_case_types,'{}'),coalesce(cardinality(c.teeth_numbers),0),coalesce(cardinality(c.teeth_zirconia),0),
   coalesce(cardinality(c.teeth_dissilicato),0),c.implant_system_id,coalesce(c.implant_system_ids,'{}'),coalesce(c.implant_teeth,'{}'),
   coalesce(c.tooth_implant_systems,'{}'),c.scan_jig_id,coalesce(c.has_provisional,false),coalesce(c.has_mockup,false),
   coalesce(c.prosthesis_groups,'[]'),c.gum_info,case when effective_type='SOLICITANTE' then actor else null end,
   case when effective_type='SOLICITANTE' then 'pendente' else 'em_andamento' end,ids[1]) returning * into c;
  ids:=array_append(ids,c.id);
  for component in select distinct value::uuid from jsonb_array_elements_text(coalesce(_input->'component_ids','[]')) loop
   if not exists(select 1 from public.components where id=component and clinic_id=owner_company) then raise exception 'CREATION_FOREIGN_COMPONENT' using errcode='42501'; end if;
   insert into public.case_components(case_id,component_id) values(c.id,component);
  end loop;
  for case_type in select distinct value::uuid from jsonb_array_elements_text(coalesce(_input->'case_type_ids','[]')) loop
   insert into public.case_types_link(case_id,case_type_id) values(c.id,case_type);
  end loop;
  if c.current_stage_id is not null then
   insert into public.case_stages(case_id,stage_id,position) values(c.id,c.current_stage_id,0) on conflict do nothing;
  end if;
  foreach milling_material in array array['zirconia','dissilicato'] loop
   teeth:=case when milling_material='zirconia' then c.teeth_zirconia else c.teeth_dissilicato end;
   select id into burr from public.burrs where clinic_id=owner_company and removed_at is null and public.burrs.material=milling_material
    order by installed_at desc,id limit 1;
   if burr is not null and cardinality(teeth)>0 then
    insert into public.burr_usages(burr_id,case_id,material,teeth_count,teeth_numbers,clinic_id)
     values(burr,c.id,milling_material,cardinality(teeth),teeth,owner_company);
   end if;
  end loop;
  insert into public.case_activity(case_id,user_id,kind,content,mentions,metadata)
   values(c.id,actor,'create','Caso criado.',array[]::uuid[],jsonb_build_object('creation_key',_key));
  if c.status<>'pendente' then
   insert into public.notifications(sender_id,recipient_id,title,content,type,metadata)
    select actor,cd.user_id,'Novo caso atribuído a você','Um novo caso foi atribuído a você.','case_assigned',
     jsonb_build_object('case_id',c.id,'event_key','case-create:'||c.id::text)
    from public.cadistas cd where cd.id=c.cadista_id and cd.user_id is not null and cd.user_id<>actor
    on conflict do nothing;
  end if;
 end loop;
 if cardinality(ids)=2 then update public.cases set sibling_case_id=ids[2] where id=ids[1]; end if;
 insert into public.clinical_creation_requests(actor_id,clinic_id,kind,request_key,input_hash,result_ids)
 values(actor,company,'case',_key,fingerprint,ids);
 select jsonb_agg(to_jsonb(existing) order by array_position(ids,existing.id)) into result from public.cases existing where existing.id=any(ids);
 if coalesce(jsonb_array_length(result),0)<>cardinality(ids) then raise exception 'CREATION_RESULT_UNAVAILABLE'; end if;
 return jsonb_build_object('case',result->0,'cases',result);
end $$;
revoke all on function public.create_patient_idempotent_v1(uuid,uuid,jsonb),public.create_case_idempotent_v1(uuid,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.create_patient_idempotent_v1(uuid,uuid,jsonb),public.create_case_idempotent_v1(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
