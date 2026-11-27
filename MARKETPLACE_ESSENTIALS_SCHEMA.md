# Marketplace essentials database contract

Migration `20261125190326` adds saved listings, bounded viewing history and persistent notifications. It attaches four event triggers to existing business tables. It starts capturing events upon installation. Historical bookings, conversations, payments, verification decisions and badges retain their existing values. [Migration](supabase/migrations/20261125190326_marketplace_essentials.sql) · [Event matrix](NOTIFICATION_EVENT_MATRIX.md)

## Required existing schema

The foundation migration confirms UUID profile/listing identifiers and public listing eligibility. The verification export and hardening migration establish the reviewed transaction. The application and tests identify the other source relations, expected columns and status vocabulary. The repository does not contain authoritative full booking, messaging or payment DDL. An operator must compare the target catalog and approved behavior on designated staging before rollout. [Foundation](supabase/migrations/20261102083451_foundation_profiles_categories_listings_photos.sql) · [Verification release procedure](VERIFICATION_SECURITY_DEPLOYMENT.md) · [Catalog diagnostic](supabase/diagnostics/marketplace_essentials_contract.sql)

| Dependency | Contract to verify on the actual target |
| --- | --- |
| Profiles and listings | `profiles.id`, `listings.id` and `listings.owner_id` are UUIDs. `listings.status` uses available, unavailable and removed, with a separate boolean `removed_by_admin`. Public inventory reads obey listing RLS. |
| Bookings | UUID id, listing_id, renter_id, owner_id. Accepted source operations set pending, accepted, rejected, cancelled or completed. Check participant relationships, server-controlled identity/transition fields, source RLS and relevant action permissions. |
| Messages and conversations | UUID message id, conversation_id, sender_id and text body. Conversations identify the listing, renter and owner. Check the conversation/listing/sender relationships, source policies and role-specific insert, select and read-marker behavior. |
| Simulated payments | The required join is `simulated_payments.booking_id = bookings.id`. Status values are simulated_paid and simulated_refunded. The application simulates one payment per booking, which can contain rental and deposit lines. Confirm the foreign key, refund transitions, caller identity during the RPC, server-enforced single payment and prohibition on client writes before enabling the integration. |
| Verification | The guarded review migration must be installed first. Its exact UTF-8 `pg_get_functiondef` SHA-256 must be `cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7`. Check membership, grants, source triggers and hardened review semantics against the dedicated verification release diagnostic. The new trigger receives the submission outcome in that same transaction. |

The migration generates an error before adding objects if the expected RLS-protected source tables, required column types, hardened review definition or restricted payment/verification write grants differ. An existing new object name also stops creation. Catalog preflight must include the full source policies, foreign keys, allowed column writes, source RPCs and existing triggers. The automated checks verify only their specified prerequisites. Source business authorization continues to run on the originating write.

## Stored data and API

| Object | Schema, ownership and permitted operations |
| --- | --- |
| `public.saved_listings` | Composite primary key `(user_id,listing_id)` with cascading foreign keys to profiles and listings. Server creation time. Authenticated users can select and delete their own relationships and insert only their own user ID and a visible, unremoved listing ID. A repeated insert yields SQLSTATE 23505. The timeline index supports newest saves and a separate listing index supports cascades. |
| `public.recently_viewed_listings` | Same cascading keys, server-stamped `viewed_at` and a server-managed slot from 1–12, unique per user. Signed-in clients can read their own user ID, listing ID and time, and delete their own history. The recording RPC accepts one listing ID. An insert grant limited to that column uses the identical RLS and trigger path. The account defaults to `auth.uid()`. A transaction lock per account serializes touches, refreshes repeated visits and trims to the 12 most recent distinct listings. Slot uniqueness enforces the maximum even when stricter transaction isolation requires a retry. Timeline and listing indexes support retrieval and cascades. |
| `public.notifications` | UUID id, profile-backed recipient, controlled event type and recipient role, UUID destination entity, internal deduplication key, server creation time and nullable read time. The recipient FK cascades on profile deletion. Authenticated SELECT is restricted to the recipient's display fields. It excludes the internal key. API clients have no table insert, update or delete grant. The recipient timeline index and a partial unread index support pagination and counts. Uniqueness per recipient and event key suppresses duplicate deliveries. A partial unique index permits only one first inquiry per conversation. |
| `public.record_listing_view(p_listing_id uuid)` | Authenticated, security-invoker command returning void. Listing-policy checks run in the caller's role, including status and removal flag. The trigger serializes updates and chooses a server timestamp and slot. The guest UI uses tab-local session storage. |
| `public.mark_notification_read(p_notification_id uuid)` | Authenticated, fixed-search-path definer. Requires a live user identity and updates only that recipient's row. Reopening a read notification preserves its first read time. Missing and inaccessible identifiers return the same denial. |
| `public.mark_all_notifications_read()` | Authenticated, fixed-search-path definer. Updates only that recipient's unread rows visible to the command. New events arriving later remain unread. |
| `erental_events` | Private schema for four source trigger functions, the history-bound trigger and the internal insert helper. Ordinary API roles have neither schema access nor function EXECUTE. The definer triggers use an empty search path, schema-qualified source tables and server-derived identities. The internal writer is security-invoker and runs with the trigger's privileges. |

The client requests listing details through their usual RLS-protected relation. Previously saved or viewed relationships can outlive a soft removal. An account can see its own remembered listing identifier, while a restricted or administratively removed listing has no visible card or owner details. Hard deletion of the listing cleans up relationships. Notification contents consist of controlled event facts. There is no copied message text, verification note, document URL, account email or externally supplied redirect. A destination entity may later be removed or cease to be accessible. Its own route and RLS determine availability.

An API notification list should select `id,recipient_id,event_type,recipient_role,entity_id,created_at,read_at` ordered by `created_at DESC,id DESC`. An exact unread count uses `id` and `read_at IS NULL`. Use `auth.uid()` as the sole authority for read-state commands. Supabase documents the importance of a fixed search path, qualified names and explicit function EXECUTE restrictions. [Supabase function guidance](https://supabase.com/docs/guides/database/functions) · [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Rollback and recovery

Use the data-preserving pause after rolling back the new UI and draining affected writes. It verifies trigger identities, disables the four delivery triggers and revokes client writes to saves, history and read state. Tables, data, RLS, earlier triggers and the hardened verification function stay intact. The migration is still installed and its history entry remains applied. [Pause SQL](supabase/rollbacks/20261125190326_marketplace_essentials.sql)

To resume the same reviewed version, compare definitions, grants, source authorization and trigger identities with the pre-pause evidence, then run the following as one transaction on the approved target. If there is drift, prepare a reviewed forward repair first. Capture the pause window. Events during that window require separate source reconciliation if historical delivery is needed.

```sql
BEGIN;
ALTER TABLE public.bookings ENABLE TRIGGER erental_booking_event;
ALTER TABLE public.messages ENABLE TRIGGER erental_message_event;
ALTER TABLE public.simulated_payments ENABLE TRIGGER erental_simulation_event;
ALTER TABLE public.verification_submissions ENABLE TRIGGER erental_verification_event;
GRANT INSERT (user_id,listing_id), DELETE ON public.saved_listings TO authenticated;
GRANT INSERT (listing_id), DELETE ON public.recently_viewed_listings TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_listing_view(uuid), public.mark_notification_read(uuid),
  public.mark_all_notifications_read() TO authenticated;
COMMIT;
```

Repeat the catalog diagnostic and staging acceptance after resumption. Native Auth, PostgREST and source authorization require a designated hosted test. [Deployment](MARKETPLACE_ESSENTIALS_DEPLOYMENT.md) · [Executed tests](MARKETPLACE_ESSENTIALS_TEST_RESULTS.md)
