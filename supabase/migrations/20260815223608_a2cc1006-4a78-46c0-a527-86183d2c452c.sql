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

GRANT EXECUTE ON FUNCTION public.notify_proteticos_new_request() TO authenticated;

DROP TRIGGER IF EXISTS tr_notify_proteticos_new_request ON public.cases;
CREATE TRIGGER tr_notify_proteticos_new_request
AFTER INSERT ON public.cases
FOR EACH ROW
EXECUTE FUNCTION public.notify_proteticos_new_request();