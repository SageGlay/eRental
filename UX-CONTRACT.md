# eRental interaction contract

This records shared marketplace interactions, including protected account verification and the 3.0 presentation contract. Visual ownership is in [DESIGN.md](DESIGN.md); runtime values remain in `src/styles/tokens.css`.

## Business evidence

The current user brief and the user-supplied [Supabase metadata export](supabase/contracts/verification.json) are the business/API evidence. The export contains constraints, column grants, RLS, Storage policy and function/trigger definitions; it is not automatically applied as a migration. Actual live RLS and concurrent transactions require separate tests.

- Individuals submit identity verification; business accounts submit business verification with a business name. The server enforces this in `prepare_verification`.
- Documents are JPEG/PNG/WebP/PDF at most 5 MB, privately stored in `verification-documents` with the authenticated user's UUID as the first folder.
- Table INSERT grants allow only user_id, kind, document_type, document_path and details. Status/ID/review fields are server-owned.
- One pending request per user; server rate limit is five submissions per day. Rejected/unverified accounts can resubmit subject to those rules.
- The administrator RPC accepts approve/reject, requires a reason for rejection and enforces is_admin. Notes/details are optional when allowed, trimmed, at most 500 characters.
- Only profile verified_kind plus verified_at produces a badge. Profile identity-field changes clear verification via an existing trigger.
- Storage has no verification-document UPDATE/DELETE policy. The UI must not upsert, promise client cleanup, loosen RLS or create public URLs.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native labelled select / `.field` | DESIGN + existing forms | native | Browser filter/type selection |
| Date | Native date input in `RequestForm.jsx` | Existing booking/date-only contract | native | Existing date/overlap browser tests |
| Form | `.field`, `LoadError`, guarded feature form | Existing form patterns + service contract | submit / retry / review | Validation, pending/error/success browser cases |
| CRUD | verification service + guarded routes | Exported grants/RPC | user submit / admin review | Owned path, allowed columns, review RPC tests |
| Dialog | `Dialog.jsx` | UX contract | review / confirmation | Escape, focus containment/recovery, busy timeout |
| Scrollbar | `base.css` | Runtime tokens | native geometry | Visible global baseline, system forced colors |
| Badge | `VerifiedBadge.jsx` | Protected profile fields | identity / business | Public/profile display and no historical approval inference |
| Private document | `VerificationDocument.jsx` | Storage SELECT RLS | image / PDF via private download | Denial, path normalization defense, blob revocation |

No selection grid, bulk review or toast provider is added. Existing feature pages retain their established behavior unless changed by the milestone.

## Routes and states

`/verification` requires authentication and is linked from My profile. `/admin/verification` requires the current session's verified admin role and is linked from the existing administrator area. Existing `/admin` listing reports remain functional.

Status is unavailable while required reads fail or load; an error is not Not verified. A valid approved profile is authoritative; otherwise a pending submission or latest rejection explains status. Historical approval alone cannot grant a badge. Refresh status rechecks both current profile and owned submissions. User history is explicitly limited to the ten most recent requests.

The admin queue keeps status/sort/page in URL parameters, uses ten-record traditional pagination and server count, sorts only created_at/id, and renders cards on mobile. Filter/sort changes reset page. Out-of-range PGRST103 returns to page 1 with filters retained.

## Mutations and recovery

Submission validates type/size/signature before upload. A form keeps one collision-resistant private path per attempt. Unknown upload completion is reconciled with a private metadata lookup; unknown insert completion is reconciled by exact owned document path before retry. The form retains its file/details for that attempt and locks conflicting edits. Storage waits are bounded, but the installed SDK cannot cancel uploads; a timed-out upload may finish privately and is reconciled before retry. No IDs/status fields are forged to get around column grants.

Successful submission is acknowledged only after confirmed persistence. A private upload whose insert can never be completed can remain unused; cleanup requires an authorized operational action outside this client, not a new deletion policy. Reloading the page discards in-memory retry state.

Admin decisions use only review_verification, after an app-owned confirmation. Rejection requires a nonblank reason. A mismatched account type or unsafe document path cannot be approved in this UI. Busy review waits have a 15-second deadline; uncertain results preserve the note and require queue refresh before another attempt. No success is shown on a failed/uncertain RPC.

The existing RPC needs separate backend hardening for concurrent decisions/account-type edits. The [proposal](supabase/proposals/20261118_serialize_verification_reviews.sql) is reviewable and undeployed. UI guards do not fix that hosted concurrency gap.

## Privacy and accessibility

Identity documents are fetched with the authenticated SDK only on explicit request, with no-store and a timeout. URL-reserved/encoded path characters and dot traversal are rejected before privileged viewing. Viewer blob URLs are revoked on hide/unmount; no service-role key, public document URL, document contents or bearer links are logged or persisted in browser storage. Already downloaded/opened content cannot be remotely recalled.

Native dialogs provide inert background, focus trapping and Escape. Focus stays inside confirmations and moves to a stable queue heading after completed reviews; it returns to the opener when canceling a review. Errors use role=alert, success uses role=status, and invalid file selection regains focus after the form is enabled. Modern Chromium/keyboard/narrow viewports are exercised; full assistive-technology/platform conformance is not inferred from static checks.

## eRental 3.0 presentation and navigation contract

The handover-tag identity, responsive navigation and role-specific workspaces share the existing Supabase authorization model. Email recovery uses Supabase Auth without a database migration.

- `ThemeProvider` / `ThemeControl` own light, dark and system preferences. Only the theme preference is stored under `erental-theme`; an early HTML script applies the resolved mode before startup. System media changes and other-tab preferences update the active mode. Native select popup geometry is accepted for theme/filter/account controls; native date popup remains accepted for booking dates.
- `Brand` and `Icon` own shared identity and iconography; `PageHeading`, `.btn`, `.field`, `LoadError`, `EmptyState` and `ListingSkeleton` own shared presentation. Runtime semantic tokens in `tokens.css` supply both themes, including private dialogs and alerts.
- The desktop bar exposes search and account tasks. Its native account disclosure supports Escape and outside close. A mobile dock exposes frequent destinations, with a separate labeled menu for account, owner and authorized admin links. The menu closes on navigation and restores focus on Escape. Search opens the browse keyword field. An offline status appears when the browser reports lost connectivity.
- Browse commits filters to existing URL keys and retains load-more/stale-response protection. Each applied filter can be removed independently. Mobile filters use a disclosure, keyword entry remains available and clear actions restore focus. IME composition cannot submit the homepage search early.
- The listing editor groups inputs and displays a draft review, including a cover and rate. Create/edit/profile retain mutation destinations, values on failure and retry identities. Dirty forms intercept app-linked exits, router Back/Forward departures and actual document unload. Same-page section links remain available. Drafts and private submission documents stay in memory.
- Protected entries can return a guest to the requested task after login through a validated local destination. Recovery uses a fixed same-origin callback and an in-memory Supabase Auth client isolated from the ordinary account session. A missing or invalid recovery link offers a new link request. An ordinary signed-in session alone cannot enable the reset form.
- Bookings preserve renter/owner transitions, price computation and simulated-payment RPC. Confirmation names significant actions. Payments remain explicitly simulated. Reviews and reports preserve existing payloads and eligibility.
- Inbox/conversations retain their existing periodic refresh model and read-marker semantics. Refresh controls do not claim realtime delivery. No new chat backend or delivery guarantees are introduced.
- Removed owner listings retain the existing visibility behavior; the interface does not invent a removed-history API. Non-sensitive page status filters may use URL parameters; actual data and permission checks remain server-owned.
- Canonical CRUD evidence remains the existing reliability/core/verification tests; `tests/e2e/redesign.spec.js` adds theme, responsive and shared-control checks. Browser fixture tests never establish live RLS or production readiness.

- Inbox filters and thread search operate on the signed-in user's loaded conversations. Booking dates from PostgreSQL DATE remain calendar dates across time zones. An uncertain moderation decision requires a fresh queue read before another decision. Reports and verification confirmations identify the subject.
