-- Add missing columns
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS gross_amount numeric;

ALTER TABLE public.financial_approvals ADD COLUMN IF NOT EXISTS decision_notes text;

ALTER TABLE public.financial_approval_history ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE public.financial_approval_history ADD COLUMN IF NOT EXISTS diff jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.case_financial_participants ADD COLUMN IF NOT EXISTS payment_rule_id uuid;

ALTER TABLE public.production_pricing_rules ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.production_pricing_rules ADD COLUMN IF NOT EXISTS case_type_id uuid;
ALTER TABLE public.production_pricing_rules ADD COLUMN IF NOT EXISTS procedure_key text;

ALTER TABLE public.financial_professional_earnings ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.financial_professional_earnings ADD COLUMN IF NOT EXISTS reference_type text;

-- Relax financial_professional_rules
ALTER TABLE public.financial_professional_rules ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.financial_professional_rules ALTER COLUMN clinic_id DROP NOT NULL;
ALTER TABLE public.financial_professional_rules ALTER COLUMN start_date DROP NOT NULL;

-- Recreate RPCs with parameter names the code uses
DROP FUNCTION IF EXISTS public.decide_earning(uuid, text, text);
CREATE OR REPLACE FUNCTION public.decide_earning(_earning_id uuid, _action text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_status text;
BEGIN
  new_status := CASE _action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'canceled' ELSE _action END;
  UPDATE public.financial_professional_earnings SET lifecycle_status = new_status, updated_at = now() WHERE id = _earning_id;
  INSERT INTO public.financial_professional_earnings_events(earning_id, event_type, to_status, actor_id, notes)
  VALUES (_earning_id, 'decide', new_status, auth.uid(), _notes);
  RETURN jsonb_build_object('success', true, 'to', new_status);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_earning(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.decide_approval(uuid, text, text);
CREATE OR REPLACE FUNCTION public.decide_approval(_approval_id uuid, _action text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.financial_approvals SET status = _action, decided_at = now(), decided_by = auth.uid(), decision_notes = _notes, updated_at = now() WHERE id = _approval_id;
  INSERT INTO public.financial_approval_history(approval_id, action, actor_id, to_status, notes)
  VALUES (_approval_id, 'decide', auth.uid(), _action, _notes);
  RETURN jsonb_build_object('success', true, 'to', _action);
END $$;
GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.wallet_post_movement(uuid, numeric, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.wallet_post_movement(_wallet_id uuid, _amount numeric, _kind text, _notes text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_wallets SET balance = COALESCE(balance,0) + _amount, updated_at = now() WHERE id = _wallet_id;
  INSERT INTO public.user_wallet_movements(wallet_id, amount, kind, notes, metadata, created_by)
  VALUES (_wallet_id, _amount, _kind, _notes, _metadata, auth.uid());
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.wallet_post_movement(uuid, numeric, text, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.wallet_transfer(uuid, uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.wallet_transfer(_from_wallet uuid, _to_wallet uuid, _amount numeric, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wallet_post_movement(_from_wallet, -_amount, 'transfer_out', _notes, jsonb_build_object('to', _to_wallet));
  PERFORM public.wallet_post_movement(_to_wallet, _amount, 'transfer_in', _notes, jsonb_build_object('from', _from_wallet));
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.wallet_transfer(uuid, uuid, numeric, text) TO authenticated;
