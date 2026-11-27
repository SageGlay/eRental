-- Requires the preceding notification contract and the existing marketplace tables.
-- Install in one transaction using Supabase CLI or psql --single-transaction.
DO $preflight$
DECLARE
  required record;
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_class
    WHERE oid = pg_catalog.to_regclass('public.conversations') AND relrowsecurity AND relkind = 'r')
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_class
    WHERE oid = pg_catalog.to_regclass('public.messages') AND relrowsecurity AND relkind = 'r' AND relreplident <> 'n') THEN
    RAISE EXCEPTION 'Expected existing conversations and messages with RLS and message replica identity.';
  END IF;

  FOR required IN SELECT * FROM (VALUES
    ('conversations', 'id', 'uuid'), ('conversations', 'listing_id', 'uuid'),
    ('conversations', 'renter_id', 'uuid'), ('conversations', 'owner_id', 'uuid'),
    ('messages', 'id', 'uuid'), ('messages', 'conversation_id', 'uuid'),
    ('messages', 'sender_id', 'uuid'), ('messages', 'body', 'text'),
    ('messages', 'read_at', 'timestamp with time zone'), ('messages', 'created_at', 'timestamp with time zone')
  ) AS columns(table_name, column_name, type_name) LOOP
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_attribute
      WHERE attrelid = pg_catalog.to_regclass('public.' || required.table_name)
        AND attname = required.column_name
        AND atttypid = pg_catalog.to_regtype(required.type_name)
        AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Unexpected %.% column. Compare deployed messaging schema.', required.table_name, required.column_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
    ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.messages'::regclass AND i.indisprimary
      AND i.indnkeyatts = 1 AND a.attname = 'id') THEN
    RAISE EXCEPTION 'Expected public.messages.id to be its stable primary key.';
  END IF;
  IF pg_catalog.to_regprocedure('erental_events.emit(uuid,text,text,uuid,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Install the reviewed marketplace and administrator prerequisites first.';
  END IF;
END;
$preflight$;

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_reverse_idx ON public.user_blocks(blocked_id, blocker_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_blocks TO authenticated;
CREATE POLICY user_blocks_read_own ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

-- A real row update serializes both directions even across listings. Unlike an
-- advisory lock alone it also fails on a stale repeatable-read snapshot.
CREATE TABLE erental_events.contact_pairs (
  first_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  second_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lock_version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY (first_id, second_id),
  CHECK (first_id < second_id)
);
CREATE INDEX contact_pairs_second_idx ON erental_events.contact_pairs(second_id);
ALTER TABLE erental_events.contact_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erental_events.contact_pairs FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erental_events.lock_contact_pair(first_user uuid, second_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF first_user IS NULL OR second_user IS NULL OR first_user = second_user THEN
    RAISE EXCEPTION 'Contact is unavailable.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO erental_events.contact_pairs AS pair(first_id, second_id)
    VALUES (least(first_user, second_user), greatest(first_user, second_user))
    ON CONFLICT (first_id, second_id) DO UPDATE SET lock_version = pair.lock_version + 1;
END;
$$;

CREATE FUNCTION erental_events.contact_is_blocked(first_user uuid, second_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (SELECT FROM public.user_blocks
    WHERE (blocker_id = first_user AND blocked_id = second_user)
       OR (blocker_id = second_user AND blocked_id = first_user));
$$;

CREATE FUNCTION erental_events.assert_contact_allowed(first_user uuid, second_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM erental_events.lock_contact_pair(first_user, second_user);
  IF erental_events.contact_is_blocked(first_user, second_user) THEN
    RAISE EXCEPTION 'Contact is unavailable.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.set_user_block(p_user_id uuid, p_blocked boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR p_user_id IS NULL OR actor = p_user_id OR p_blocked IS NULL
      OR NOT EXISTS (SELECT FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'This account is unavailable.' USING ERRCODE = '42501';
  END IF;
  PERFORM erental_events.lock_contact_pair(actor, p_user_id);
  IF p_blocked THEN
    INSERT INTO public.user_blocks(blocker_id, blocked_id) VALUES (actor, p_user_id)
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  ELSE
    DELETE FROM public.user_blocks WHERE blocker_id = actor AND blocked_id = p_user_id;
  END IF;
END;
$$;

CREATE FUNCTION public.conversation_contact_status(p_conversation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  counterpart uuid;
BEGIN
  SELECT CASE WHEN renter_id = actor THEN owner_id ELSE renter_id END INTO counterpart
    FROM public.conversations WHERE id = p_conversation_id AND actor IN (renter_id, owner_id);
  IF NOT FOUND OR counterpart IS NULL THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'counterpart_id', counterpart,
    'contact_allowed', NOT erental_events.contact_is_blocked(actor, counterpart),
    'blocked_by_me', EXISTS (SELECT FROM public.user_blocks WHERE blocker_id = actor AND blocked_id = counterpart)
  );
END;
$$;

-- Recipient comes exclusively from the persisted conversation. Backfill old rows
-- before installing the write guards and enabling Realtime. Reject ambiguous
-- history rather than expose old data to a guessed recipient.
ALTER TABLE public.messages ADD COLUMN recipient_id uuid;
UPDATE public.messages AS message
  SET recipient_id = CASE WHEN message.sender_id = thread.renter_id THEN thread.owner_id ELSE thread.renter_id END
  FROM public.conversations AS thread
  WHERE message.conversation_id = thread.id
    AND message.sender_id IN (thread.renter_id, thread.owner_id) AND thread.renter_id <> thread.owner_id;
ALTER TABLE public.messages ALTER COLUMN recipient_id SET NOT NULL;
CREATE INDEX messages_recipient_unread_idx ON public.messages(recipient_id) WHERE read_at IS NULL;

CREATE POLICY trust_conversation_participant_select ON public.conversations AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING ((SELECT auth.uid()) IN (renter_id, owner_id));
CREATE POLICY trust_message_participant_select ON public.messages AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING ((SELECT auth.uid()) IN (sender_id, recipient_id));
CREATE POLICY trust_conversation_renter_insert ON public.conversations AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (renter_id = (SELECT auth.uid()) AND owner_id <> renter_id);
CREATE POLICY trust_message_sender_insert ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND EXISTS (
    SELECT FROM public.conversations AS thread WHERE thread.id = conversation_id
      AND ((thread.renter_id = sender_id AND thread.owner_id = recipient_id)
        OR (thread.owner_id = sender_id AND thread.renter_id = recipient_id))
  ));
CREATE POLICY trust_message_recipient_update ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid())) WITH CHECK (recipient_id = (SELECT auth.uid()));
CREATE POLICY trust_conversations_preserve_history ON public.conversations AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);
CREATE POLICY trust_messages_preserve_history ON public.messages AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

REVOKE DELETE, TRUNCATE, TRIGGER ON public.conversations FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER ON public.messages FROM PUBLIC, anon, authenticated;
DO $column_grants$
DECLARE
  columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO columns FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.messages'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE UPDATE (%s) ON public.messages FROM PUBLIC, anon, authenticated', columns);
END;
$column_grants$;
GRANT SELECT (recipient_id), UPDATE (read_at) ON public.messages TO authenticated;

CREATE FUNCTION erental_events.guard_conversation_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  rental_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.listing_id, NEW.renter_id, NEW.owner_id) IS DISTINCT FROM
       (OLD.id, OLD.listing_id, OLD.renter_id, OLD.owner_id) THEN
      RAISE EXCEPTION 'Conversation participants and rental cannot be changed.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT owner_id INTO rental_owner FROM public.listings
    WHERE id = NEW.listing_id AND status IN ('available','unavailable') AND NOT removed_by_admin;
  IF NOT FOUND OR actor IS DISTINCT FROM NEW.renter_id OR actor IS NULL
      OR (NEW.owner_id IS NOT NULL AND NEW.owner_id <> rental_owner) THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  PERFORM erental_events.assert_contact_allowed(actor, rental_owner);
  NEW.owner_id := rental_owner;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trust_conversation_write BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION erental_events.guard_conversation_write();

-- Check the final identity again after other existing BEFORE triggers. This
-- handler does not create or notify on any parent-table state change.
CREATE FUNCTION erental_events.confirm_conversation_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM NEW.renter_id OR NOT EXISTS (
    SELECT FROM public.listings WHERE id = NEW.listing_id AND owner_id = NEW.owner_id
      AND status IN ('available','unavailable') AND NOT removed_by_admin
  ) THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  IF erental_events.contact_is_blocked(NEW.renter_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Contact is unavailable.' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trust_conversation_confirm AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION erental_events.confirm_conversation_write();

CREATE FUNCTION erental_events.guard_message_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  counterpart uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.conversation_id, NEW.sender_id, NEW.recipient_id, NEW.body, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.conversation_id, OLD.sender_id, OLD.recipient_id, OLD.body, OLD.created_at) THEN
      RAISE EXCEPTION 'Sent messages cannot be changed.' USING ERRCODE = '42501';
    END IF;
    IF actor IS DISTINCT FROM OLD.recipient_id THEN
      RAISE EXCEPTION 'Only the recipient may mark the message as read.' USING ERRCODE = '42501';
    END IF;
    NEW.read_at := coalesce(OLD.read_at, clock_timestamp());
    RETURN NEW;
  END IF;

  IF actor IS NULL OR NEW.sender_id IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  SELECT CASE WHEN renter_id = actor THEN owner_id ELSE renter_id END INTO counterpart
    FROM public.conversations WHERE id = NEW.conversation_id AND actor IN (renter_id, owner_id);
  IF NOT FOUND OR counterpart IS NULL OR (NEW.recipient_id IS NOT NULL AND NEW.recipient_id <> counterpart) THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  IF NEW.body IS NULL OR NEW.body !~ '[^[:space:]]' OR char_length(NEW.body) > 2000 THEN
    RAISE EXCEPTION 'Enter a message of 1 to 2,000 characters.' USING ERRCODE = '22023';
  END IF;
  -- Take the pair lock before the existing statement notification trigger takes
  -- the conversation lock. Block/unblock never takes a conversation lock.
  PERFORM erental_events.assert_contact_allowed(actor, counterpart);
  NEW.recipient_id := counterpart;
  NEW.created_at := clock_timestamp();
  NEW.read_at := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trust_message_write BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION erental_events.guard_message_write();

CREATE FUNCTION public.send_conversation_message(p_conversation_id uuid, p_operation_id uuid, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  saved uuid;
  content text := btrim(p_body);
BEGIN
  IF actor IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  IF content IS NULL OR content !~ '[^[:space:]]' OR char_length(content) > 2000 THEN
    RAISE EXCEPTION 'Enter a message of 1 to 2,000 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO saved FROM public.messages WHERE id = p_operation_id
    AND conversation_id = p_conversation_id AND sender_id = actor AND body = content;
  IF FOUND THEN RETURN saved; END IF;

  INSERT INTO public.messages (id, conversation_id, sender_id, body)
    VALUES (p_operation_id, p_conversation_id, actor, content)
    ON CONFLICT (id) DO NOTHING RETURNING id INTO saved;
  IF FOUND THEN RETURN saved; END IF;
  SELECT id INTO saved FROM public.messages WHERE id = p_operation_id
    AND conversation_id = p_conversation_id AND sender_id = actor AND body = content;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message unavailable.' USING ERRCODE = '42501'; END IF;
  RETURN saved;
END;
$$;
-- The invoker RPC uses the same participant RLS path as the older composer.
GRANT INSERT (id) ON public.messages TO authenticated;

CREATE TABLE public.conversation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('harassment','spam','suspected_scam','threatening_language','inappropriate_content','other')),
  details text CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','upheld','dismissed')),
  admin_note text CHECK (char_length(admin_note) BETWEEN 1 AND 500),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id),
  CHECK ((status = 'pending' AND admin_note IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'pending' AND admin_note IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX conversation_reports_pending_idx ON public.conversation_reports(conversation_id, reporter_id)
  WHERE status = 'pending';
CREATE INDEX conversation_reports_reporter_idx ON public.conversation_reports(reporter_id, created_at DESC, id DESC);
CREATE INDEX conversation_reports_queue_idx ON public.conversation_reports(status, created_at DESC, id DESC);
CREATE INDEX conversation_reports_thread_idx ON public.conversation_reports(conversation_id);
ALTER TABLE public.conversation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversation_reports TO authenticated;
CREATE POLICY report_read_parties ON public.conversation_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR (SELECT public.is_admin()) IS TRUE);

CREATE TABLE erental_events.conversation_report_evidence (
  report_id uuid NOT NULL REFERENCES public.conversation_reports(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  message_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('reporter','counterpart')),
  body text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (report_id, position),
  UNIQUE (report_id, message_id)
);
ALTER TABLE erental_events.conversation_report_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erental_events.conversation_report_evidence FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.report_conversation(p_conversation_id uuid, p_reason text, p_details text, p_message_ids uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  counterpart uuid;
  report uuid;
  evidence_ids uuid[] := coalesce(p_message_ids, '{}'::uuid[]);
  details text := nullif(btrim(p_details), '');
BEGIN
  SELECT CASE WHEN renter_id = actor THEN owner_id ELSE renter_id END INTO counterpart
    FROM public.conversations WHERE id = p_conversation_id AND actor IN (renter_id, owner_id);
  IF NOT FOUND OR counterpart IS NULL THEN
    RAISE EXCEPTION 'Conversation unavailable.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('harassment','spam','suspected_scam','threatening_language','inappropriate_content','other')
      OR char_length(details) > 1000 THEN
    RAISE EXCEPTION 'Choose a reason and use at most 1,000 characters for details.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(evidence_ids) > 5 OR cardinality(evidence_ids) <> (
    SELECT count(*) FROM public.messages WHERE conversation_id = p_conversation_id AND id = ANY(evidence_ids)
      AND sender_id IN (actor, counterpart)
  ) THEN
    RAISE EXCEPTION 'Select up to five distinct messages from this conversation.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.conversation_reports(conversation_id, reporter_id, reported_user_id, reason, details)
    VALUES (p_conversation_id, actor, counterpart, p_reason, details)
    RETURNING id INTO report;
  INSERT INTO erental_events.conversation_report_evidence(report_id, position, message_id, sender_role, body, created_at)
    SELECT report, row_number() OVER (ORDER BY created_at, id), id,
      CASE WHEN sender_id = actor THEN 'reporter' ELSE 'counterpart' END, body, created_at
      FROM public.messages WHERE conversation_id = p_conversation_id AND id = ANY(evidence_ids)
        AND sender_id IN (actor, counterpart);
  IF cardinality(evidence_ids) <> (
    SELECT count(*) FROM erental_events.conversation_report_evidence WHERE report_id = report
  ) THEN
    RAISE EXCEPTION 'Some selected evidence is no longer available.' USING ERRCODE = '22023';
  END IF;
  RETURN report;
END;
$$;

CREATE FUNCTION public.get_conversation_report_evidence(p_report_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR (SELECT public.is_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('message_id', message_id, 'sender_role', sender_role,
      'body', body, 'created_at', created_at) ORDER BY position)
    FROM erental_events.conversation_report_evidence WHERE report_id = p_report_id), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.resolve_conversation_report(p_report_id uuid, p_action text, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  report public.conversation_reports%ROWTYPE;
  note text := btrim(p_note);
BEGIN
  IF actor IS NULL OR (SELECT public.is_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('upheld', 'dismissed')
      OR note IS NULL OR note !~ '[^[:space:]]' OR char_length(note) > 500 THEN
    RAISE EXCEPTION 'Choose a decision and enter a reason of up to 500 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO report FROM public.conversation_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR report.status <> 'pending' THEN
    RAISE EXCEPTION 'This report is no longer pending.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conversation_reports
    SET status = p_action, admin_note = note, reviewed_by = actor, reviewed_at = clock_timestamp()
    WHERE id = report.id;
  PERFORM erental_events.emit(report.reporter_id, 'reporter', 'conversation_report_resolved', report.conversation_id, report.id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_block(uuid, boolean), public.conversation_contact_status(uuid),
  public.send_conversation_message(uuid, uuid, text), public.report_conversation(uuid, text, text, uuid[]),
  public.get_conversation_report_evidence(uuid), public.resolve_conversation_report(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_block(uuid, boolean), public.conversation_contact_status(uuid),
  public.send_conversation_message(uuid, uuid, text), public.report_conversation(uuid, text, text, uuid[]),
  public.get_conversation_report_evidence(uuid), public.resolve_conversation_report(uuid, text, text)
  TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erental_events FROM PUBLIC, anon, authenticated, service_role;

-- Postgres Changes applies SELECT RLS to inserted/updated rows. DELETE events
-- have different authorization semantics and are unnecessary here. Never
-- change an existing unrelated publication's enabled operations.
DO $realtime$
DECLARE
  channel pg_catalog.pg_publication%ROWTYPE;
BEGIN
  SELECT * INTO channel FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime';
  IF NOT FOUND THEN
    CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update');
  ELSIF channel.puballtables THEN
    RAISE EXCEPTION 'Realtime publishes all tables. Review the existing publication before enabling communications.';
  ELSIF NOT channel.pubinsert OR NOT channel.pubupdate OR channel.pubdelete OR channel.pubtruncate THEN
    IF EXISTS (SELECT FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND (schemaname, tablename) <> ('public', 'messages'))
      OR EXISTS (SELECT FROM pg_catalog.pg_publication_namespace WHERE pnpubid = channel.oid) THEN
      RAISE EXCEPTION 'Realtime publication operations differ. Reconcile existing publication before enabling communications.';
    END IF;
    ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update');
  END IF;
  IF EXISTS (SELECT FROM pg_catalog.pg_publication_rel
    WHERE prpubid = channel.oid AND prrelid = 'public.messages'::regclass
      AND (prqual IS NOT NULL OR prattrs IS NOT NULL)) THEN
    RAISE EXCEPTION 'Realtime messages already use a custom publication filter or projection. Review it before enabling communications.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END;
$realtime$;
