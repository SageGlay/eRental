-- Operational rollback after reverting the client. Pause delivery and freeze
-- user writes while retaining every saved listing, history row and notification.
-- Run as one transaction (psql --single-transaction or the SQL Editor).
DO $pause$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('public.bookings'::regclass, 'erental_booking_event','erental_events.booking_event()'::regprocedure),
    ('public.messages'::regclass, 'erental_message_event','erental_events.message_event()'::regprocedure),
    ('public.simulated_payments'::regclass, 'erental_simulation_event','erental_events.simulation_event()'::regprocedure),
    ('public.verification_submissions'::regclass, 'erental_verification_event','erental_events.verification_event()'::regprocedure)
  ) AS expected(tbl, trigger_name, handler) LOOP
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_trigger
                   WHERE tgrelid = item.tbl AND tgname = item.trigger_name AND tgfoid = item.handler) THEN
      RAISE EXCEPTION 'Unexpected marketplace trigger on %. Stop and inspect the catalog.', item.tbl;
    END IF;
  END LOOP;

  ALTER TABLE public.bookings DISABLE TRIGGER erental_booking_event;
  ALTER TABLE public.messages DISABLE TRIGGER erental_message_event;
  ALTER TABLE public.simulated_payments DISABLE TRIGGER erental_simulation_event;
  ALTER TABLE public.verification_submissions DISABLE TRIGGER erental_verification_event;
  REVOKE INSERT(user_id,listing_id), DELETE ON public.saved_listings FROM authenticated;
  REVOKE INSERT(listing_id), DELETE ON public.recently_viewed_listings FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.record_listing_view(uuid), public.mark_notification_read(uuid),
    public.mark_all_notifications_read() FROM authenticated;
END;
$pause$;
