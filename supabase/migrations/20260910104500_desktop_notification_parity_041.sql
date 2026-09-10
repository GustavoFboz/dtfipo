-- DentalFlow 0.4.1 — notification parity for Desktop/Web
-- Ensures attachment and assignment events always create rows in public.notifications,
-- so Realtime and the Desktop native toast path receive the same event stream.

create or replace function public.df_notify_case_attachment_v041()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  a public.case_attachments%rowtype;
  actor uuid;
  r record;
  evt text;
  title text;
  body text;
  label text;
  sender_name text;
  sender_avatar text;
begin
  a := case when tg_op='DELETE' then old else new end;
  actor := coalesce(auth.uid(), a.uploaded_by);
  if actor is null then return case when tg_op='DELETE' then old else new end; end if;
  evt := 'attachment:'||a.id::text||':'||lower(tg_op);
  title := case when tg_op='DELETE' then 'Arquivo removido' else 'Novo arquivo no caso' end;
  body := case when tg_op='DELETE'
    then 'O arquivo "'||coalesce(a.file_name,'arquivo')||'" foi removido do caso.'
    else 'O arquivo "'||coalesce(a.file_name,'arquivo')||'" foi adicionado ao caso.' end;
  select coalesce(c.case_label,p.name) into label
    from public.cases c left join public.patients p on p.id=c.patient_id where c.id=a.case_id;
  select p.full_name,p.avatar_url into sender_name,sender_avatar from public.profiles p where p.id=actor;

  for r in select user_id from public.case_notification_recipients_v040(a.case_id,actor) loop
    insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
    values(
      gen_random_uuid(),actor,r.user_id,title,body,'attachment',
      jsonb_build_object(
        'case_id',a.case_id,'attachment_id',a.id,'event_key',evt,
        'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',label
      ),now()
    ) on conflict do nothing;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;

drop trigger if exists trg_notify_case_attachment_v041 on public.case_attachments;
create trigger trg_notify_case_attachment_v041
after insert or delete on public.case_attachments
for each row execute function public.df_notify_case_attachment_v041();

create or replace function public.df_notify_case_assignment_v041()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  new_cad_user uuid;
  new_doctor_user uuid;
  evt text;
  label text;
  sender_name text;
  sender_avatar text;
begin
  if new.cadista_id is not distinct from old.cadista_id
     and new.doctor_id is not distinct from old.doctor_id then
    return new;
  end if;

  select coalesce(new.case_label,p.name) into label from public.patients p where p.id=new.patient_id;
  if actor is not null then
    select p.full_name,p.avatar_url into sender_name,sender_avatar from public.profiles p where p.id=actor;
  end if;

  if new.cadista_id is distinct from old.cadista_id and new.cadista_id is not null then
    select c.user_id into new_cad_user from public.cadistas c where c.id=new.cadista_id;
    if new_cad_user is not null and new_cad_user is distinct from actor then
      evt := 'case-assigned-cad:'||new.id::text||':'||new.cadista_id::text||':'||coalesce(new.updated_at::text,clock_timestamp()::text);
      insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
      values(
        gen_random_uuid(),actor,new_cad_user,'Novo caso atribuído','Você foi atribuído a um caso.','case_assignment',
        jsonb_build_object('case_id',new.id,'event_key',evt,'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',label),
        now()
      ) on conflict do nothing;
    end if;
  end if;

  if new.doctor_id is distinct from old.doctor_id and new.doctor_id is not null then
    select d.user_id into new_doctor_user from public.doctors d where d.id=new.doctor_id;
    if new_doctor_user is not null and new_doctor_user is distinct from actor then
      evt := 'case-assigned-doctor:'||new.id::text||':'||new.doctor_id::text||':'||coalesce(new.updated_at::text,clock_timestamp()::text);
      insert into public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
      values(
        gen_random_uuid(),actor,new_doctor_user,'Caso atribuído a você','Você foi atribuído a um caso.','case_assignment',
        jsonb_build_object('case_id',new.id,'event_key',evt,'sender_name',sender_name,'sender_avatar',sender_avatar,'case_label',label),
        now()
      ) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_case_assignment_v041 on public.cases;
create trigger trg_notify_case_assignment_v041
after update of cadista_id,doctor_id on public.cases
for each row execute function public.df_notify_case_assignment_v041();
