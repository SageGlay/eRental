# Account verification security handoff

**Ready for repository review and designated staging. Production rollout is blocked.** Migration `20261119184647` hardens the review RPC used by eRental 3.0. The starting revision was `116d4ae` on `main`. Verification used synthetic documents and accounts. The current hosted database definition, native Auth and Storage enforcement, and Security Advisor results still require staging evidence. [Audit](VERIFICATION_SECURITY_AUDIT.md) · [Results](VERIFICATION_SECURITY_TEST_RESULTS.md) · [Deployment and rollback](VERIFICATION_SECURITY_DEPLOYMENT.md)

## What reviewers can verify

- A review derives the actor and administrator membership on the server. Two administrators deciding the same case compete for one submission lock. A waiting reviewer can proceed if the first transaction rolls back. Once a decision commits, its reviewer, note, time and badge survive a later review attempt.
- Approval also locks the applicant profile. The submission kind must match the current account type, and a business needs a nonblank name. Badge and decision commit together. A later edit of protected identity fields clears the current badge and keeps the historical decision. Rejection records a reason and leaves existing badge fields alone.
- The dashboard refreshes its queue when a reviewer dismisses an uncertain decision. Authenticated private downloads now pass the same MIME allowlist, size and signature checks as uploads before a preview URL is created. The existing storage policies continue to govern actual access.
- The guarded migration compares the recorded predecessor, owner and permission posture. The guarded inverse restores that predecessor. On disposable PostgreSQL, real sessions verified blocking and both winning outcomes. The CLI rehearsal verified application, rollback, migration-history repair and recovery from a failed history write. [Test cases A–J and staging status](VERIFICATION_SECURITY_TEST_RESULTS.md)

## Files changed from main

| Area | Files and purpose |
| --- | --- |
| Versioned SQL | [Forward migration](supabase/migrations/20261119184647_harden_verification_review.sql) and [manual rollback](supabase/rollbacks/20261119184647_harden_verification_review.sql). They supersede the removed `supabase/proposals/20261118_serialize_verification_reviews.sql` and `supabase/proposals/20261118_serialize_verification_reviews.rollback.sql`. |
| Catalog and database tests | [Release diagnostic](supabase/diagnostics/verification_release_check.sql) reports function fingerprints, effective grants and trigger state. [PostgreSQL suite](tests/postgres/verification.test.js) exercises the actual migration, roles, contention, transaction failures and rollback. |
| Browser behavior | [Private document validation](src/lib/verification.js), [administrator review and refresh](src/pages/AdminVerificationPage.jsx) and [verification browser regressions](tests/e2e/verification.spec.js). |
| Milestone evidence | [Security audit](VERIFICATION_SECURITY_AUDIT.md), [test results](VERIFICATION_SECURITY_TEST_RESULTS.md), [deployment runbook](VERIFICATION_SECURITY_DEPLOYMENT.md) and this file, `VERIFICATION_SECURITY_HANDOFF.md`. |
| Existing project guides | [Security audit](SECURITY_AUDIT.md), [verification testing](VERIFICATION_TESTING.md), [release readiness](RELEASE_READINESS.md), [live integration cases](LIVE_INTEGRATION_TEST_PLAN.md) and [UX contract](UX-CONTRACT.md) point to the current migration and evidence. |

## Release decision and ownership

The staging operator needs the designated project, an authorized SQL connection and five test identities. Capture the live catalog and migration history first. Check that only the reviewed version is pending, pause and drain reviews for the cutover, compare the resulting definition and effective grants, run VS01–VS12 with native services and rehearse rollback. Production requires a separate explicit authorization for the reviewed migration and named project. [Operator procedure](VERIFICATION_SECURITY_DEPLOYMENT.md)

The reviewer sees profile details loaded with the queue. There is no immutable name snapshot on the submission. Refresh the queue and compare the document again when identity details may have changed. File signatures identify supported formats and give no assurance about document authenticity. A previously opened or saved document can persist after the app revokes its preview URL. An authorized operator must handle orphaned private objects under the project's retention policy.

Restoring the former function reopens its known concurrency and eligibility gaps. Keep administrator reviews paused in that state. Restoring code preserves decisions already committed and does not repair any historical inconsistency. [Rollback conditions](VERIFICATION_SECURITY_DEPLOYMENT.md#rollback-and-production-gate)
