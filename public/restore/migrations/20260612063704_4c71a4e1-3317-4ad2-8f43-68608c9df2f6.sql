ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipient can view their own notifications" ON public.notifications;
CREATE POLICY "Recipient can view their own notifications" ON public.notifications 
FOR SELECT USING (auth.uid() = recipient_id OR recipient_id IS NULL);

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Anyone can insert notifications" ON public.notifications 
FOR INSERT WITH CHECK (auth.uid() = sender_id);

GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;