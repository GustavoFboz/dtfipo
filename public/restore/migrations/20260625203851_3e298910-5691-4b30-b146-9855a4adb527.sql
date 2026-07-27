
-- 1) Prevent privilege escalation on profiles via trigger comparing OLD vs NEW
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Não é permitido alterar o id do perfil.';
  END IF;

  IF COALESCE(NEW.role, '') IS DISTINCT FROM COALESCE(OLD.role, '') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o papel do usuário.';
  END IF;

  IF COALESCE(NEW.account_subtype, '') IS DISTINCT FROM COALESCE(OLD.account_subtype, '') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o subtipo da conta.';
  END IF;

  IF COALESCE(NEW.is_default_admin, false) IS DISTINCT FROM COALESCE(OLD.is_default_admin, false) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o status de administrador padrão.';
  END IF;

  IF COALESCE(NEW.clinic_id::text, '') IS DISTINCT FROM COALESCE(OLD.clinic_id::text, '') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o consultório vinculado.';
  END IF;

  IF COALESCE(NEW.user_code, '') IS DISTINCT FROM COALESCE(OLD.user_code, '') THEN
    RAISE EXCEPTION 'Não é permitido alterar o código de usuário.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Restrict clinics SELECT to members or admins
DROP POLICY IF EXISTS "Authenticated can view clinics" ON public.clinics;
CREATE POLICY "Members can view their clinic"
ON public.clinics FOR SELECT
TO authenticated
USING (
  public.current_user_is_admin()
  OR id = public.current_user_clinic_id()
  OR EXISTS (
    SELECT 1 FROM public.clinic_members cm
    WHERE cm.clinic_id = clinics.id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
);

-- 3) Restrict stock_item_custom_fields SELECT to same audience as stock_items
DROP POLICY IF EXISTS stock_item_custom_fields_select ON public.stock_item_custom_fields;
CREATE POLICY stock_item_custom_fields_select
ON public.stock_item_custom_fields FOR SELECT
TO authenticated
USING (
  (public.is_staff(auth.uid()) AND NOT public.is_cadista(auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
