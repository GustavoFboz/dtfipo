-- Garantir colunas na tabela notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Garantir coluna na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"prosthesis_updates": true}'::jsonb;

-- Garantir publicação Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- Ajustar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipient can view their own notifications" ON public.notifications;
CREATE POLICY "Recipient can view their own notifications" ON public.notifications 
FOR SELECT USING (auth.uid() = recipient_id OR recipient_id IS NULL);

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Anyone can insert notifications" ON public.notifications 
FOR INSERT WITH CHECK (true); -- Permitir que qualquer usuário autenticado envie notificações

-- Grants
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;