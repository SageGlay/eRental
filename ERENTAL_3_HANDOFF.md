# eRental 3.0 handoff

eRental 3.0 redesigns the existing marketplace on the branch `codex/erental-v3-complete-redesign`, starting from `main` at `69891e7`. Renters, individual owners, business accounts and administrators continue to use the same application and Supabase project.

[Before and after screenshots, plus all route contact sheets](docs/erental-3/after/README.md) · [Initial findings and scope decisions](ERENTAL_3_AUDIT.md) · [Marketplace journeys](ERENTAL_3_UX_STRATEGY.md) · [Design system](DESIGN.md)

## What changed

| Destination | Implemented behavior |
| --- | --- |
| Discover, browse and listing details | Original two-tag identity, editorial home photograph, real latest inventory, a shorter search path, removable URL filters, compact photo and rate comparisons, gallery, owner and rental decision sections. An in-place retry recovers the latest feed. Public owner badges require protected verification fields. |
| Listing editor and inventory | Section navigation, draft readiness, cover selection, a review of actual price/deposit/terms and initial availability. Photo retries keep their original identities. Inventory includes real counts, title/location filters, current status, owner-scoped updates and direct access to incoming requests. |
| Bookings, payments and reviews | Separate renter/owner queues, calendar-day dates, itemized estimates, status-specific next actions and confirmation for significant changes. Payments remain simulated. |
| Messages | Filter authorized conversations by unread status, search by participant or listing, open a thread with listing context, review day-grouped messages and use the composer above the mobile dock. Existing polling and read markers continue. A failed initial conversation lookup cannot create a new thread. A lost review response must be checked against the owned booking before the user can submit again. |
| Accounts | Responsive login, registration, profile, theme settings, email recovery and a validated return to the original protected task. Recovery credentials are removed from the address bar before ordinary session initialization. An isolated in-memory client performs the password change, including when Supabase returns the user to the configured Site URL. |
| Verification and reporting | Private document submission and deliberate viewing, linked verification history, admin review queues, explicit case decisions, reporting dialog, duplicate/error feedback and recovery for uncertain moderation writes. |
| Shell and failure states | Desktop search entry, mobile task navigation, light/dark/system themes, keyboard focus handling, offline notice, themed setup and missing-route screens. Dirty listing/profile forms protect in-app links, browser Back/Forward and document unload. |

## Deployment and manual acceptance

1. Install Node 22 or newer, run `npm ci`, then start Vite with the target project's plain URL and its matching public client key. Invalid configuration displays a setup screen. [Setup instructions](LOCAL_SETUP_AND_TESTING.md)
2. Serve `dist/` over HTTPS with SPA fallback to `index.html`. Add the exact staging origin followed by `/reset-password` to the Supabase Auth redirect allow-list. Use the standard recovery email confirmation link. Exercise delivery, an expired link and a recovery performed while another test account is signed in.
3. Browse using a keyword, category and rate, remove one filter, then use Back. Check a listing photo, owner, availability and estimate. Use a dedicated staging owner to create a listing with up to ten photos, inspect its preview, edit its terms and change availability. Confirm a renter sees the actual published data.
4. With two staging accounts, request dates, open the owner's incoming queue, exercise permitted decisions, simulate payment, message each other and review an eligible completed rental. Confirm calendar dates and fees in both accounts.
5. Exercise private verification and moderation with an explicitly designated test identity and admin. Confirm ordinary accounts cannot see the queue, documents remain private, and a completed decision updates only the intended case. [Hosted acceptance plan](LIVE_INTEGRATION_TEST_PLAN.md)

This version requires no new database migration, RLS policy or public Storage bucket. The existing verification concurrency proposal remains a separate rollout item. Hosted schema coverage and credentialed acceptance are recorded in the prior integration handoff. [Integration evidence](MILESTONE_3_HANDOFF.md)

## Verification

| Check | Starting main | Completed redesign |
| --- | --- | --- |
| Clean install | 84 packages | 84 packages from the lockfile |
| Chromium browser suite | 111 passed | 142 passed in 3.4 minutes |
| Vite production build | 2.27 s, entry 127.37 kB gzip | 2.56 s, entry 143.97 kB gzip |
| Disposable PostgreSQL verification suite | Previously recorded in Milestone 3 | 9 passed |

The integration run found a focus race after an uncertain inventory update. Focus now moves after the alert mounts. A development-server reload also interrupted one desktop run while sources were changing. The complete browser suite passed after the fixes on settled sources.

The route matrix checks 18 page states at five widths in each theme, plus the denied admin view at two widths in each theme (184 visits). The independent production-fixture run passed 24 matrix tests. Captures use synthetic records in Chromium. The editorial still life is an original generated WebP, separate from inventory media. The browser test data and sample listing illustrations are excluded from the app build.

The separate axe-core 4.11.0 scan checked 76 loaded Chromium renders from the production build (19 states, mobile and desktop, both themes). Its WCAG A/AA rules reported zero violations and all screens fit the viewport. Axe left some contrast comparisons unresolved in 24 renders across discovery, listings, the editor and conversation. Semantic foreground/background token pairs also passed the browser contrast checks. These results cover the exercised states.

Reviewers identified and rechecked a mobile composer obstructed by the dock and wrapped step numbers in the listing editor. At 320×844 and 390×844 the complete Send button sits above the fixed dock. The owner editor and inventory were checked at 30 route/width/theme combinations. An independent calibration caught a deliberately missing select label in a temporary ThemeControl copy at `/tmp/erental-v3-calibration`. That specimen exercises source-level naming only. Rendered checks covered the actual keyboard, theme and focus controls separately.

## Known limits

- Hosted SMTP delivery, Supabase authorization, private Storage and concurrent production behavior still need staging acceptance. The checked-in migrations cover only part of the existing hosted schema.
- The browser matrix covers Chromium. Physical devices, other browser engines and screen-reader interaction remain manual checks.
- Favorites and push notifications are deferred. The app provides search URLs, unread counts and task feedback without a new persistence service. Conversations refresh periodically. The existing service has no client-supplied idempotency key for posting a message after a lost response.
- The initial JavaScript chunk grew with the router change that protects draft history. The route-specific account, messaging, booking, owner and moderation screens continue to load on demand. Photos, fonts and CSS load separately.
