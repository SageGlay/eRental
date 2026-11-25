# Verification security test results

The hardened review RPC passed all **20 PostgreSQL tests** against the recorded eRental contract. All **145 Chromium tests** passed, including 29 verification cases, and Vite built the application successfully. Hosted staging acceptance is **BLOCKED**. The available evidence covers the repository and a disposable database. A staging project, five designated identities and authorized SQL access are still needed to verify the deployed system. [Security audit](VERIFICATION_SECURITY_AUDIT.md) · [Deployment and acceptance procedure](VERIFICATION_SECURITY_DEPLOYMENT.md)

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Clean dependency installation | PASS | `npm ci --cache /workspace/.npm --no-audit` installed the locked dependencies. |
| Original PostgreSQL suite on base `116d4ae` | PASS | 9 of 9 passed in 13.43 s on PostgreSQL 17.12. That suite exercised the earlier proposal in its own fixture. |
| `npm run test:db` with migration `20261119184647` | PASS | 20 of 20 passed in 39.58 s on PostgreSQL 17.12. Zero failures, skips or cancellations. Includes guarded forward application, inverse and reapplication. |
| `npm test` | PASS | 145 of 145 Chromium tests passed in 2.6 minutes across the marketplace, including authentication, listings, bookings, messaging and verification. Browser requests used synthetic Supabase responses. |
| `npm run build` | PASS | Vite transformed 155 modules and finished in 2.88 s with fictional public Supabase settings. |
| Disposable Supabase CLI rehearsal | PASS | CLI 2.122.1 listed exactly one pending migration, applied it, and recorded its version on isolated PostgreSQL 17.12. A second dry run was clean. The inverse restored the original definition and targeted history repair removed the version. A forced history-write failure rolled back the function change, and a subsequent apply succeeded. |

## PostgreSQL coverage

The suite started an isolated Docker database with synthetic roles and rows. PostgreSQL enforced the applicable grants, RLS, triggers, constraints and row locks from the recorded contract. Separate transactions held locks and the tests observed a blocked backend before releasing the first transaction. Auth identity and Storage folder parsing used local adapters. Storage checks exercised database metadata policies. [Database tests](tests/postgres/verification.test.js) · [Recorded verification contract](supabase/contracts/verification.json)

| Case | Result | Observed outcome |
| --- | --- | --- |
| A · Competing approvals | PASS | Two administrators reviewed the same pending request. The first committed approval determined the reviewer and badge. The waiting call failed. When the first transaction rolled back instead, the waiter could decide. |
| B · Approval versus rejection | PASS | Both commit orders were exercised. The first terminal decision survived. The applicant's badge matched that decision. |
| C · Duplicate review | PASS | After either approval or rejection, another review failed. The original decision, reviewer, note, review time and badge state persisted. |
| D · Account type changes | PASS | Approval waited for a profile edit and read its committed account type. Both identity and business requests failed when the applicant switched to the opposite type. A protected edit after approval cleared the badge and retained the review history. |
| E · Business name | PASS | Missing and whitespace-only names, including Unicode whitespace, blocked business approval. An eligible account with a business name received the business badge. |
| F · Ordinary user review | PASS | The authenticated ordinary role failed the server administrator check on both decisions. Direct membership insertion and writes to decision fields also failed. The pending request stayed unchanged. |
| G · Signed-out review | PASS | PostgreSQL denied the anonymous role execution of both approve and reject. The catalog showed zero PUBLIC or effective anonymous EXECUTE grants on the review RPC. |
| H · Protected profile fields | PASS | An ordinary applicant could not update `verified_kind` and `verified_at`. Neither client role had an effective write grant on either field. |
| I · Cross-user isolation | PASS | The owner and administrator could read synthetic submission and object metadata. Unrelated and signed-out roles received zero authorized rows or permission denial. Only the owner's valid upload succeeded. Existing object metadata survived attempted client overwrite and deletion. |
| J · Rollback | PASS | The inverse restored the original definition, OID, owner, arguments, result, search path and grants. The inverse refused a changed hardened definition. Forward application refused a changed original definition and unexpected PUBLIC access. |

A fixture constraint forced an error during the badge write. PostgreSQL rolled back both that write and the submission decision. An independent foreign-key reader holding a key-share lock could coexist with approval. The three catalog queries ran on the fixture and checked the private bucket, column grants, protected fields, role execution permissions, membership restrictions and enabled profile trigger. [Contract export query](supabase/diagnostics/verification_contract.sql) · [Security catalog query](supabase/diagnostics/milestone_3_security_contract.sql) · [Release check](supabase/diagnostics/verification_release_check.sql)

| Review RPC definition in the disposable catalog | SHA-256 of UTF-8 `pg_get_functiondef` |
| --- | --- |
| Before migration and after rollback | `431f69852d5fac7ebf518476792fb8f415775929155ca8e021e4899eb11f1023` |
| After migration | `cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7` |

## Browser verification

- Applicant tests covered individual and business submissions, upload validation, uncertain upload/insert recovery, rejection feedback, resubmission and badges derived from current protected profile fields.
- Reviewer tests covered signed-out and ordinary-user route denial, private document requests, confirmation and focus, queue refresh, decision errors and timeouts. Dismissing an uncertain decision now refreshes the queue before offering another review.
- Private preview tests checked refusal of unsafe paths and mislabeled synthetic content, compatibility with safe legacy filenames, and object URL revocation on close and on logout in another tab. These checks verified browser behavior with fixture responses. Hosted JWT validation, native object downloads and actual Storage service authorization require the staging cases below. [Verification browser tests](tests/e2e/verification.spec.js)

## Hosted staging acceptance

All twelve cases share the same blocker. The workspace has no designated staging project with authorized access for an individual applicant, business applicant, unrelated user and two administrators. Live schema comparison and the Supabase Security Advisor report also remain **BLOCKED**. No hosted SQL application or real document upload was performed. The staging operator can use the corresponding case ID to find the exact procedure, expected observation and rollback gate. [Staging runbook](VERIFICATION_SECURITY_DEPLOYMENT.md)

| Case | Hosted scenario | Actual status |
| --- | --- | --- |
| VS01 | Individual applicant submits synthetic identity evidence | BLOCKED |
| VS02 | Business applicant submits synthetic business evidence | BLOCKED |
| VS03 | Both administrators open and close an authenticated private document | BLOCKED |
| VS04 | Approval persists and refresh displays the correct identity or business badge | BLOCKED |
| VS05 | Rejection persists and the applicant receives the reason | BLOCKED |
| VS06 | Rejected applicant can resubmit and retain prior history | BLOCKED |
| VS07 | Ordinary and signed-out clients receive review denial | BLOCKED |
| VS08 | Unrelated and signed-out clients cannot read another applicant's private evidence | BLOCKED |
| VS09 | Protected badge fields deny direct client writes | BLOCKED |
| VS10 | Two authorized administrators compete for the same pending decision | BLOCKED |
| VS11 | A pending review observes a changed account type, and a later identity edit clears an approved badge | BLOCKED |
| VS12 | Refresh and account switching clear private evidence and stale reviewer controls | BLOCKED |
