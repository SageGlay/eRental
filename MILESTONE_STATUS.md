# eRental milestone handoff

Recorded 18 November 2026 (Asia/Shanghai). Built on GitHub main at `91671e8`, preserving the existing Vite/React/Supabase architecture and stored data.

## Implemented

**Local setup:** validated dependencies, Node 24.22.1/npm 11.9.0, Vite startup and served React/HTML; added beginner-friendly Windows/cloud setup and testing guides. The actual cloud checkout is `/workspace/eRental`; the user's Windows folder is `erental-foundation/erental`.

**User verification:** `/verification`, linked from My profile, requires authentication. It reads only the current user's requests, shows authoritative account status and recent private history, validates individual/business document choices and JPEG/PNG/WebP/PDF files up to 5 MB, and handles rejection/resubmission. Private uploads use UUID filenames in the current user's folder. Duplicate/uncertain completion, daily/pending limits, locked retry state, missing profiles, network failures and deadlines are handled without client-owned review fields.

**Administrator verification:** `/admin/verification`, linked from the existing admin area, requires the current admin check. It provides status filters, newest/oldest and submitted-column sorting, ten-record traditional pagination, URL restoration, mobile cards, private viewing and app-owned confirmation dialogs. Approval/rejection calls the existing `review_verification` RPC using its verified action strings. Rejection requires a reason; failed/unknown decisions retain the note and require queue reconciliation. Dialogs support keyboard, Escape, focus recovery and bounded waits.

**Badges:** one shared component derives identity/business badges only from protected `profiles.verified_kind` and `verified_at`. Badges appear in My profile, the verification status and listing-owner detail. Historical approval alone cannot grant one; fresh profile errors/loading do not display stale verification.

**Safety:** reviewed the project owner's actual exported constraints, RLS, column grants, triggers, RPC and Storage rules, now recorded in `supabase/contracts/verification.json`. INSERT omits server-owned id/status/review fields. Private documents use authenticated downloads and revocable local blob URLs, never public URLs. Encoded traversal, mismatched owners and URL-reserved/control characters are blocked before privileged viewing; safe legacy spaces/Unicode are encoded. No upsert/delete permission was invented for the private bucket.

The two verification screens are lazy-loaded so they do not inflate the initial marketplace bundle above Vite's default warning threshold. Existing marketplace pages, routes, listing reports, simulated payments and messaging are retained. No real payment, chat replacement, export, AI, new audit infrastructure or major navigation redesign was added.

## Exact files created or modified

- `DESIGN.md`
- `LOCAL_SETUP_AND_TESTING.md`
- `MILESTONE_STATUS.md`
- `README.md`
- `UX-CONTRACT.md`
- `VERIFICATION_TESTING.md`
- `premium-ui.json`
- `src/App.jsx`
- `src/components/AdminNavigation.jsx`
- `src/components/Dialog.jsx`
- `src/components/VerificationDocument.jsx`
- `src/components/VerifiedBadge.jsx`
- `src/context/AuthContext.jsx`
- `src/hooks/useVerificationSubmissions.js`
- `src/lib/verification.js`
- `src/main.jsx`
- `src/pages/AdminPage.jsx`
- `src/pages/AdminVerificationPage.jsx`
- `src/pages/ListingDetail.jsx`
- `src/pages/ProfilePage.jsx`
- `src/pages/VerificationPage.jsx`
- `src/styles/base.css`
- `src/styles/tokens.css`
- `src/styles/verification.css`
- `supabase/contracts/verification.json`
- `supabase/diagnostics/verification_contract.sql`
- `supabase/proposals/20261118_serialize_verification_reviews.sql`
- `tests/e2e/core-workflows.spec.js`
- `tests/e2e/verification-fixture.js`
- `tests/e2e/verification.spec.js`

## Existing frontend status

All listed existing features were present before this milestone. “Implemented but not fully tested” means the named browser fixture paths were executed, while live hosted behavior remains unverified; it does not infer functionality merely from a database table.

| Feature | Classification | Executed coverage / limit |
| --- | --- | --- |
| Login/registration | Implemented but not fully tested | Credential recovery, fixture sign-in and email-confirmation notice; live auth/email unrun |
| Profile editing | Implemented but not fully tested | Validation/failure recovery, returned-row confirmation, badge clearing after fixture profile update; live RLS unrun |
| Browse/search | Implemented but not fully tested | Filters, category recovery, stale/overlapping/empty pages; hosted search RPC unrun |
| Listing create/edit | Implemented but not fully tested | Retry identity, ownership checks, draft/read recovery; live own-row mutations unrun |
| Listing photos | Implemented but not fully tested | Partial/unknown completion and cleanup/limit cases; live Storage unrun |
| Booking requests/approvals | Implemented but not fully tested | Availability, overlaps, duplicate submit, accept/decline and status refresh; live constraints unrun |
| Simulated payments | Implemented but not fully tested | Existing RPC request and paid-record refresh; hosted transaction unrun |
| Text messaging | Implemented but not fully tested | Load/send/read markers; live participant RLS unrun |
| Reviews | Implemented but not fully tested | Completed-booking rating/comment and display refresh; live eligibility constraints unrun |
| Listing reports | Implemented but not fully tested | Reporter payload, confirmation and admin resolution/history; live permissions unrun |
| Admin report/verification controls | Implemented but not fully tested | Guarded entry, filters, private-view denial and correct RPC contracts; live authorization/concurrency unrun |
| Verification UI | Implemented but not fully tested | Individual/business submission, approval/rejection, retries, deadlines, privacy and badge fixtures; live sample operations unrun |

No existing feature was declared Broken just because network access is blocked. A full production readiness claim is not made.

## Validation and known warnings

- `npm ls --depth=0`: installed dependency tree valid.
- `npm run dev -- --host 0.0.0.0 --port 5173 --strictPort`: successfully started; Vite reported `http://localhost:5173/`. Internal HTTP checks served root HTML and transformed `/src/main.jsx`.
- `npm test`: **64 browser tests passed** (29 prior reliability checks, nine additional existing-core regressions, 26 verification checks). Fixtures use fictional accounts/sample documents and assert no uncaught browser exceptions. They never write live Supabase data.
- `npm run build`: passed. New route code splitting removes the larger-than-500-kB warning seen during an intermediate build; no threshold was relaxed.
- PostgreSQL parser: the diagnostic export parsed as one SELECT; the hardening proposal parsed as a CREATE FUNCTION. Neither was executed against a database. Parsing is not live PL/pgSQL/concurrency validation.
- DESIGN.md lint: zero errors; 11 informational token-reference warnings remain because runtime CSS owns semantic values rather than duplicating every reference in frontmatter.
- Strict UI static audit: eight legacy form/textarea findings remain in pre-existing marketplace components; no unresolved ownership or new verification findings. This is not an accessibility conformance pass.
- npm upgrade/color-environment notices are tooling notices, not application build failures.
- Live Supabase read probe: proxy tunnel **403 Forbidden**. Real RLS, authenticated Storage access, email delivery and database transactions were not exercised.

Independent static/browser fixture review found and verified fixes for encoded path traversal, last-page PGRST103 recovery, confirmation focus and timeout recovery. An isolated badge calibration copy incorrectly used submission approval alone; the separate checker identified it. The copy existed only in the review brief, so that calibration proves static badge-source checking, not layout or live authorization. Browser checks separately covered narrow screens, focus and blob revocation.

## Remaining backend/operational work

1. **Concurrency hardening is proposed, not deployed.** The supplied RPC reads pending status without a lock and can approve a submission whose account type changed. `supabase/proposals/20261118_serialize_verification_reviews.sql` locks the submission and profile and rechecks type/business-name eligibility. Review/test it in a designated database before production or concurrent-admin use; it is deliberately outside migrations and was not applied automatically.
2. Allow the configured Supabase project hostname through the cloud environment network policy, then run the real user/business/admin and cross-user denial cases in `VERIFICATION_TESTING.md` using designated accounts and non-sensitive samples.
3. The existing private bucket has no client UPDATE/DELETE policy. An upload that cannot be associated with a request can remain privately unused. Operational cleanup/retention requires an authorized maintainer; this client does not loosen policies or promise cleanup it cannot perform.
4. Retry state is page-memory only. Reloading loses it. The installed SDK cannot abort uploads, so an upload may finish after its UI deadline; retry reconciles the same key. Already opened/downloaded documents cannot be recalled from another tab.
5. Name/document snapshots and a new audit system are outside scope. Admins see current profile details. No user/transaction rows were altered just for demonstration.

No replacement Supabase project or new frontend secret is required. Existing variable names remain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; both are supplied. Never configure a service-role/secret key in Vite. Existing bucket/policies were inspected from the export and not changed.

## Local command and walkthrough

From the user's inner application folder on Windows:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173/` on that computer; stop with Ctrl+C. For browser tests, run `npx.cmd playwright install chromium` once, then `npm.cmd test`. See `LOCAL_SETUP_AND_TESTING.md` for errors, environment checks and cloud path differences. `VERIFICATION_TESTING.md` contains the regular-user, business-user, admin and private-data-denial walkthroughs with real labels/routes.

Recommended next development step: review/test the undeployed RPC hardening, restore live connectivity and execute those manual security/concurrency cases before treating the verification milestone as production validated.
