# eRental 3.0

Rent gear, vehicles and spaces around Iligan City with one renter and owner account. The React/Vite app uses Supabase Auth, PostgreSQL and Storage. Payments are simulated.

The new marketplace includes photo-led discovery, shareable filters, a listing editor with draft review, owner inventory, booking estimates, a searchable inbox, email password recovery, private verification and admin review. Theme preference follows the system or a saved light/dark override. Bricolage Grotesque and DM Sans ship with the app.

[3.0 handoff and screenshots](ERENTAL_3_HANDOFF.md) · [Design system](DESIGN.md) · [UX strategy](ERENTAL_3_UX_STRATEGY.md) · [Interaction contract](UX-CONTRACT.md) · [Local setup and testing](LOCAL_SETUP_AND_TESTING.md)

## Develop

Use Node.js 22 or newer (Node 24 and npm 11 were validated).

```sh
npm ci
cp .env.example .env
# Fill in the public Supabase project URL and publishable/anon key.
npm run dev
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the environment or a local `.env` file. Use the plain project URL from Supabase Connect, without a query string or credentials, and the matching public publishable or anon key. Restart Vite after changing settings. Validated public values are available in the browser bundle. Keep service-role keys, secret keys and database passwords out of frontend settings. `.env` files are ignored by Git.

```sh
npm run build
npm run preview
```

Production hosting must serve `index.html` for SPA deep links, including `/reset-password`. Add the exact deployed origin plus `/reset-password` to the allowed redirect URLs in Supabase Authentication → URL Configuration. The recovery flow uses the standard Supabase recovery email confirmation link. Confirm delivery and callback handling using a dedicated staging account before enabling the workflow for users.

## Regression checks

```sh
npm ci
npx playwright install chromium  # when Chromium is not already installed
npm test
```

The browser suite starts its own Vite server on port 4174 with fictional Supabase settings and intercepts API requests. It exercises retry/partial-save behavior, availability failures and overlaps, stale search pages, session/permission recovery, and listing/category reads. It never needs real Supabase credentials or writes live data. The configuration uses `/usr/bin/chromium` when available; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use another installed Chromium binary.

These tests validate frontend behavior against controlled API responses. They do not establish deployed RLS, database constraints or real authenticated end-to-end behavior.

## Current implementation

- Email/password accounts with email recovery, editable individual/business profiles and administrator route checks.
- Create/edit listings with category details, prices/deposits/terms, up to ten photographs, availability status and soft removal.
- Keyword/category/text-location/price search and sorting.
- Rental requests, owner decisions, booking schedule/history, simulated payments and reviews.
- Text conversations, unread message counts, listing reports and administrator report resolution.
- Private individual/business verification requests, administrator approval/rejection, and protected-profile verified badges.

The existing architecture is in `src/pages`, `src/components`, `src/hooks`, `src/context` and `src/lib`; visual tokens live in `src/styles/tokens.css`.

## Supabase schema and live validation

The checked-in migration records the foundation tables, privileges/RLS, category seed and `listing-photos` bucket. It does not contain the later definitions used by bookings, conversations/messages, reviews, reports, simulated payments or search/availability/resolution RPCs. The separately exported verification definitions are recorded in `supabase/contracts/verification.json`; later booking/messaging/search definitions still need repository records. Review deployed definitions before proposing schema changes. Do not replay the foundation migration against an existing project as a repair.

Live verification also requires network access to the configured project hostname and appropriate test users. Preserve database enforcement: frontend route checks and date checks are usability defenses, not substitutes for RLS, transactional booking constraints or authorized RPCs.

[Initial integration handoff](MILESTONE_3_HANDOFF.md) · [Verification contract and acceptance](VERIFICATION_TESTING.md) · [Release readiness](RELEASE_READINESS.md)
