
CREATE OR REPLACE FUNCTION public.request_join_clinic(p_clinic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_existing record;
  v_user_name text;
  v_clinic_name text;
  v_admin record;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_existing FROM public.clinic_members
   WHERE user_id = v_user AND clinic_id = p_clinic_id;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'active' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Você já é membro deste consultório');
    ELSIF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Solicitação já enviada, aguardando aprovação');
    ELSE
      UPDATE public.clinic_members
         SET status='pending', decided_by=NULL, decided_at=NULL, updated_at=now()
       WHERE id = v_existing.id;
    END IF;
  ELSE
    INSERT INTO public.clinic_members (clinic_id, user_id, role, status)
    VALUES (p_clinic_id, v_user, 'USER', 'pending');
  END IF;

  SELECT COALESCE(full_name, email) INTO v_user_name FROM public.profiles WHERE id = v_user;
  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = p_clinic_id;

  -- Notify all admins of the target clinic
  FOR v_admin IN
    SELECT id FROM public.profiles
     WHERE clinic_id = p_clinic_id AND role IN ('CEO','DR')
  LOOP
    INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
    VALUES (
      v_user,
      v_admin.id,
      'Nova solicitação de acesso',
      COALESCE(v_user_name, 'Um usuário') || ' solicitou entrada em ' || COALESCE(v_clinic_name, 'seu consultório') || '.',
      'join_request'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END $function$;

CREATE OR REPLACE FUNCTION public.approve_join_request(p_member_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
  v_clinic_name text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_m FROM public.clinic_members WHERE id = p_member_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;

  UPDATE public.clinic_members
     SET status='active', role=p_role, decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;

  UPDATE public.profiles
     SET clinic_id = v_m.clinic_id, role = p_role, account_subtype = p_role
   WHERE id = v_m.user_id;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_m.clinic_id;

  INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
  VALUES (
    auth.uid(),
    v_m.user_id,
    'Acesso aprovado',
    'Sua entrada em ' || COALESCE(v_clinic_name, 'consultório') || ' foi aprovada. Acesso liberado como ' || p_role || '.',
    'join_approved'
  );

  RETURN jsonb_build_object('success', true);
END $function$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
  v_clinic_name text;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;

  SELECT * INTO v_m FROM public.clinic_members WHERE id = p_member_id;
  IF v_m.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação não encontrada');
  END IF;

  UPDATE public.clinic_members
     SET status='rejected', decided_by=auth.uid(), decided_at=now()
   WHERE id = p_member_id;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v_m.clinic_id;

  INSERT INTO public.notifications (sender_id, recipient_id, title, content, type)
  VALUES (
    auth.uid(),
    v_m.user_id,
    'Solicitação recusada',
    'Sua solicitação para entrar em ' || COALESCE(v_clinic_name, 'consultório') || ' foi recusada.',
    'join_rejected'
  );

  RETURN jsonb_build_object('success', true);
END $function$;
