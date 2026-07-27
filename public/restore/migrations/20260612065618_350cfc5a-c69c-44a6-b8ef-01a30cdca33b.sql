-- Permitir que todos os usuários autenticados vejam os perfis básicos
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles
FOR SELECT TO authenticated USING (true);

-- Garantir que as notificações possam ser inseridas pelo remetente
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;
CREATE POLICY "Users can create notifications" ON public.notifications
FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Garantir que o CEO e outros possam ver notificações enviadas para eles ou públicas
DROP POLICY IF EXISTS "Recipient can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
FOR SELECT TO authenticated USING (recipient_id = auth.uid() OR recipient_id IS NULL);

GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
