-- Disposable adapter for the checked-in clients' legacy review contract.
-- Hosted review grants, trigger order, and constraints require live comparison.
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id),
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT ON public.reviews TO authenticated;
CREATE POLICY legacy_reviews_read ON public.reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY legacy_reviews_insert ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = (SELECT auth.uid()));
