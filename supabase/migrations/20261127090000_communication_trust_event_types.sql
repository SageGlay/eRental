-- Requires the checked-in verification and Marketplace Essentials migrations.
-- This expands vocabulary only. Notification rows, rights and read state stay intact.
DO $preflight$
BEGIN
  IF to_regclass('public.notifications') IS NULL
     OR to_regprocedure('erental_events.emit(uuid,text,text,uuid,uuid)') IS NULL
     OR to_regprocedure('public.mark_notification_read(uuid)') IS NULL
     OR to_regprocedure('public.mark_all_notifications_read()') IS NULL
     OR NOT EXISTS (
       SELECT FROM pg_catalog.pg_class
       WHERE oid = to_regclass('public.notifications') AND relrowsecurity
     ) THEN
    RAISE EXCEPTION 'Install and verify Marketplace Essentials before communication and trust.';
  END IF;
  IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(
       'public.review_verification(uuid,text,text)'
     )), 'UTF8')), 'hex')
     IS DISTINCT FROM 'cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7' THEN
    RAISE EXCEPTION 'Verification review differs from the hardened prerequisite.';
  END IF;
  IF has_any_column_privilege('anon', 'public.notifications', 'SELECT,INSERT,UPDATE')
     OR has_any_column_privilege('authenticated', 'public.notifications', 'INSERT,UPDATE')
     OR has_table_privilege('authenticated', 'public.notifications', 'DELETE,TRUNCATE')
     OR has_schema_privilege('authenticated', 'erental_events', 'USAGE')
     OR has_schema_privilege('anon', 'erental_events', 'USAGE') THEN
    RAISE EXCEPTION 'Unexpected notification client permissions. Inspect the deployed catalog.';
  END IF;
END;
$preflight$;

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_event_type_check,
  ADD CONSTRAINT notifications_event_type_check CHECK (event_type IN (
    'booking_requested','booking_accepted','booking_rejected','booking_cancelled','rental_completed',
    'inquiry_received','message_received','simulated_payment_recorded','simulated_refund_recorded',
    'verification_approved','verification_rejected',
    'viewing_requested','viewing_confirmed','viewing_declined','viewing_reschedule_proposed',
    'viewing_reschedule_accepted','viewing_reschedule_declined','viewing_cancelled','viewing_completed',
    'review_published','review_response_published','review_dispute_resolved','review_visibility_updated',
    'conversation_report_resolved'
  )),
  DROP CONSTRAINT notifications_recipient_role_check,
  ADD CONSTRAINT notifications_recipient_role_check CHECK (
    recipient_role IN ('owner','renter','applicant','reporter')
  );
