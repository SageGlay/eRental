-- Requires the existing eRental marketplace, including the hardened verification RPC.
-- Apply as one transaction (Supabase CLI db push, or psql --single-transaction).
-- All handlers observe successful source writes. Nothing is backfilled.
DO $preflight$
DECLARE
  relation text;
  required record;
BEGIN
  FOREACH relation IN ARRAY ARRAY['profiles','listings','bookings','conversations','messages',
                                  'simulated_payments','verification_submissions'] LOOP
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_class
                   WHERE oid = pg_catalog.to_regclass('public.' || relation)
                     AND relkind = 'r' AND relrowsecurity) THEN
      RAISE EXCEPTION 'Expected existing RLS-protected public.% table. Compare the staging catalog.', relation;
    END IF;
  END LOOP;
  FOR required IN SELECT * FROM (VALUES
    ('profiles','id'),('listings','id'),('listings','owner_id'),
    ('bookings','id'),('bookings','listing_id'),('bookings','renter_id'),('bookings','owner_id'),
    ('conversations','id'),('conversations','listing_id'),('conversations','renter_id'),('conversations','owner_id'),
    ('messages','id'),('messages','conversation_id'),('messages','sender_id'),
    ('simulated_payments','booking_id'),('verification_submissions','id'),
    ('verification_submissions','user_id'),('verification_submissions','reviewed_by')
  ) AS columns(tbl,col) LOOP
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_attribute
                   WHERE attrelid = pg_catalog.to_regclass('public.' || required.tbl)
                     AND attname = required.col AND atttypid = 'uuid'::regtype AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Unexpected %.% identifier. Compare the staging catalog.', required.tbl, required.col;
    END IF;
  END LOOP;
  FOR required IN SELECT * FROM (VALUES
    ('listings','status'),('bookings','status'),('messages','body'),
    ('simulated_payments','status'),('verification_submissions','status')
  ) AS columns(tbl,col) LOOP
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
                   WHERE a.attrelid = pg_catalog.to_regclass('public.' || required.tbl)
                     AND a.attname = required.col AND NOT a.attisdropped
                     AND (t.typcategory = 'S' OR t.typtype = 'e')) THEN
      RAISE EXCEPTION 'Unexpected %.% type. Compare the staging catalog.', required.tbl, required.col;
    END IF;
  END LOOP;
  IF pg_catalog.to_regprocedure('public.review_verification(uuid,text,text)') IS NULL OR
     encode(sha256(convert_to(pg_catalog.pg_get_functiondef('public.review_verification(uuid,text,text)'::regprocedure),'UTF8')),'hex')
       IS DISTINCT FROM 'cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7' THEN
    RAISE EXCEPTION 'Verify and deploy the reviewed verification hardening before installing notifications.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_attribute WHERE attrelid = 'public.listings'::regclass
                 AND attname = 'removed_by_admin' AND atttypid = 'boolean'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Expected the listing removal flag. Compare the staging catalog.';
  END IF;
  FOREACH relation IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(relation, 'public.simulated_payments', 'INSERT,UPDATE')
       OR has_table_privilege(relation, 'public.simulated_payments', 'DELETE,TRUNCATE')
       OR has_any_column_privilege(relation, 'public.verification_submissions', 'UPDATE')
       OR has_column_privilege(relation,'public.verification_submissions','status','INSERT') THEN
      RAISE EXCEPTION 'Unexpected client writes on trusted workflow data. Review source grants on staging.';
    END IF;
  END LOOP;
END;
$preflight$;

CREATE TABLE public.saved_listings (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX saved_listings_timeline_idx ON public.saved_listings(user_id, created_at DESC, listing_id);
CREATE INDEX saved_listings_listing_idx ON public.saved_listings(listing_id);
ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.saved_listings TO authenticated;
GRANT INSERT (user_id, listing_id) ON public.saved_listings TO authenticated;
CREATE POLICY saved_read ON public.saved_listings FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY saved_add ON public.saved_listings FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT FROM public.listings AS l WHERE l.id = listing_id AND l.status IN ('available','unavailable') AND NOT l.removed_by_admin
  )
);
CREATE POLICY saved_remove ON public.saved_listings FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE TABLE public.recently_viewed_listings (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 12),
  PRIMARY KEY (user_id, listing_id),
  UNIQUE (user_id, slot)
);
CREATE INDEX recently_viewed_timeline_idx ON public.recently_viewed_listings(user_id, viewed_at DESC, listing_id);
CREATE INDEX recently_viewed_listing_idx ON public.recently_viewed_listings(listing_id);
ALTER TABLE public.recently_viewed_listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recently_viewed_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT (user_id,listing_id,viewed_at), DELETE ON public.recently_viewed_listings TO authenticated;
GRANT INSERT(listing_id) ON public.recently_viewed_listings TO authenticated;
CREATE POLICY history_read ON public.recently_viewed_listings FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY history_record ON public.recently_viewed_listings FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT FROM public.listings AS l WHERE l.id = listing_id AND l.status IN ('available','unavailable') AND NOT l.removed_by_admin
  )
);
CREATE POLICY history_clear ON public.recently_viewed_listings FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- This schema contains only trigger handlers. It is private even on projects with
-- permissive default privileges on newly created functions.
CREATE SCHEMA erental_events;
REVOKE ALL ON SCHEMA erental_events FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION erental_events.bound_listing_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  viewer uuid := auth.uid();
BEGIN
  IF viewer IS NULL OR viewer IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'An authenticated viewing account is required.' USING ERRCODE = '42501';
  END IF;
  -- Unique actor lock also works for the very first history entry.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(viewer::text, 20261125));
  DELETE FROM public.recently_viewed_listings WHERE user_id = viewer AND listing_id = NEW.listing_id;
  DELETE FROM public.recently_viewed_listings h WHERE h.user_id = viewer AND h.listing_id IN (
    SELECT prior.listing_id FROM public.recently_viewed_listings prior WHERE prior.user_id = viewer
    ORDER BY prior.viewed_at DESC, prior.listing_id OFFSET 11
  );
  -- Twelve unique positions bound the collection even if a stricter isolation
  -- level needs to abort a simultaneous write using an older snapshot.
  SELECT available INTO NEW.slot FROM generate_series(1,12) AS slots(available)
    WHERE NOT EXISTS (SELECT FROM public.recently_viewed_listings prior
                      WHERE prior.user_id = viewer AND prior.slot = available)
    ORDER BY available LIMIT 1;
  NEW.viewed_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER bound_listing_history BEFORE INSERT ON public.recently_viewed_listings
FOR EACH ROW EXECUTE FUNCTION erental_events.bound_listing_history();

CREATE FUNCTION public.record_listing_view(p_listing_id uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.recently_viewed_listings(listing_id) VALUES (p_listing_id);
$$;
REVOKE ALL ON FUNCTION public.record_listing_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_listing_view(uuid) TO authenticated;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'booking_requested','booking_accepted','booking_rejected','booking_cancelled','rental_completed',
    'inquiry_received','message_received','simulated_payment_recorded','simulated_refund_recorded',
    'verification_approved','verification_rejected'
  )),
  recipient_role text NOT NULL CHECK (recipient_role IN ('owner','renter','applicant')),
  entity_id uuid NOT NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(recipient_id, event_key)
);
CREATE UNIQUE INDEX notifications_first_inquiry_idx ON public.notifications(entity_id) WHERE event_type = 'inquiry_received';
CREATE INDEX notifications_timeline_idx ON public.notifications(recipient_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread_idx ON public.notifications(recipient_id, created_at DESC, id DESC) WHERE read_at IS NULL;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, recipient_id, event_type, recipient_role, entity_id, created_at, read_at) ON public.notifications TO authenticated;
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING (recipient_id = (SELECT auth.uid()));

CREATE FUNCTION public.mark_notification_read(p_notification_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient uuid := auth.uid();
BEGIN
  IF recipient IS NULL THEN RAISE EXCEPTION 'Sign in to update notifications.' USING ERRCODE = '42501'; END IF;
  UPDATE public.notifications SET read_at = coalesce(read_at, now()) WHERE id = p_notification_id AND recipient_id = recipient;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification unavailable.' USING ERRCODE = '42501'; END IF;
END;
$$;
CREATE FUNCTION public.mark_all_notifications_read() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient uuid := auth.uid();
BEGIN
  IF recipient IS NULL THEN RAISE EXCEPTION 'Sign in to update notifications.' USING ERRCODE = '42501'; END IF;
  UPDATE public.notifications SET read_at = now() WHERE recipient_id = recipient AND read_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid), public.mark_all_notifications_read()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid), public.mark_all_notifications_read() TO authenticated;

-- The row shape carries no user-authored text, Storage key, or URL. Only the
-- following transaction-owned trigger functions call this schema-private writer.
CREATE FUNCTION erental_events.emit(recipient uuid, recipient_role text, event_type text, entity uuid, source_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  delivery_key text := CASE WHEN event_type IN ('inquiry_received','message_received')
                            THEN 'message' ELSE event_type END || ':' || source_id::text;
BEGIN
  INSERT INTO public.notifications(recipient_id, recipient_role, event_type, entity_id, event_key)
    VALUES (recipient, recipient_role, event_type, entity, delivery_key) ON CONFLICT DO NOTHING;
  IF NOT FOUND AND event_type = 'inquiry_received' THEN
    -- A thread can receive only one inquiry. A distinct confirmed message
    -- still merits delivery, even if a prior inquiry's source was removed.
    INSERT INTO public.notifications(recipient_id, recipient_role, event_type, entity_id, event_key)
      VALUES (recipient, recipient_role, 'message_received', entity, delivery_key) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE FUNCTION erental_events.booking_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  kind text;
BEGIN
  IF actor IS NULL OR NEW.owner_id IS NULL OR NEW.renter_id IS NULL
     OR NEW.owner_id = NEW.renter_id OR actor NOT IN (NEW.owner_id, NEW.renter_id)
     OR NOT EXISTS (SELECT FROM public.listings WHERE id = NEW.listing_id AND owner_id = NEW.owner_id) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF actor = NEW.renter_id AND NEW.status = 'pending' THEN kind := 'booking_requested'; END IF;
  ELSIF OLD.owner_id = NEW.owner_id AND OLD.renter_id = NEW.renter_id AND OLD.listing_id = NEW.listing_id THEN
    IF OLD.status = 'pending' AND NEW.status = 'accepted' AND actor = NEW.owner_id THEN kind := 'booking_accepted';
    ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' AND actor = NEW.owner_id THEN kind := 'booking_rejected';
    ELSIF NEW.status = 'cancelled' AND (OLD.status = 'accepted' OR (OLD.status = 'pending' AND actor = NEW.renter_id)) THEN kind := 'booking_cancelled';
    ELSIF OLD.status = 'accepted' AND NEW.status = 'completed' AND actor = NEW.owner_id THEN kind := 'rental_completed';
    END IF;
  END IF;
  IF kind IS NOT NULL THEN
    IF actor = NEW.renter_id THEN
      PERFORM erental_events.emit(NEW.owner_id, 'owner', kind, NEW.id, NEW.id);
    ELSE
      PERFORM erental_events.emit(NEW.renter_id, 'renter', kind, NEW.id, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER erental_booking_event AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION erental_events.booking_event();

CREATE FUNCTION erental_events.message_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  thread record;
  item record;
  new_inquiry boolean;
  kind text;
BEGIN
  IF actor IS NULL THEN RETURN NULL; END IF;
  -- Transition rows include only successfully inserted messages. Lock threads
  -- in a stable order and exclude the whole incoming batch from prior history.
  FOR thread IN
    SELECT c.id, c.owner_id, c.renter_id FROM public.conversations c
    JOIN public.listings l ON l.id = c.listing_id AND l.owner_id = c.owner_id
    WHERE c.id IN (SELECT conversation_id FROM added_messages WHERE sender_id = actor)
      AND c.owner_id <> c.renter_id AND actor IN (c.owner_id, c.renter_id)
    ORDER BY c.id FOR NO KEY UPDATE OF c
  LOOP
    SELECT NOT EXISTS (
      SELECT FROM public.messages m WHERE m.conversation_id = thread.id
        AND nullif(btrim(m.body),'') IS NOT NULL
        AND NOT EXISTS (SELECT FROM added_messages a WHERE a.id = m.id)
    ) INTO new_inquiry;
    FOR item IN SELECT id FROM added_messages WHERE conversation_id = thread.id
                  AND sender_id = actor AND nullif(btrim(body),'') IS NOT NULL ORDER BY id LOOP
      kind := CASE WHEN new_inquiry THEN 'inquiry_received' ELSE 'message_received' END;
      IF actor = thread.renter_id THEN
        PERFORM erental_events.emit(thread.owner_id, 'owner', kind, thread.id, item.id);
      ELSE
        PERFORM erental_events.emit(thread.renter_id, 'renter', kind, thread.id, item.id);
      END IF;
      new_inquiry := false;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER erental_message_event AFTER INSERT ON public.messages
REFERENCING NEW TABLE AS added_messages FOR EACH STATEMENT EXECUTE FUNCTION erental_events.message_event();

CREATE FUNCTION erental_events.simulation_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  owner uuid;
  renter uuid;
  kind text;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.booking_id IS DISTINCT FROM OLD.booking_id) THEN RETURN NEW; END IF;
  SELECT b.owner_id, b.renter_id INTO owner, renter FROM public.bookings b
    JOIN public.listings l ON l.id = b.listing_id AND l.owner_id = b.owner_id WHERE b.id = NEW.booking_id;
  IF NOT FOUND OR actor NOT IN (owner,renter) OR owner = renter THEN RETURN NEW; END IF;
  IF NEW.status = 'simulated_paid' AND actor = renter THEN kind := 'simulated_payment_recorded';
  ELSIF NEW.status = 'simulated_refunded' THEN kind := 'simulated_refund_recorded';
  ELSE RETURN NEW; END IF;
  -- Rental and deposit lines are part of the one simulated booking payment.
  IF actor = renter THEN
    PERFORM erental_events.emit(owner, 'owner', kind, NEW.booking_id, NEW.booking_id);
  ELSE
    PERFORM erental_events.emit(renter, 'renter', kind, NEW.booking_id, NEW.booking_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER erental_simulation_event AFTER INSERT OR UPDATE OF status ON public.simulated_payments
FOR EACH ROW EXECUTE FUNCTION erental_events.simulation_event();

CREATE FUNCTION erental_events.verification_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF OLD.status = 'pending' AND NEW.status IN ('approved','rejected') AND actor IS NOT NULL
     AND NEW.reviewed_by = actor AND (SELECT public.is_admin()) IS TRUE AND NEW.user_id = OLD.user_id THEN
    PERFORM erental_events.emit(NEW.user_id, 'applicant', 'verification_' || NEW.status::text, NEW.id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER erental_verification_event AFTER UPDATE OF status ON public.verification_submissions
FOR EACH ROW EXECUTE FUNCTION erental_events.verification_event();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erental_events FROM PUBLIC, anon, authenticated, service_role;
