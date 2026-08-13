-- 1. Garantir que novos casos de Solicitantes comecem como 'pendente'
ALTER TABLE public.cases ALTER COLUMN status SET DEFAULT 'pendente';

-- 2. Mover casos existentes sem protético (cadista) e criados por Solicitantes para 'pendente'
UPDATE public.cases 
SET status = 'pendente' 
WHERE status = 'em_andamento' 
  AND cadista_id IS NULL 
  AND requested_by IN (
    SELECT id FROM public.profiles WHERE role = 'SOLICITANTE'
  );

-- 3. Ajustar políticas de RLS para Solicitantes
-- Garantir que não vejam casos cancelados (zumbis)
DROP POLICY IF EXISTS "Solicitantes view own cases" ON public.cases;
CREATE POLICY "Solicitantes view own cases"
ON public.cases
FOR SELECT
TO authenticated
USING (
    (requested_by = auth.uid() AND status != 'cancelado') OR
    (public.has_role(auth.uid(), 'admin')) OR
    (public.has_role(auth.uid(), 'cadista'))
);

-- Permitir que Solicitantes cancelem (excluam visualmente) seus próprios casos
DROP POLICY IF EXISTS "Solicitantes can cancel own cases" ON public.cases;
CREATE POLICY "Solicitantes can cancel own cases"
ON public.cases
FOR UPDATE
TO authenticated
USING (requested_by = auth.uid())
WITH CHECK (requested_by = auth.uid());
