# Verification UI contract

This records implemented behavior for the account verification milestone, not a new general roadmap. Visual ownership is in [DESIGN.md](DESIGN.md); runtime values remain in `src/styles/tokens.css`.

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
