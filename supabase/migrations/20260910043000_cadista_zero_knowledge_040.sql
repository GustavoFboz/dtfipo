-- DentalFlow 0.4.0 — CAD designer zero-knowledge boundary
-- A CADISTA must never be able to discover another CADISTA and, when assigned
-- to an existing case, can only read activity created during the current active
-- assignment interval. These are RESTRICTIVE policies so they harden every
-- existing permissive policy without widening access for any role.

CREATE OR REPLACE FUNCTION public.current_cadista_case_joined_at(_case_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(cp.joined_at)
  FROM public.case_participants cp
  WHERE cp.case_id = _case_id
    AND cp.user_id = _user_id
    AND cp.participant_role = 'CADISTA'
    AND cp.left_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.current_cadista_case_joined_at(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_cadista_case_joined_at(uuid,uuid) TO authenticated, service_role;

-- Profiles are a particularly sensitive discovery surface. RLS policies are
-- normally OR'ed; RESTRICTIVE forces this predicate to be true in addition to
-- whichever existing policy grants profile visibility.
DROP POLICY IF EXISTS profiles_cadista_zero_knowledge_040 ON public.profiles;
CREATE POLICY profiles_cadista_zero_knowledge_040
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.effective_user_type(auth.uid()) <> 'CADISTA'
  OR id = auth.uid()
  OR public.effective_user_type(id) <> 'CADISTA'
);

-- The CAD directory itself must not reveal rows for peers.
DROP POLICY IF EXISTS cadistas_cadista_zero_knowledge_040 ON public.cadistas;
CREATE POLICY cadistas_cadista_zero_knowledge_040
ON public.cadistas
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.effective_user_type(auth.uid()) <> 'CADISTA'
  OR user_id = auth.uid()
);

-- Existing membership-time policy historically restricted comments only. For a
-- reassigned CADISTA that is not sufficient: status changes, mentions and other
-- activity can disclose people/content from before assignment. Restrict *every*
-- activity row for CADISTA to the current active assignment interval.
DROP POLICY IF EXISTS case_activity_cadista_current_interval_040 ON public.case_activity;
CREATE POLICY case_activity_cadista_current_interval_040
ON public.case_activity
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.effective_user_type(auth.uid()) <> 'CADISTA'
  OR (
    public.can_access_case(case_id)
    AND public.current_cadista_case_joined_at(case_id, auth.uid()) IS NOT NULL
    AND created_at >= public.current_cadista_case_joined_at(case_id, auth.uid())
  )
);

-- A notification associated with a case may carry sender names/message previews.
-- A newly assigned CADISTA must not receive stale notifications from before the
-- current assignment. Notifications unrelated to a case retain normal behavior.
DROP POLICY IF EXISTS notifications_cadista_current_interval_040 ON public.notifications;
CREATE POLICY notifications_cadista_current_interval_040
ON public.notifications
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.effective_user_type(auth.uid()) <> 'CADISTA'
  OR recipient_id = auth.uid()
  AND (
    NULLIF(metadata->>'case_id', '') IS NULL
    OR (
      public.current_cadista_case_joined_at((metadata->>'case_id')::uuid, auth.uid()) IS NOT NULL
      AND created_at >= public.current_cadista_case_joined_at((metadata->>'case_id')::uuid, auth.uid())
    )
  )
);

-- On reassignment, close every stale active CADISTA interval before opening the
-- new one. This guards against historical duplicate active rows from old data.
CREATE OR REPLACE FUNCTION public.close_stale_cadista_participants_040()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
BEGIN
  IF NEW.cadista_id IS NOT NULL THEN
    SELECT user_id INTO v_current_user FROM public.cadistas WHERE id = NEW.cadista_id;
  END IF;

  UPDATE public.case_participants
     SET left_at = COALESCE(left_at, now())
   WHERE case_id = NEW.id
     AND participant_role = 'CADISTA'
     AND left_at IS NULL
     AND (v_current_user IS NULL OR user_id <> v_current_user);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_stale_cadista_participants_040 ON public.cases;
CREATE TRIGGER trg_close_stale_cadista_participants_040
AFTER INSERT OR UPDATE OF cadista_id ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.close_stale_cadista_participants_040();

COMMENT ON FUNCTION public.current_cadista_case_joined_at(uuid,uuid) IS
  'DentalFlow 0.4.0: beginning of the current active CADISTA assignment; used as a strict privacy boundary.';
