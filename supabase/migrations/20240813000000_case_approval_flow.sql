-- Atualiza o tipo enum se necessário (já deve existir, mas garantimos)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'cadista', 'solicitante');
    END IF;
END $$;

-- Garante que novos casos de solicitantes comecem como 'pendente'
ALTER TABLE public.cases ALTER COLUMN status SET DEFAULT 'pendente';

-- Função para aceitar uma solicitação de caso
CREATE OR REPLACE FUNCTION public.accept_case_request(p_case_id UUID, p_cadista_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.cases
    SET 
        cadista_id = p_cadista_id,
        status = 'em_andamento',
        updated_at = NOW()
    WHERE id = p_case_id 
      AND (cadista_id IS NULL OR status = 'pendente');

    -- Notifica o solicitante (opcional, mas recomendado)
    -- INSERT INTO notifications ...
END;
$$;

-- Permissões para a função
GRANT EXECUTE ON FUNCTION public.accept_case_request(UUID, UUID) TO authenticated;

-- Ajusta RLS para solicitações pendentes
-- Protéticos devem ver casos onde cadista_id é nulo e status é pendente
DROP POLICY IF EXISTS "Staff can view pending requests" ON public.cases;
CREATE POLICY "Staff can view pending requests"
ON public.cases
FOR SELECT
TO authenticated
USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'cadista') OR
    (auth.uid() = requested_by)
);

-- Corrigir a trigger de notificação para garantir que chegue a todos os protéticos
CREATE OR REPLACE FUNCTION public.notify_proteticos_new_request()
RETURNS TRIGGER AS $$
DECLARE
    protetico_record RECORD;
BEGIN
    IF (NEW.requested_by IS NOT NULL AND NEW.cadista_id IS NULL) THEN
        FOR protetico_record IN 
            SELECT p.id 
            FROM public.profiles p
            JOIN public.user_roles ur ON p.id = ur.user_id
            WHERE ur.role IN ('admin', 'cadista')
        LOOP
            INSERT INTO public.notifications (
                recipient_id,
                sender_id,
                title,
                content,
                type,
                metadata
            ) VALUES (
                protetico_record.id,
                NEW.requested_by,
                'Nova Solicitação de Caso',
                'Um novo caso foi solicitado e aguarda aprovação.',
                'system',
                jsonb_build_object('case_id', NEW.id, 'action', 'approval_required')
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
