-- DentalFlow 0.4.0 — reliable notification generation core
-- This migration intentionally depends only on schema that exists in every
-- current DentalFlow production environment. It closes the gap where chat rows
-- were persisted but no notification row was created because a later 0.3.5
-- migration had not reached the hosted database.

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_recipient_040
ON public.notifications(recipient_id, type, (metadata->>'event_key'))
WHERE metadata ? 'event_key' AND NULLIF(metadata->>'event_key','') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.case_notification_recipients_v040(
  _case_id uuid,
  _actor uuid DEFAULT auth.uid()
)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor_ctx AS (
    SELECT p.clinic_id
    FROM public.profiles p
    WHERE p.id = _actor
  ), base AS (
    SELECT c.requested_by AS uid
    FROM public.cases c
    WHERE c.id = _case_id

    UNION
    SELECT cd.user_id
    FROM public.cases c
    JOIN public.cadistas cd ON cd.id = c.cadista_id
    WHERE c.id = _case_id

    UNION
    SELECT d.user_id
    FROM public.cases c
    JOIN public.doctors d ON d.id = c.doctor_id
    WHERE c.id = _case_id

    UNION
    SELECT p.id
    FROM actor_ctx a
    JOIN public.profiles p ON p.clinic_id = a.clinic_id
    WHERE COALESCE(p.is_default_admin, false)
       OR UPPER(COALESCE(NULLIF(p.account_subtype,''), NULLIF(p.role,''), '')) IN ('CEO','ADMIN','ADMINISTRADOR')
  )
  SELECT DISTINCT b.uid
  FROM base b
  WHERE b.uid IS NOT NULL
    AND b.uid IS DISTINCT FROM _actor
$$;

REVOKE ALL ON FUNCTION public.case_notification_recipients_v040(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_notification_recipients_v040(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_case_stakeholders_v040(
  _case_id uuid,
  _title text,
  _content text,
  _type text DEFAULT 'case',
  _activity_id uuid DEFAULT NULL,
  _event_key text DEFAULT NULL,
  _extra_recipient_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  cid uuid;
  sender_name text;
  sender_avatar text;
  case_label text;
  evt text := COALESCE(NULLIF(TRIM(_event_key),''), CASE WHEN _activity_id IS NOT NULL THEN 'activity:'||_activity_id::text ELSE NULL END);
  inserted_count integer := 0;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sessão inválida.'; END IF;
  IF NOT public.can_access_case(_case_id) THEN RAISE EXCEPTION 'Sem acesso ao caso.'; END IF;

  SELECT p.clinic_id, p.full_name, p.avatar_url
    INTO cid, sender_name, sender_avatar
  FROM public.profiles p WHERE p.id = actor;

  SELECT COALESCE(c.case_label, pt.name)
    INTO case_label
  FROM public.cases c
  LEFT JOIN public.patients pt ON pt.id = c.patient_id
  WHERE c.id = _case_id;

  WITH recipients AS (
    SELECT r.user_id FROM public.case_notification_recipients_v040(_case_id, actor) r
    UNION
    SELECT p.id
    FROM unnest(COALESCE(_extra_recipient_ids,'{}'::uuid[])) x(id)
    JOIN public.profiles p ON p.id = x.id
    WHERE cid IS NOT NULL AND p.clinic_id = cid
  ), ins AS (
    INSERT INTO public.notifications(
      id, sender_id, recipient_id, title, content, type, metadata, read_at, created_at
    )
    SELECT
      gen_random_uuid(), actor, r.user_id,
      COALESCE(NULLIF(_title,''),'DentalFlow'),
      COALESCE(_content,''),
      COALESCE(NULLIF(_type,''),'case'),
      jsonb_build_object(
        'case_id', _case_id,
        'activity_id', _activity_id,
        'event_key', evt,
        'sender_name', sender_name,
        'sender_avatar', sender_avatar,
        'case_label', case_label
      ),
      NULL,
      now()
    FROM recipients r
    WHERE r.user_id IS DISTINCT FROM actor
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_case_stakeholders_v040(uuid,text,text,text,uuid,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_case_stakeholders_v040(uuid,text,text,text,uuid,text,uuid[]) TO authenticated;

-- Server-side fallback: once a comment/message is committed, delivery no longer
-- depends on a second browser request. This is the authoritative chat alert path.
CREATE OR REPLACE FUNCTION public.df_notify_case_activity_v040()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := COALESCE(NEW.user_id, NEW.actor_id);
  r record;
  evt text := 'activity:' || NEW.id::text;
  label text;
  sender_name text;
  sender_avatar text;
BEGIN
  IF LOWER(COALESCE(NEW.kind,'')) NOT IN ('comment','message') THEN RETURN NEW; END IF;
  IF actor IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(c.case_label, p.name)
    INTO label
  FROM public.cases c
  LEFT JOIN public.patients p ON p.id = c.patient_id
  WHERE c.id = NEW.case_id;

  SELECT p.full_name, p.avatar_url
    INTO sender_name, sender_avatar
  FROM public.profiles p
  WHERE p.id = actor;

  FOR r IN
    SELECT user_id FROM public.case_notification_recipients_v040(NEW.case_id, actor)
    UNION
    SELECT unnest(COALESCE(NEW.mentions, '{}'::uuid[]))
  LOOP
    IF r.user_id IS NULL OR r.user_id = actor THEN CONTINUE; END IF;
    INSERT INTO public.notifications(
      id, sender_id, recipient_id, title, content, type, metadata, created_at
    ) VALUES (
      gen_random_uuid(), actor, r.user_id,
      'Novo comentário no caso',
      COALESCE(NEW.content, NEW.message, ''),
      'comment',
      jsonb_build_object(
        'case_id', NEW.case_id,
        'activity_id', NEW.id,
        'event_key', evt,
        'sender_name', sender_name,
        'sender_avatar', sender_avatar,
        'case_label', label
      ),
      now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_case_activity_v035 ON public.case_activity;
DROP TRIGGER IF EXISTS trg_notify_case_activity_v040 ON public.case_activity;
CREATE TRIGGER trg_notify_case_activity_v040
AFTER INSERT ON public.case_activity
FOR EACH ROW EXECUTE FUNCTION public.df_notify_case_activity_v040();

ALTER TABLE public.case_activity REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='case_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.case_activity;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
