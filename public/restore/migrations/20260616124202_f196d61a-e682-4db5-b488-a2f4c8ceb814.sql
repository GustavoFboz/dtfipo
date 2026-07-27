
-- Add DR to is_staff and sync profiles → doctors/cadistas

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('admin','dentista','recepcionista','auxiliar','protetico','cadista')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
    AND role IN ('CADISTA','CEO','DR','PROTETICO','ATENDIMENTO','admin')
  );
END; $$;

-- Backfill cadistas from profiles with CADISTA role
INSERT INTO public.cadistas (name, user_id)
SELECT COALESCE(p.full_name, p.email), p.id
FROM public.profiles p
WHERE p.role = 'CADISTA'
  AND NOT EXISTS (SELECT 1 FROM public.cadistas c WHERE c.user_id = p.id);

-- Backfill doctors from profiles with DR role (doctors has no user_id, dedupe by name)
INSERT INTO public.doctors (name)
SELECT COALESCE(p.full_name, p.email)
FROM public.profiles p
WHERE p.role = 'DR'
  AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.name = COALESCE(p.full_name, p.email));

-- Trigger to keep cadistas/doctors in sync with profiles
CREATE OR REPLACE FUNCTION public.sync_profile_to_team()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name text;
BEGIN
  v_name := COALESCE(NEW.full_name, NEW.email);

  IF NEW.role = 'CADISTA' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cadistas WHERE user_id = NEW.id) THEN
      INSERT INTO public.cadistas (name, user_id) VALUES (v_name, NEW.id);
    ELSE
      UPDATE public.cadistas SET name = v_name WHERE user_id = NEW.id;
    END IF;
  ELSE
    DELETE FROM public.cadistas WHERE user_id = NEW.id;
  END IF;

  IF NEW.role = 'DR' THEN
    IF NOT EXISTS (SELECT 1 FROM public.doctors WHERE name = v_name) THEN
      INSERT INTO public.doctors (name) VALUES (v_name);
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_profile_to_team ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_team
AFTER INSERT OR UPDATE OF role, full_name, email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_team();
