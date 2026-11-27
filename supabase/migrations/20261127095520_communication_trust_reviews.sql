-- Keep the reviewed marketplace predecessors and the existing renter insert contract.
-- Apply with Supabase CLI or psql --single-transaction after catalog comparison.
DO $preflight$
DECLARE
  required record;
  review_column record;
  client_role text;
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_class
    WHERE oid = pg_catalog.to_regclass('public.reviews') AND relkind = 'r' AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_class
    WHERE oid = pg_catalog.to_regclass('public.bookings') AND relkind = 'r' AND relrowsecurity
  ) OR pg_catalog.to_regprocedure('erental_events.emit(uuid,text,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Expected existing RLS-protected reviews and bookings and Marketplace Essentials notifications.';
  END IF;

  FOR required IN SELECT *
    FROM (VALUES
      ('reviews','id','uuid'), ('reviews','booking_id','uuid'), ('reviews','listing_id','uuid'),
      ('reviews','reviewer_id','uuid'), ('reviews','owner_id','uuid'), ('reviews','comment','text'),
      ('reviews','created_at','timestamp with time zone'),
      ('bookings','id','uuid'), ('bookings','listing_id','uuid'),
      ('bookings','renter_id','uuid'), ('bookings','owner_id','uuid')
    ) AS inputs(table_name, column_name, type_name)
  LOOP
    IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_attribute
      WHERE attrelid = pg_catalog.to_regclass('public.' || required.table_name)
        AND attname = required.column_name
        AND atttypid = pg_catalog.to_regtype(required.type_name) AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Unexpected %.% type. Compare the review source contract on staging.',
        required.table_name, required.column_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.reviews'::regclass AND attname = 'rating'
      AND atttypid IN ('smallint'::regtype, 'integer'::regtype, 'bigint'::regtype)
      AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.reviews'::regclass AND attname = 'id' AND atthasdef
  ) OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'public.reviews'::regclass AND a.attname = 'booking_id'
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
      AND i.indnkeyatts = 1
  ) THEN
    RAISE EXCEPTION 'Expected generated review IDs, integer ratings and one review per booking.';
  END IF;

  IF EXISTS (
    SELECT FROM public.reviews r
    LEFT JOIN public.bookings b ON b.id = r.booking_id
    WHERE b.id IS NULL OR b.status::text IS DISTINCT FROM 'completed'
       OR r.reviewer_id IS DISTINCT FROM b.renter_id
       OR r.owner_id IS DISTINCT FROM b.owner_id OR r.listing_id IS DISTINCT FROM b.listing_id
       OR r.rating IS NULL OR r.rating NOT BETWEEN 1 AND 5
  ) THEN
    RAISE EXCEPTION 'Historical review attribution or eligibility differs. Reconcile the catalog and rows before deployment.';
  END IF;

  -- Rebuild only direct client write grants on the existing review table.
  -- The ordinary review form still sends booking_id, reviewer_id, rating and comment.
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.reviews FROM PUBLIC, anon, authenticated;
  FOR review_column IN SELECT attname, attname IN ('booking_id','reviewer_id','rating','comment') AS form_column
    FROM pg_catalog.pg_attribute WHERE attrelid = 'public.reviews'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE pg_catalog.format('REVOKE INSERT (%1$I), UPDATE (%1$I) ON public.reviews FROM PUBLIC, anon, authenticated', review_column.attname);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF pg_catalog.has_column_privilege(client_role, 'public.reviews', review_column.attname, 'INSERT, UPDATE') THEN
        RAISE EXCEPTION 'Inherited client review writes differ. Compare role memberships on staging.';
      END IF;
    END LOOP;
  END LOOP;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF pg_catalog.has_table_privilege(client_role, 'public.reviews', 'DELETE, TRUNCATE, TRIGGER') THEN
      RAISE EXCEPTION 'Inherited client review privileges differ. Compare role memberships on staging.';
    END IF;
  END LOOP;
  GRANT INSERT (booking_id,reviewer_id,rating,comment) ON public.reviews TO authenticated;
END;
$preflight$;

ALTER TABLE public.reviews ADD COLUMN is_published boolean NOT NULL DEFAULT true;
GRANT SELECT (is_published) ON public.reviews TO anon, authenticated;

-- Restrictive so older permissive read policies cannot make a hidden review public.
-- A participant can still check whether the review exists on their booking.
CREATE POLICY review_publication_guard ON public.reviews AS RESTRICTIVE FOR SELECT TO PUBLIC USING (
  is_published OR (SELECT auth.uid()) IN (owner_id, reviewer_id)
);
CREATE INDEX published_reviews_listing_timeline_idx ON public.reviews(listing_id, created_at DESC, id DESC)
  INCLUDE (rating) WHERE is_published;
CREATE INDEX published_reviews_owner_rating_idx ON public.reviews(owner_id)
  INCLUDE (rating) WHERE is_published;

CREATE FUNCTION erental_events.validate_rental_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  reader uuid := auth.uid();
  rental public.bookings%ROWTYPE;
BEGIN
  IF reader IS NULL OR reader IS DISTINCT FROM NEW.reviewer_id THEN
    RAISE EXCEPTION 'Only the renter can review a completed rental.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO rental FROM public.bookings WHERE id = NEW.booking_id FOR SHARE;
  IF NOT FOUND OR rental.renter_id IS DISTINCT FROM reader OR rental.status::text IS DISTINCT FROM 'completed'
     OR rental.owner_id IS NULL OR rental.owner_id = reader OR rental.listing_id IS NULL THEN
    RAISE EXCEPTION 'Only the renter can review a completed rental.' USING ERRCODE = '42501';
  END IF;
  IF NEW.rating IS NULL OR NEW.rating NOT BETWEEN 1 AND 5
     OR pg_catalog.char_length(NEW.comment) > 1000 THEN
    RAISE EXCEPTION 'Provide a rating from 1 to 5 and a comment of at most 1000 characters.' USING ERRCODE = '22023';
  END IF;
  NEW.owner_id := rental.owner_id;
  NEW.listing_id := rental.listing_id;
  NEW.is_published := true;
  RETURN NEW;
END;
$$;

CREATE FUNCTION erental_events.publish_rental_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Check the final tuple after any existing BEFORE triggers have returned.
  IF NEW.is_published IS NOT TRUE OR NOT EXISTS (
    SELECT FROM public.bookings b WHERE b.id = NEW.booking_id AND b.status::text = 'completed'
      AND b.renter_id = NEW.reviewer_id AND b.owner_id = NEW.owner_id AND b.listing_id = NEW.listing_id
      AND b.renter_id = auth.uid() AND b.owner_id <> b.renter_id
  ) THEN
    RAISE EXCEPTION 'Review attribution differs from the completed rental.' USING ERRCODE = '42501';
  END IF;
  PERFORM erental_events.emit(NEW.owner_id, 'owner', 'review_published', NEW.listing_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trust_validate_rental_review BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION erental_events.validate_rental_review();
CREATE TRIGGER trust_publish_rental_review AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION erental_events.publish_rental_review();
REVOKE ALL ON FUNCTION erental_events.validate_rental_review(), erental_events.publish_rental_review()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.public_review_summary(p_listing_id uuid DEFAULT NULL, p_owner_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object('average', pg_catalog.round(pg_catalog.avg(r.rating), 1), 'count', pg_catalog.count(*))
  FROM public.reviews r
  WHERE r.is_published AND (
    (p_owner_id IS NULL AND r.listing_id = p_listing_id)
    OR (p_listing_id IS NULL AND r.owner_id = p_owner_id)
  );
$$;

CREATE TABLE public.review_responses (
  review_id uuid PRIMARY KEY REFERENCES public.reviews(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response_text text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(response_text)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_responses_owner_idx ON public.review_responses(owner_id);
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_responses TO anon, authenticated;
CREATE POLICY published_review_responses ON public.review_responses FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT FROM public.reviews r WHERE r.id = review_id AND r.is_published)
);

CREATE FUNCTION public.save_review_response(p_review_id uuid, p_response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  owner_review public.reviews%ROWTYPE;
  reply text := pg_catalog.btrim(p_response);
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to respond.' USING ERRCODE = '42501'; END IF;
  IF reply IS NULL OR reply !~ '[^[:space:]]' OR pg_catalog.char_length(reply) > 1000 THEN
    RAISE EXCEPTION 'Provide a response between 1 and 1000 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO owner_review FROM public.reviews
  WHERE id = p_review_id AND owner_id = actor AND is_published FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published review unavailable.' USING ERRCODE = '42501'; END IF;
  UPDATE public.review_responses SET response_text = reply, updated_at = clock_timestamp() WHERE review_id = owner_review.id;
  IF NOT FOUND THEN
    INSERT INTO public.review_responses(review_id, owner_id, response_text) VALUES (owner_review.id, actor, reply);
    PERFORM erental_events.emit(owner_review.reviewer_id, 'renter', 'review_response_published', owner_review.listing_id, owner_review.id);
  END IF;
END;
$$;

CREATE FUNCTION public.remove_review_response(p_review_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to remove your response.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.reviews WHERE id = p_review_id AND owner_id = auth.uid() FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review unavailable.' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.review_responses WHERE review_id = p_review_id;
END;
$$;

CREATE TABLE public.review_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('abuse','personal_information','unrelated','fraud','other')),
  details text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(details)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','upheld','dismissed')),
  admin_note text CHECK (pg_catalog.char_length(pg_catalog.btrim(admin_note)) BETWEEN 1 AND 1000),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'pending' AND admin_note IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('upheld','dismissed') AND admin_note IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX review_disputes_one_pending_idx ON public.review_disputes(review_id) WHERE status = 'pending';
CREATE INDEX review_disputes_review_idx ON public.review_disputes(review_id);
CREATE INDEX review_disputes_submitter_timeline_idx ON public.review_disputes(submitted_by, created_at DESC, id DESC);
CREATE INDEX review_disputes_queue_idx ON public.review_disputes(status, created_at DESC, id DESC);
ALTER TABLE public.review_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_disputes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.review_disputes TO authenticated;
CREATE POLICY own_or_admin_review_disputes ON public.review_disputes FOR SELECT TO authenticated USING (
  submitted_by = (SELECT auth.uid()) OR (SELECT public.is_admin())
);

CREATE FUNCTION public.submit_review_dispute(p_review_id uuid, p_reason text, p_details text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  dispute_id uuid;
  context text := pg_catalog.btrim(p_details);
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to dispute a review.' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('abuse','personal_information','unrelated','fraud','other')
      OR context IS NULL OR context !~ '[^[:space:]]' OR pg_catalog.char_length(context) > 1000 THEN
    RAISE EXCEPTION 'Choose a valid reason and provide 1 to 1000 characters of context.' USING ERRCODE = '22023';
  END IF;
  -- All response and dispute operations lock the review before touching case rows.
  PERFORM 1 FROM public.reviews WHERE id = p_review_id AND owner_id = actor AND is_published FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published review unavailable.' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.review_disputes(review_id, submitted_by, reason, details)
  VALUES (p_review_id, actor, p_reason, context) RETURNING id INTO dispute_id;
  RETURN dispute_id;
END;
$$;

CREATE FUNCTION public.get_review_dispute_evidence(p_dispute_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  evidence jsonb;
BEGIN
  IF auth.uid() IS NULL OR (SELECT public.is_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  SELECT pg_catalog.jsonb_build_object('rating', r.rating, 'comment', r.comment, 'created_at', r.created_at,
    'listing_title', l.title, 'booking_completed', coalesce(b.status::text = 'completed', false),
    'is_published', r.is_published)
  INTO evidence
  FROM public.review_disputes d
  JOIN public.reviews r ON r.id = d.review_id
  LEFT JOIN public.listings l ON l.id = r.listing_id
  LEFT JOIN public.bookings b ON b.id = r.booking_id
  WHERE d.id = p_dispute_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review dispute unavailable.' USING ERRCODE = '42501'; END IF;
  RETURN evidence;
END;
$$;

CREATE FUNCTION public.resolve_review_dispute(p_dispute_id uuid, p_action text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  disputed public.reviews%ROWTYPE;
  request public.review_disputes%ROWTYPE;
  explanation text := pg_catalog.btrim(p_note);
  decision text;
BEGIN
  IF actor IS NULL OR (SELECT public.is_admin()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('uphold','dismiss') OR explanation IS NULL
     OR explanation !~ '[^[:space:]]' OR pg_catalog.char_length(explanation) > 1000 THEN
    RAISE EXCEPTION 'Choose a decision and provide 1 to 1000 characters of justification.' USING ERRCODE = '22023';
  END IF;
  SELECT r.* INTO disputed FROM public.reviews r
  JOIN public.review_disputes d ON d.review_id = r.id
  WHERE d.id = p_dispute_id FOR NO KEY UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review dispute unavailable.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO request FROM public.review_disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND OR request.status <> 'pending' THEN
    RAISE EXCEPTION 'This review dispute already has a decision.' USING ERRCODE = '55000';
  END IF;

  decision := CASE WHEN p_action = 'uphold' THEN 'upheld' ELSE 'dismissed' END;
  UPDATE public.review_disputes SET status = decision, admin_note = explanation,
    reviewed_by = actor, reviewed_at = now() WHERE id = request.id;
  IF p_action = 'uphold' AND disputed.is_published THEN
    UPDATE public.reviews SET is_published = false WHERE id = disputed.id;
    PERFORM erental_events.emit(disputed.reviewer_id, 'renter', 'review_visibility_updated', disputed.listing_id, request.id);
  END IF;
  PERFORM erental_events.emit(request.submitted_by, 'owner', 'review_dispute_resolved', request.id, request.id);
END;
$$;

REVOKE ALL ON FUNCTION public.public_review_summary(uuid,uuid), public.save_review_response(uuid,text),
  public.remove_review_response(uuid), public.submit_review_dispute(uuid,text,text),
  public.get_review_dispute_evidence(uuid), public.resolve_review_dispute(uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_review_summary(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_review_response(uuid,text), public.remove_review_response(uuid),
  public.submit_review_dispute(uuid,text,text), public.get_review_dispute_evidence(uuid),
  public.resolve_review_dispute(uuid,text,text) TO authenticated;
