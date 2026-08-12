-- Add 'SOLICITANTE' to app_role enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'solicitante') THEN
        ALTER TYPE public.app_role ADD VALUE 'solicitante';
    END IF;
END $$;

-- Add a column to track who requested the case if not already there
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id);

-- Policy to allow SOLICITANTE to create cases (requests)
-- They can insert into cases
CREATE POLICY "Solicitantes can create cases" ON public.cases
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'solicitante'));

-- Policy to allow SOLICITANTE to see their cases
CREATE POLICY "Solicitantes can view their own cases" ON public.cases
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'solicitante') AND 
  (requested_by = auth.uid() OR auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = cases.cadista_id))
);

-- Policy to allow SOLICITANTE to update their cases IF not accepted
CREATE POLICY "Solicitantes can update pending cases" ON public.cases
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'solicitante') AND 
  requested_by = auth.uid() AND
  cadista_id IS NULL -- cadista_id being NULL means it hasn't been accepted by a protetico
)
WITH CHECK (
  public.has_role(auth.uid(), 'solicitante') AND 
  requested_by = auth.uid()
);

-- Trigger to notify Proteticos (CADISTA role) when a new request is made
CREATE OR REPLACE FUNCTION public.notify_proteticos_new_request()
RETURNS TRIGGER AS $$
DECLARE
    protetico_record RECORD;
BEGIN
    IF (NEW.requested_by IS NOT NULL AND NEW.cadista_id IS NULL) THEN
        FOR protetico_record IN 
            SELECT id
            FROM public.profiles
            WHERE role = 'CADISTA'
        LOOP
            INSERT INTO public.notifications (
                id, recipient_id, sender_id, title, content, type, metadata
            ) VALUES (
                gen_random_uuid(),
                protetico_record.id,
                NEW.requested_by,
                'Nova Solicitação de Caso',
                'Um novo caso foi solicitado e aguarda aceitação.',
                'case_request',
                jsonb_build_object('case_id', NEW.id)
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_case_requested ON public.cases;
CREATE TRIGGER on_case_requested
    AFTER INSERT ON public.cases
    FOR EACH ROW EXECUTE FUNCTION public.notify_proteticos_new_request();
