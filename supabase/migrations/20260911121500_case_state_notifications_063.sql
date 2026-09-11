-- DentalFlow 0.6.3 — canonical case state notifications
-- Keeps Web and Desktop on the same public.notifications stream for status and
-- workflow-stage changes. The event_key index from 0.4.0 makes delivery idempotent.

CREATE OR REPLACE FUNCTION public.df_notify_case_state_v063()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  r record;
  sender_name text;
  sender_avatar text;
  case_label text;
  stage_name text;
  event_type text;
  event_title text;
  event_content text;
  event_key text;
BEGIN
  -- Background/service updates without a user actor are intentionally silent.
  -- This also keeps notifications.sender_id valid in installations where it is
  -- constrained to a real profile.
  IF actor IS NULL THEN RETURN NEW; END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.current_stage_id IS NOT DISTINCT FROM OLD.current_stage_id THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name, p.avatar_url
    INTO sender_name, sender_avatar
  FROM public.profiles p
  WHERE p.id = actor;

  SELECT COALESCE(c.case_label, pt.name)
    INTO case_label
  FROM public.cases c
  LEFT JOIN public.patients pt ON pt.id = c.patient_id
  WHERE c.id = NEW.id;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    event_type := 'case_status';
    event_title := 'Status do caso atualizado';
    event_content := 'O status do caso foi alterado para ' || COALESCE(NULLIF(NEW.status,''), 'sem status') || '.';
    event_key := 'case-status:' || NEW.id::text || ':' || COALESCE(NEW.status,'') || ':' || COALESCE(NEW.updated_at::text, clock_timestamp()::text);

    FOR r IN SELECT user_id FROM public.case_notification_recipients_v040(NEW.id, actor) LOOP
      INSERT INTO public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
      VALUES(
        gen_random_uuid(), actor, r.user_id, event_title, event_content, event_type,
        jsonb_build_object(
          'case_id', NEW.id,
          'event_key', event_key,
          'sender_name', sender_name,
          'sender_avatar', sender_avatar,
          'case_label', case_label,
          'status', NEW.status
        ),
        now()
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id THEN
    SELECT s.name INTO stage_name
    FROM public.stages s
    WHERE s.id = NEW.current_stage_id;

    event_type := 'case_stage';
    event_title := 'Etapa do caso atualizada';
    event_content := CASE
      WHEN NEW.current_stage_id IS NULL THEN 'O caso ficou sem uma etapa ativa.'
      ELSE 'O caso avançou para a etapa “' || COALESCE(stage_name, 'Atualizada') || '”.'
    END;
    event_key := 'case-stage:' || NEW.id::text || ':' || COALESCE(NEW.current_stage_id::text,'none') || ':' || COALESCE(NEW.updated_at::text, clock_timestamp()::text);

    FOR r IN SELECT user_id FROM public.case_notification_recipients_v040(NEW.id, actor) LOOP
      INSERT INTO public.notifications(id,sender_id,recipient_id,title,content,type,metadata,created_at)
      VALUES(
        gen_random_uuid(), actor, r.user_id, event_title, event_content, event_type,
        jsonb_build_object(
          'case_id', NEW.id,
          'event_key', event_key,
          'sender_name', sender_name,
          'sender_avatar', sender_avatar,
          'case_label', case_label,
          'stage_id', NEW.current_stage_id,
          'stage_name', stage_name
        ),
        now()
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_notify_case_state_v063 ON public.cases;
CREATE TRIGGER trg_notify_case_state_v063
AFTER UPDATE OF status,current_stage_id ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.df_notify_case_state_v063();

ALTER TABLE public.cases REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='cases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;
  END IF;
END $$;
