# Account verification: manual and automated testing

## What is implemented

Open My profile → **Account verification** (`/verification`). Authorized administrators can open Admin → **Account verification** (`/admin/verification`). The existing listing-report admin page remains at `/admin`.

The frontend uses the recorded verification contract supplied by the project owner. The release runbook compares that snapshot with fresh metadata from the designated staging project before applying the migration. [Contract snapshot](supabase/contracts/verification.json) · [Deployment procedure](VERIFICATION_SECURITY_DEPLOYMENT.md)

Browser fixture tests run with fictional API responses. They do not upload real documents or prove live RLS. The live acceptance cases in this guide remain unrun until project connectivity and designated test accounts are available.

## Before testing

1. Follow [LOCAL_SETUP_AND_TESTING.md](LOCAL_SETUP_AND_TESTING.md) and start Vite. Open `http://localhost:5173/` on that computer.
2. Use five designated staging accounts, including an individual applicant, a business applicant, an unrelated ordinary user and two existing authorized administrators.
3. Create a non-sensitive sample image/PDF marked **TEST DOCUMENT — NOT VALID ID**. Do not use real identification for development tests.
4. The existing private bucket accepts JPEG, PNG, WebP and PDF, up to **5 MB**. It must remain private.
5. Never disable RLS, add a hardcoded admin account, share service-role keys, reset/reseed the project or modify production users merely for a demo.
6. Record every live case as passed/failed/blocked with observed results; do not infer a pass from the presence of tables or buttons.

## Ordinary individual user

1. Log in, open your profile, then **Account verification**. A new account shows **Not verified**. No badge should appear.
2. Select Government ID, School ID or Other identity document. Business registration is not offered to individuals.
3. Try no file, an empty file, an unsupported format, an oversized file and a file whose contents do not match its MIME type. Each should display an error without uploading. The invalid input should regain keyboard focus.
4. Select a valid sample. Add optional details (up to 500 characters) and click **Submit verification request**.
5. Confirm a loading state, then a receipt message and **Pending** after confirmed persistence. Refresh the page: the pending request must remain, with no duplicate submission form or verified badge.
6. In the Supabase dashboard, an authorized maintainer can confirm the sample is in `verification-documents` under that user's UUID folder and the row belongs to that user. Do not share file contents/paths publicly. The frontend must not produce a public document URL.
7. If submission fails after upload, keep the page open and use **Retry submission**. The same private path should be reused; successful upload work should not repeat. Changing the file/details for an uncertain attempt is locked until it is resolved.
8. The existing rules allow one pending request at a time and at most five submissions in a day. Do not bypass those rules to run extra tests.
9. After a rejection, click **Refresh status**. Confirm **Rejected**, the permitted reason and no badge. Submit another permitted sample if the rate limit allows.
10. After approval, refresh. Confirm **Approved**, the verification date and **Identity verified** from the profile fields. A historical approved request alone must never produce a current badge.
11. Change the display name in My profile. The existing database trigger clears verification; after profile refresh the badge should disappear and a new review is required.

## Business user

1. Log in as a designated business account. In My profile, confirm Rental business and a valid business name. Profile edits can clear an existing verification.
2. Open verification. The choices are Business registration or Other business document; identity-only document types are not offered.
3. Submit a permitted non-sensitive sample. Confirm a business-kind pending request, private upload and no badge before approval.
4. After admin approval, confirm **Business verified** in My profile and the listing owner area. An identity badge must not be relabelled as business verification.
5. If the business name/account type changes, confirm the profile trigger clears verification and the UI reflects the fresh profile. A business account without its required business name cannot submit.

## Administrator

1. Log in as an existing authorized administrator. Open Admin → Account verification. Direct navigation as a regular user must show the denial state; signed-out visitors go to login.
2. Filter Pending/Approved/Rejected and change newest/oldest sorting. Confirm ten records per page, correct counts/ranges, matching mobile cards, and that Back/Forward restores filter/sort/page URLs. Reviewing the last record on a later page must recover to a valid page.
3. Click **Review request**. Compare the applicant name or business name loaded with the queue against the request and sample document. Close the review and refresh the queue to check for profile edits. The native modal should initially focus Close, trap Tab navigation, close on Escape while idle, and restore focus on cancel.
4. Click **View private document**. The SDK downloads it with the authenticated session; images display in the dialog and PDFs can open through the transient document link. No public URL is generated. Close/Hide the document when finished. The local blob URL is revoked on close; content already opened or downloaded cannot be remotely recalled.
5. Add an optional approval note. Click **Approve**, read the named confirmation, then **Confirm approval**. The client must call `review_verification` with `p_action = approve`, not PATCH submission status/profile badges. Confirm the queue refreshes and the real applicant profile changes.
6. For another pending sample, click Reject with no note. Confirm a required-reason error and note-input focus. Enter a reason, choose Reject, then Confirm rejection. Confirm the rejected request/note is visible to its applicant and no badge is granted.
7. A changed/mismatched account type or unsafe document path disables approval in this UI. The request may still be rejected with an explanation; do not manually grant a badge to work around an error.
8. For an uncertain RPC result, confirm the dialog shows the error and preserves the note while open. Use **Refresh queue** or dismiss the dialog. A fresh read must finish before another decision is available. If the first decision committed, the request must have left the pending queue.
9. After a successful review removes its row, keyboard focus should move to the stable queue heading. At 390px/320px widths, modal content/actions must remain reachable without document-level horizontal overflow.

## Cross-user security checks — live environment required

Use two designated test users and only known sample IDs/paths:

- As user B, attempt user A's submission read and private object download directly, not only through hidden UI. Expect denial/no row under RLS.
- Repeat signed out. Neither verification submissions nor documents should become public.
- As a regular user, attempt `review_verification` directly. Expect **Admins only**/authorization denial.
- Attempt to update `profiles.verified_kind`/`verified_at`, submission status/reviewer fields, or insert another `user_id`. The exported grants/RLS disallow these operations.
- Confirm the browser sends current-user authorization to Storage and never a privileged key.
- Do not loosen permissions if a sample is denied. Inspect the actual policy and intended test identity.

The hosted checks are **BLOCKED** until a designated staging project, its five test accounts and authorized access are available. Use the VS01–VS12 procedure to record results from the real Auth, RPC and Storage services. [Staging acceptance](VERIFICATION_SECURITY_DEPLOYMENT.md)

## Concurrent review and eligibility

Migration `20261119184647` locks a submission before examining its status. Approval also locks the current applicant profile and validates the requested verification kind, account type and business name. The original export and the hardened function have separate, recorded fingerprints. Confirm the actual hosted fingerprint before deployment. [Migration](supabase/migrations/20261119184647_harden_verification_review.sql) · [Deployment procedure](VERIFICATION_SECURITY_DEPLOYMENT.md)

Use the PostgreSQL suite for actual lock waits, duplicate and conflicting decisions, atomic failure, eligibility changes, role checks and the guarded rollback. The application stores no immutable name snapshot with a submission. Administrators should refresh the queue when checking a changed identity. [Database and browser results](VERIFICATION_SECURITY_TEST_RESULTS.md)

## Failure/retry and retention limits

The private bucket has SELECT/INSERT policies but no client UPDATE/DELETE policy. The UI intentionally does not upsert or delete identity documents. A private upload that cannot be associated with a submission may remain unused; operational cleanup requires an authorized maintainer under the project's retention policy. No cleanup permission was added.

Retry state is held only in the current page's memory. Reloading/navigating away loses that local state. The installed Storage SDK cannot abort an upload; a timed-out upload may finish privately in the background, so retry checks its exact key before sending it again. Reads/reviews have bounded recovery and no false success on unknown completion.

## Automated checks

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run build
npm.cmd run test:db
```

Playwright exercises the marketplace and verification screens with synthetic API responses. The verification cases cover upload validation, authorized previews, session changes, transient URL revocation, malformed paths, badge refresh and recovery after an uncertain review. The database command requires a working Docker daemon and starts a disposable PostgreSQL instance from the recorded contract. [Execution results and coverage](VERIFICATION_SECURITY_TEST_RESULTS.md)

## Refresh the contract export when schema changes

The owner-supplied export records the earlier schema. Capture fresh metadata on the designated project during staging preflight and after deployment.

1. Open the existing project in Supabase Dashboard → SQL Editor → New query.
2. Paste [verification_contract.sql](supabase/diagnostics/verification_contract.sql) and Run.
3. Copy the `verification_contract` result or export it as CSV. Share only the metadata, after checking custom function definitions for any hardcoded secrets; do not send keys, `.env` or a database backup.

The export is one read-only SELECT. It does not read user/submission rows or document contents and does not modify the database.
