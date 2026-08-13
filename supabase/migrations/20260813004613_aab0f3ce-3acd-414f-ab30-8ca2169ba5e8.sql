-- Move cases from Solicitantes that are still in 'em_andamento' without a cadista to 'pendente'
UPDATE public.cases 
SET status = 'pendente', updated_at = NOW()
WHERE status = 'em_andamento' 
  AND cadista_id IS NULL 
  AND requested_by IN (
    SELECT id FROM public.profiles WHERE role = 'SOLICITANTE'
  );

-- Ensure all cases without a cadista_id and requested by a Solicitante are marked as 'pendente'
-- regardless of previous status (except finished/archived/cancelled if they exist)
UPDATE public.cases 
SET status = 'pendente', updated_at = NOW()
WHERE status NOT IN ('finalizado', 'finished', 'arquivado', 'cancelado')
  AND cadista_id IS NULL 
  AND requested_by IN (
    SELECT id FROM public.profiles WHERE role = 'SOLICITANTE'
  );
