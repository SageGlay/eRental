-- Fixture-only adapter for the later deployed messaging prerequisite. Real
-- source policies and triggers must be confirmed against designated staging.
ALTER TABLE public.conversations ADD COLUMN last_message_at timestamptz DEFAULT now();
ALTER TABLE public.conversations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.messages ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX fixture_conversation_renter_listing ON public.conversations(renter_id, listing_id);
GRANT SELECT ON public.conversations, public.messages TO authenticated;
GRANT INSERT (id, listing_id, renter_id, owner_id) ON public.conversations TO authenticated;
GRANT INSERT (id, conversation_id, sender_id, body, created_at, read_at) ON public.messages TO authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
CREATE POLICY fixture_conversations_select ON public.conversations FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (renter_id, owner_id));
CREATE POLICY fixture_conversations_create ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (renter_id = (SELECT auth.uid()));
CREATE POLICY fixture_messages_select ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT FROM public.conversations WHERE id = conversation_id
    AND (SELECT auth.uid()) IN (renter_id, owner_id)));
CREATE POLICY fixture_messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND EXISTS (
    SELECT FROM public.conversations WHERE id = conversation_id));
CREATE POLICY fixture_messages_read ON public.messages FOR UPDATE TO authenticated
  USING (sender_id <> (SELECT auth.uid()))
  WITH CHECK (sender_id <> (SELECT auth.uid()));

CREATE FUNCTION public.fixture_touch_conversation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.fixture_touch_conversation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fixture_message_touch AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fixture_touch_conversation();
CREATE PUBLICATION supabase_realtime;
