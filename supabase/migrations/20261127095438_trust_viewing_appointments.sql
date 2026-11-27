-- Run after Communication Trust event types and communication safety.
DO $preflight$
BEGIN
  IF to_regprocedure('erental_events.assert_contact_allowed(uuid,uuid)') IS NULL OR
     to_regprocedure('erental_events.emit(uuid,text,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply communication safety and the Marketplace Essentials notification contract first.';
  END IF;
END;
$preflight$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE public.viewing_appointments (
  id uuid PRIMARY KEY,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  renter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'reschedule_proposed', 'declined', 'cancelled', 'completed'
  )),
  requested_start_at timestamptz NOT NULL,
  confirmed_start_at timestamptz,
  confirmed_end_at timestamptz,
  proposed_start_at timestamptz,
  request_note text CHECK (char_length(request_note) <= 500),
  meeting_details text CHECK (char_length(meeting_details) <= 500),
  proposed_details text CHECK (char_length(proposed_details) <= 500),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (renter_id <> owner_id),
  CHECK ((confirmed_start_at IS NULL AND confirmed_end_at IS NULL) OR
    (confirmed_start_at IS NOT NULL AND confirmed_end_at IS NOT NULL AND confirmed_end_at > confirmed_start_at)),
  CHECK (status NOT IN ('confirmed','completed') OR confirmed_start_at IS NOT NULL),
  CHECK ((status = 'reschedule_proposed') = (proposed_start_at IS NOT NULL)),
  -- One calendar per owner account, including business accounts. An existing
  -- confirmed slot remains held while an alternative awaits the renter.
  CONSTRAINT viewing_owner_schedule EXCLUDE USING gist (
    owner_id WITH =, tstzrange(confirmed_start_at, confirmed_end_at, '[)') WITH &&
  ) WHERE (confirmed_start_at IS NOT NULL AND status IN ('confirmed','reschedule_proposed'))
);
CREATE UNIQUE INDEX viewing_one_active_request_idx ON public.viewing_appointments (listing_id, renter_id)
  WHERE status IN ('pending','confirmed','reschedule_proposed');
CREATE INDEX viewing_renter_timeline_idx ON public.viewing_appointments(renter_id, created_at DESC, id);
CREATE INDEX viewing_owner_timeline_idx ON public.viewing_appointments(owner_id, created_at DESC, id);
CREATE INDEX viewing_listing_idx ON public.viewing_appointments(listing_id);

CREATE TABLE public.viewing_appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.viewing_appointments(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('renter','owner')),
  event_type text NOT NULL CHECK (event_type IN (
    'viewing_requested', 'viewing_confirmed', 'viewing_declined', 'viewing_reschedule_proposed',
    'viewing_reschedule_accepted', 'viewing_reschedule_declined', 'viewing_cancelled', 'viewing_completed'
  )),
  scheduled_at timestamptz,
  reason text CHECK (char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, revision)
);
ALTER TABLE public.viewing_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewing_appointment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.viewing_appointments, public.viewing_appointment_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.viewing_appointments, public.viewing_appointment_events TO authenticated;
CREATE POLICY participant_viewing ON public.viewing_appointments FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (renter_id, owner_id));
CREATE POLICY participant_viewing_history ON public.viewing_appointment_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT FROM public.viewing_appointments a WHERE a.id = appointment_id
    AND (SELECT auth.uid()) IN (a.renter_id, a.owner_id)));

CREATE FUNCTION erental_events.add_viewing_event(
  appointment public.viewing_appointments, actor uuid, event_kind text, schedule timestamptz, decision_reason text
) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  by_renter boolean := actor = appointment.renter_id;
  event_id uuid;
BEGIN
  INSERT INTO public.viewing_appointment_events (appointment_id, revision, actor_role, event_type, scheduled_at, reason)
  VALUES (appointment.id, appointment.revision, CASE WHEN by_renter THEN 'renter' ELSE 'owner' END,
          event_kind, schedule, decision_reason)
  RETURNING id INTO event_id;
  PERFORM erental_events.emit(
    CASE WHEN by_renter THEN appointment.owner_id ELSE appointment.renter_id END,
    CASE WHEN by_renter THEN 'owner' ELSE 'renter' END,
    event_kind, appointment.id, event_id
  );
END;
$$;
REVOKE ALL ON FUNCTION erental_events.add_viewing_event(public.viewing_appointments,uuid,text,timestamptz,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.request_viewing(
  p_request_id uuid, p_listing_id uuid, p_start_at timestamptz, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  appointment public.viewing_appointments;
  listing_owner uuid;
  note text := nullif(regexp_replace(p_note, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Please sign in to request a viewing.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_listing_id IS NULL OR char_length(note) > 500 THEN
    RAISE EXCEPTION 'Provide a listing and a note of up to 500 characters.' USING ERRCODE = '22023';
  END IF;

  -- A resend with the same operation id confirms the existing request without
  -- introducing contact or deriving a notification from an old operation.
  SELECT * INTO appointment FROM public.viewing_appointments a WHERE a.id = p_request_id AND a.renter_id = actor;
  IF FOUND THEN
    IF appointment.listing_id = p_listing_id AND appointment.requested_start_at = p_start_at
        AND appointment.request_note IS NOT DISTINCT FROM note THEN RETURN appointment.id; END IF;
    RAISE EXCEPTION 'This request reference is already in use.' USING ERRCODE = '23505';
  END IF;

  IF p_start_at IS NULL OR NOT isfinite(p_start_at) OR p_start_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Choose a future viewing time.' USING ERRCODE = '22023';
  END IF;
  SELECT l.owner_id INTO listing_owner FROM public.listings l
    WHERE l.id = p_listing_id AND l.status = 'available' AND NOT l.removed_by_admin;
  IF NOT FOUND THEN RAISE EXCEPTION 'This rental is unavailable for viewings.' USING ERRCODE = '22023'; END IF;
  IF actor = listing_owner THEN RAISE EXCEPTION 'You cannot request a viewing of your own rental.' USING ERRCODE = '42501'; END IF;

  PERFORM erental_events.assert_contact_allowed(actor, listing_owner);
  PERFORM FROM public.listings l
    WHERE l.id = p_listing_id AND l.owner_id = listing_owner AND l.status = 'available' AND NOT l.removed_by_admin
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This rental is unavailable for viewings.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.viewing_appointments (id, listing_id, renter_id, owner_id, requested_start_at, request_note)
  VALUES (p_request_id, p_listing_id, actor, listing_owner, p_start_at, note)
  ON CONFLICT (id) DO NOTHING RETURNING * INTO appointment;
  IF FOUND THEN
    PERFORM erental_events.add_viewing_event(appointment, actor, 'viewing_requested', p_start_at, NULL);
    RETURN appointment.id;
  END IF;
  SELECT * INTO appointment FROM public.viewing_appointments a WHERE a.id = p_request_id AND a.renter_id = actor;
  IF FOUND AND appointment.listing_id = p_listing_id AND appointment.requested_start_at = p_start_at
      AND appointment.request_note IS NOT DISTINCT FROM note THEN RETURN appointment.id; END IF;
  RAISE EXCEPTION 'This request reference is already in use.' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION public.update_viewing(
  p_appointment_id uuid, p_revision integer, p_action text,
  p_start_at timestamptz DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  appointment public.viewing_appointments;
  previous_status text;
  event_kind text;
  event_time timestamptz;
  event_reason text;
  note text := nullif(regexp_replace(p_note, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
BEGIN
  SELECT * INTO appointment FROM public.viewing_appointments a
    WHERE a.id = p_appointment_id AND actor IN (a.renter_id, a.owner_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Viewing unavailable.' USING ERRCODE = '42501'; END IF;
  IF char_length(note) > 500 THEN RAISE EXCEPTION 'Keep your note within 500 characters.' USING ERRCODE = '22023'; END IF;

  -- Acquire the pair lock before the appointment row for actions that make
  -- scheduling contact. Ending or completing an existing viewing stays possible.
  IF p_action IN ('confirm','propose','accept_proposal','decline') THEN
    PERFORM erental_events.assert_contact_allowed(appointment.renter_id, appointment.owner_id);
  END IF;
  SELECT * INTO appointment FROM public.viewing_appointments a
    WHERE a.id = p_appointment_id AND actor IN (a.renter_id, a.owner_id)
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viewing unavailable.' USING ERRCODE = '42501'; END IF;
  IF p_revision IS DISTINCT FROM appointment.revision THEN
    RAISE EXCEPTION 'This viewing has changed. Refresh it and try again.' USING ERRCODE = '40001';
  END IF;
  previous_status := appointment.status;

  CASE p_action
    WHEN 'confirm' THEN
      IF actor = appointment.owner_id AND previous_status = 'pending' THEN
        appointment.confirmed_start_at := appointment.requested_start_at;
        appointment.meeting_details := note;
        appointment.status := 'confirmed';
        event_kind := 'viewing_confirmed';
        event_time := appointment.confirmed_start_at;
      END IF;
    WHEN 'decline' THEN
      IF actor = appointment.owner_id AND previous_status = 'pending' THEN
        IF note IS NULL THEN RAISE EXCEPTION 'Enter a reason for declining.' USING ERRCODE = '22023'; END IF;
        appointment.status := 'declined';
        event_kind := 'viewing_declined';
        event_reason := note;
      END IF;
    WHEN 'propose' THEN
      IF actor = appointment.owner_id AND previous_status IN ('pending','confirmed') AND
         (appointment.confirmed_start_at IS NULL OR appointment.confirmed_start_at > clock_timestamp()) THEN
        IF p_start_at IS NULL OR NOT isfinite(p_start_at) OR p_start_at <= clock_timestamp() THEN
          RAISE EXCEPTION 'Choose a future viewing time.' USING ERRCODE = '22023';
        END IF;
        IF p_start_at = coalesce(appointment.confirmed_start_at, appointment.requested_start_at) THEN
          RAISE EXCEPTION 'Choose a different time for the proposal.' USING ERRCODE = '22023';
        END IF;
        appointment.status := 'reschedule_proposed';
        appointment.proposed_start_at := p_start_at;
        appointment.proposed_details := note;
        event_kind := 'viewing_reschedule_proposed';
        event_time := p_start_at;
      END IF;
    WHEN 'accept_proposal' THEN
      IF actor = appointment.renter_id AND previous_status = 'reschedule_proposed' AND
         (appointment.confirmed_start_at IS NULL OR appointment.confirmed_start_at > clock_timestamp()) THEN
        appointment.status := 'confirmed';
        appointment.confirmed_start_at := appointment.proposed_start_at;
        appointment.meeting_details := coalesce(appointment.proposed_details, appointment.meeting_details);
        event_kind := 'viewing_reschedule_accepted';
        event_time := appointment.confirmed_start_at;
      END IF;
    WHEN 'decline_proposal' THEN
      IF actor = appointment.renter_id AND previous_status = 'reschedule_proposed' THEN
        appointment.status := CASE WHEN appointment.confirmed_start_at IS NULL THEN 'pending' ELSE 'confirmed' END;
        event_kind := 'viewing_reschedule_declined';
        event_time := appointment.proposed_start_at;
      END IF;
    WHEN 'cancel' THEN
      IF previous_status IN ('pending','confirmed','reschedule_proposed') AND
         (appointment.confirmed_start_at IS NULL OR appointment.confirmed_start_at > clock_timestamp()) THEN
        appointment.status := 'cancelled';
        event_kind := 'viewing_cancelled';
        event_time := appointment.confirmed_start_at;
      END IF;
    WHEN 'complete' THEN
      IF actor = appointment.owner_id AND previous_status IN ('confirmed','reschedule_proposed') AND
         appointment.confirmed_end_at <= clock_timestamp() THEN
        appointment.status := 'completed';
        event_kind := 'viewing_completed';
        event_time := appointment.confirmed_start_at;
      END IF;
    ELSE NULL;
  END CASE;
  IF event_kind IS NULL THEN RAISE EXCEPTION 'This viewing action is unavailable.' USING ERRCODE = '22023'; END IF;

  IF p_action IN ('confirm','accept_proposal') THEN
    IF appointment.confirmed_start_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'Choose a future viewing time.' USING ERRCODE = '22023';
    END IF;
    appointment.confirmed_end_at := appointment.confirmed_start_at + interval '30 minutes';
  END IF;
  IF appointment.status <> 'reschedule_proposed' THEN
    appointment.proposed_start_at := NULL;
    appointment.proposed_details := NULL;
  END IF;

  UPDATE public.viewing_appointments SET
    status = appointment.status,
    confirmed_start_at = appointment.confirmed_start_at, confirmed_end_at = appointment.confirmed_end_at,
    proposed_start_at = appointment.proposed_start_at, meeting_details = appointment.meeting_details,
    proposed_details = appointment.proposed_details, updated_at = clock_timestamp(), revision = appointment.revision + 1
  WHERE id = appointment.id
  RETURNING * INTO appointment;
  PERFORM erental_events.add_viewing_event(appointment, actor, event_kind, event_time, event_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.request_viewing(uuid,uuid,timestamptz,text),
  public.update_viewing(uuid,integer,text,timestamptz,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_viewing(uuid,uuid,timestamptz,text),
  public.update_viewing(uuid,integer,text,timestamptz,text) TO authenticated;
