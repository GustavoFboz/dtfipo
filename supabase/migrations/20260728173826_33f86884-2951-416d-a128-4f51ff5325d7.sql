
-- Backfill cadistas from existing profiles
INSERT INTO public.cadistas (name, user_id)
SELECT COALESCE(p.full_name, p.email), p.id
FROM public.profiles p
WHERE (p.role = 'CADISTA' OR p.account_subtype = 'CADISTA')
  AND NOT EXISTS (SELECT 1 FROM public.cadistas c WHERE c.user_id = p.id);

-- Trigger to keep cadistas in sync when profile role changes
CREATE OR REPLACE FUNCTION public.sync_cadista_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role = 'CADISTA' OR NEW.account_subtype = 'CADISTA') THEN
    IF NOT EXISTS (SELECT 1 FROM public.cadistas WHERE user_id = NEW.id) THEN
      INSERT INTO public.cadistas (name, user_id)
      VALUES (COALESCE(NEW.full_name, NEW.email, 'Cadista'), NEW.id);
    ELSE
      UPDATE public.cadistas SET name = COALESCE(NEW.full_name, NEW.email, name)
      WHERE user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_sync_cadista ON public.profiles;
CREATE TRIGGER profiles_sync_cadista
AFTER INSERT OR UPDATE OF role, account_subtype, full_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_cadista_from_profile();
