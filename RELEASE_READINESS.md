# Release readiness

**Go for a controlled fixture demonstration. No-go for a hosted pilot with real users or identity documents.**

The eRental 2.0 frontend can be exercised with the repository's browser fixtures. Use those fixtures for a demo of owner/renter/admin paths and recovery. A real pilot requires evidence that the actual deployed Auth, Storage, booking and moderation rules enforce the documented behavior.

| Gate | Status | Evidence or action |
| --- | --- | --- |
| Latest-main baseline | Pass | 96 existing browser tests and production build passed from `f906844`. |
| Frontend fixes and deployment build | Pass locally | See exact results in the handoff. The approved palette and workflow layouts stand. |
| Fixture CI | Configured | Actions workflow runs clean install, Chromium, Playwright and build with public fictional settings. The database job uses its own container. |
| Responsive and keyboard recovery | Pass in exercised Chromium cases | Five widths in both themes, scoped contrast, focus, dialog, motion, labelled fields, no overflow in covered routes and Back/Forward. Physical touch, other engines and assistive technology remain to confirm. |
| Verification serialization and rollback | Pass in the disposable database | Proposal, isolated two-session tests and rollback are ready for staging. Hosted rollout is still pending. |
| Hosted connectivity and configuration | Blocked | Cloud URL query must be corrected. The proxy blocks requests to the existing project. Confirm public catalog and read fresh metadata from approved connectivity. |
| Live permissions and real workflow acceptance | Blocked | Designated project and approved accounts needed. Role checks, Storage, booking overlap, payment/refunds and report/review rules need observed results. |
| Supabase advisories | Open | Compare live metadata. Keep intentional default-deny for admin membership. Review definer scope and effective grants. Check leaked-password protection in the dashboard. |
| Production verification workflow | No-go | The recorded server-side review race is a release blocker until staging validation and explicitly authorized rollout. Attest that the deployed function and roles match the tested contract. |

The next milestone should be **Staged pilot acceptance**. Resolve connectivity, capture current deployed metadata, qualify a staging target, execute the live results matrix and verify the planned SQL and rollback. Review the results with a designated administrator before opening the marketplace to real users.

See [live test results](LIVE_TEST_RESULTS.md), [live acceptance steps](LIVE_INTEGRATION_TEST_PLAN.md) and [the security audit](SECURITY_AUDIT.md).
