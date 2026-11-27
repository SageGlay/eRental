-- Isolated source-table adapter for the marketplace client contracts. Hosted
-- booking, conversation and simulated-payment DDL is absent from this checkout.
-- Workflow tests persist confirmed source changes with a selected fixture actor.
-- Production RLS, mutation RPCs and provider sessions need staging acceptance.
CREATE TABLE public.listings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  removed_by_admin boolean NOT NULL DEFAULT false
);
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.listings TO anon, authenticated;
CREATE POLICY visible_listings ON public.listings FOR SELECT TO anon, authenticated
  USING (status <> 'removed');
CREATE POLICY owned_listings ON public.listings FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  status text NOT NULL CHECK (status IN ('pending','accepted','rejected','cancelled','completed'))
);
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  listing_id uuid NOT NULL REFERENCES public.listings(id)
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.simulated_payments (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  kind text NOT NULL,
  status text NOT NULL
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulated_payments ENABLE ROW LEVEL SECURITY;
