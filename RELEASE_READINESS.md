# Release readiness

**Go for a controlled fixture demonstration. No-go for a hosted pilot with real users or identity documents.**

The eRental 3.0 frontend passed its browser fixture suite and build. A hosted pilot still requires observed results for the deployed Auth, Storage, booking and moderation rules, including the real verification flow. [Verification results](VERIFICATION_SECURITY_TEST_RESULTS.md)

| Gate | Status | Evidence or action |
| --- | --- | --- |
| Verification baseline on eRental 3.0 | Pass locally | The original nine PostgreSQL tests passed on the main-branch baseline `116d4ae`. |
| Frontend regressions and deployment build | Pass locally | All 145 Playwright tests passed using fixture responses. The Vite production build succeeded with fictional public settings. |
| Fixture CI | Configured | Actions workflow runs clean install, Chromium, Playwright and build with public fictional settings. The database job uses its own container. |
| Responsive and keyboard recovery | Pass in exercised Chromium cases | Five widths in both themes, scoped contrast, focus, dialog, motion, labelled fields, no overflow in covered routes and Back/Forward. Physical touch, other engines and assistive technology remain to confirm. |
| Verification serialization and rollback | Pass in the disposable database | All 20 PostgreSQL 17.12 tests passed, including competing reviews in independent sessions, account edits, restricted privileges and exact restoration of the prior function. [Test evidence](VERIFICATION_SECURITY_TEST_RESULTS.md) |
| Hosted connectivity and configuration | Blocked | The workspace lacks a designated staging project, its test identities and a metadata connection. The earlier public build URL also included a query string. Confirm the staging reference, plain project URL and authorized SQL access. |
| Live permissions and real workflow acceptance | Blocked | Verification VS01–VS12 await five designated accounts. Native Storage, booking overlap, payment/refunds and report/review rules also require observed results. [Verification staging procedure](VERIFICATION_SECURITY_DEPLOYMENT.md) |
| Supabase advisories | Open | Compare live metadata. Keep intentional default-deny for admin membership. Review definer scope and effective grants. Check leaked-password protection in the dashboard. |
| Production verification workflow | No-go | Hosted rollout requires a fresh schema and ACL comparison, staging acceptance, rollback rehearsal and separate production authorization. Verify the deployed function, privileges and approved smoke checks after deployment. |

The next milestone should be **Staged pilot acceptance**. Resolve connectivity, capture current deployed metadata, qualify a staging target, execute the live results matrix and rehearse the guarded rollback. Review the results with a designated administrator before opening the marketplace to real users.

See [live test results](LIVE_TEST_RESULTS.md), [live acceptance steps](LIVE_INTEGRATION_TEST_PLAN.md) and [the security audit](SECURITY_AUDIT.md).
