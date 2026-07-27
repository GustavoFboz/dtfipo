
-- =========================================================================
-- CARTEIRA PROFISSIONAL — banco interno por usuário/empresa
-- =========================================================================

-- 1) user_wallets ---------------------------------------------------------
CREATE TABLE public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'BRL',
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance   numeric(14,2) NOT NULL DEFAULT 0,
  blocked_balance   numeric(14,2) NOT NULL DEFAULT 0,
  paid_balance      numeric(14,2) NOT NULL DEFAULT 0,
  future_balance    numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- Dono vê a própria carteira; admin da empresa vê todas
CREATE POLICY user_wallets_view ON public.user_wallets
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  );

-- Somente admin da empresa gerencia (cria/edita/deleta) carteiras
CREATE POLICY user_wallets_manage ON public.user_wallets
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin());

CREATE INDEX idx_user_wallets_clinic ON public.user_wallets(clinic_id);
CREATE INDEX idx_user_wallets_user ON public.user_wallets(user_id);
CREATE TRIGGER trg_user_wallets_updated
  BEFORE UPDATE ON public.user_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) user_wallet_movements ------------------------------------------------
CREATE TABLE public.user_wallet_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Classificação da movimentação
  type text NOT NULL CHECK (type IN (
    'credit','debit','transfer_in','transfer_out',
    'advance','discount','bonus','retention',
    'adjustment','reversal'
  )),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'pending','confirmed','blocked','paid','scheduled','canceled','reversed'
  )),

  -- Qual saldo é afetado
  balance_bucket text NOT NULL CHECK (balance_bucket IN (
    'available','pending','blocked','paid','future'
  )),

  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',

  -- Fotografia dos valores anterior e atual do bucket afetado
  balance_before numeric(14,2) NOT NULL DEFAULT 0,
  balance_after  numeric(14,2) NOT NULL DEFAULT 0,

  -- Rastreabilidade / origem
  source text,                 -- ex: 'case', 'manual', 'payment_request', 'transfer', 'rule'
  source_id uuid,              -- id genérico da origem
  reference text,              -- código externo, número de nota, etc
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  related_wallet_id uuid REFERENCES public.user_wallets(id) ON DELETE SET NULL,
  reversed_by uuid REFERENCES public.user_wallet_movements(id) ON DELETE SET NULL,

  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_wallet_movements TO authenticated;
GRANT ALL ON public.user_wallet_movements TO service_role;
ALTER TABLE public.user_wallet_movements ENABLE ROW LEVEL SECURITY;

-- Dono vê os próprios movimentos; admin vê todos da empresa
CREATE POLICY user_wallet_mov_view ON public.user_wallet_movements
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  );

-- Somente admin insere/edita/deleta. Nunca editar histórico salvo estorno (feito por INSERT).
CREATE POLICY user_wallet_mov_manage ON public.user_wallet_movements
  FOR ALL TO authenticated
  USING (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin())
  WITH CHECK (clinic_id = public.current_user_clinic_id() AND public.current_user_is_admin());

CREATE INDEX idx_uwm_wallet ON public.user_wallet_movements(wallet_id, occurred_at DESC);
CREATE INDEX idx_uwm_clinic ON public.user_wallet_movements(clinic_id, occurred_at DESC);
CREATE INDEX idx_uwm_user   ON public.user_wallet_movements(user_id, occurred_at DESC);
CREATE INDEX idx_uwm_status ON public.user_wallet_movements(clinic_id, status);
CREATE INDEX idx_uwm_source ON public.user_wallet_movements(source, source_id);
CREATE TRIGGER trg_uwm_updated
  BEFORE UPDATE ON public.user_wallet_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Trigger: aplica movimento e grava valores anterior/atual -------------
CREATE OR REPLACE FUNCTION public.apply_user_wallet_movement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w RECORD;
  delta numeric(14,2);
  before_val numeric(14,2);
  after_val numeric(14,2);
BEGIN
  SELECT * INTO w FROM public.user_wallets WHERE id = NEW.wallet_id FOR UPDATE;
  IF w IS NULL THEN
    RAISE EXCEPTION 'Carteira % não encontrada', NEW.wallet_id;
  END IF;

  -- Coerência: user_id e clinic_id do movimento seguem a carteira
  NEW.user_id := w.user_id;
  NEW.clinic_id := w.clinic_id;

  delta := CASE WHEN NEW.direction = 'in' THEN ABS(NEW.amount) ELSE -ABS(NEW.amount) END;

  before_val := CASE NEW.balance_bucket
    WHEN 'available' THEN w.available_balance
    WHEN 'pending'   THEN w.pending_balance
    WHEN 'blocked'   THEN w.blocked_balance
    WHEN 'paid'      THEN w.paid_balance
    WHEN 'future'    THEN w.future_balance
  END;
  after_val := before_val + delta;

  NEW.balance_before := before_val;
  NEW.balance_after  := after_val;

  UPDATE public.user_wallets SET
    available_balance = CASE WHEN NEW.balance_bucket='available' THEN after_val ELSE available_balance END,
    pending_balance   = CASE WHEN NEW.balance_bucket='pending'   THEN after_val ELSE pending_balance   END,
    blocked_balance   = CASE WHEN NEW.balance_bucket='blocked'   THEN after_val ELSE blocked_balance   END,
    paid_balance      = CASE WHEN NEW.balance_bucket='paid'      THEN after_val ELSE paid_balance      END,
    future_balance    = CASE WHEN NEW.balance_bucket='future'    THEN after_val ELSE future_balance    END,
    updated_at = now()
  WHERE id = w.id;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_apply_user_wallet_movement
  BEFORE INSERT ON public.user_wallet_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_user_wallet_movement();

-- 4) RPC helper: garante carteira do usuário ------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_wallet(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_wallet uuid;
BEGIN
  SELECT clinic_id INTO v_clinic FROM public.profiles WHERE id = _user_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada';
  END IF;

  SELECT id INTO v_wallet FROM public.user_wallets
    WHERE user_id = _user_id AND clinic_id = v_clinic;

  IF v_wallet IS NULL THEN
    INSERT INTO public.user_wallets (clinic_id, user_id)
    VALUES (v_clinic, _user_id)
    RETURNING id INTO v_wallet;
  END IF;

  RETURN v_wallet;
END $$;

-- 5) RPC: transferência interna entre carteiras (mesma empresa) ----------
CREATE OR REPLACE FUNCTION public.transfer_user_wallet(
  _from_wallet uuid,
  _to_wallet uuid,
  _amount numeric,
  _description text DEFAULT NULL,
  _reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  wf RECORD; wt RECORD; v_out uuid; v_in uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;

  SELECT * INTO wf FROM public.user_wallets WHERE id = _from_wallet;
  SELECT * INTO wt FROM public.user_wallets WHERE id = _to_wallet;
  IF wf IS NULL OR wt IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carteira inválida');
  END IF;
  IF wf.clinic_id <> wt.clinic_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carteiras de empresas diferentes');
  END IF;
  IF NOT public.current_user_is_admin() OR wf.clinic_id <> public.current_user_clinic_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  IF wf.available_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;

  INSERT INTO public.user_wallet_movements(
    clinic_id, wallet_id, user_id, type, direction, status, balance_bucket,
    amount, source, reference, related_wallet_id, description, created_by
  ) VALUES (
    wf.clinic_id, wf.id, wf.user_id, 'transfer_out', 'out', 'confirmed', 'available',
    _amount, 'transfer', _reference, wt.id, _description, auth.uid()
  ) RETURNING id INTO v_out;

  INSERT INTO public.user_wallet_movements(
    clinic_id, wallet_id, user_id, type, direction, status, balance_bucket,
    amount, source, reference, related_wallet_id, description, created_by
  ) VALUES (
    wt.clinic_id, wt.id, wt.user_id, 'transfer_in', 'in', 'confirmed', 'available',
    _amount, 'transfer', _reference, wf.id, _description, auth.uid()
  ) RETURNING id INTO v_in;

  RETURN jsonb_build_object('success', true, 'out_id', v_out, 'in_id', v_in);
END $$;
