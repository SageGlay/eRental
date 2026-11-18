# Live integration results

Recorded on 18 November 2026 for `codex/integration-security-validation`. Account labels and the exact preconditions, steps and expected results are in [LIVE_INTEGRATION_TEST_PLAN.md](LIVE_INTEGRATION_TEST_PLAN.md). No designated hosted staging project or approved test identities were available in this workspace. The user's locally configured Supabase environment has separate connectivity from this cloud workspace.

| Case | Role | Observed result | Status / evidence |
| --- | --- | --- | --- |
| L0 public catalog connection | Guest | Read-only GET for at most one category ID at the existing HTTPS project origin. The proxy returned CONNECT 403. The origin issued no HTTP response. No response body or credentials were retained. | **BLOCKED**. curl exit 56, HTTP 000, proxy 403. |
| L1 deployed SQL metadata | Authorized database owner | Current database ACLs and function definitions could not be retrieved from this workspace. Compared the existing project-owner export to the proposal as recorded evidence. | **BLOCKED**. Current export pending via [read-only SQL](supabase/diagnostics/milestone_3_security_contract.sql). |
| A01 registration and email | R | No approved test address or environment used. | **BLOCKED**. |
| A02 login/logout/restore | R | No hosted login performed. | **BLOCKED**. Fixture wrong-password and auth checks passed. |
| A03 expiry/account switching | R/X | No hosted sessions used. | **BLOCKED**. Browser fixture expired-session and account-switch cases passed. |
| A04 profile edits | B | No hosted profile edited. | **BLOCKED**. |
| D01 real discovery and details | Guest | Public network read did not reach Supabase. | **BLOCKED**. See L0. |
| D02 search/filter/paging/empty | Guest | Hosted search RPC was not called. | **BLOCKED**. Fixture search and Back/Forward passed. |
| L01 publish, edit, availability | O | No hosted listing or photo writes. | **BLOCKED**. |
| L02 ownership denial | X | No designated target or account. | **BLOCKED**. |
| L03 photo recovery | O | No hosted upload attempted. | **BLOCKED**. Fixture partial-upload and stable ID cases passed. |
| L04 soft remove | O | No hosted change attempted. | **BLOCKED**. |
| B01 request/dates/deduplication | R | No hosted booking created. | **BLOCKED**. |
| B02 accept/decline | O | No hosted decisions attempted. | **BLOCKED**. Fixture calls and recovery passed. |
| B03 cancel/complete | R/O | No hosted state transitions. | **BLOCKED**. |
| B04 overlapping accepted dates | R/B/O | No hosted concurrent booking transactions. | **BLOCKED**. |
| B05 booking isolation | X | No approved unrelated fixture identity. | **BLOCKED**. |
| P01 simulated payment and duplicates | R | No hosted payment simulation. | **BLOCKED**. Fixture RPC and uncertain-result reconciliation passed. |
| P02 eligibility/refund | X/O/R | No hosted deny or refund transaction. | **BLOCKED**. |
| M01 message, read, unread | R/O | No hosted thread or messages. | **BLOCKED**. |
| M02 message isolation | X | No approved unrelated account or test conversation. | **BLOCKED**. |
| M03 uncertain send recovery | R | No hosted send. | **BLOCKED**. Browser fixture checked one stored copy after an unconfirmed response. |
| R01 review/eligibility | R | No hosted review posted. | **BLOCKED**. |
| T01 report/dismiss/remove | R/A1 | No hosted report moderation. | **BLOCKED**. |
| T02 unauthorized resolution | X | No live definer call attempted. | **BLOCKED**. |
| V01 individual/business submission | R/B | No private documents uploaded. | **BLOCKED**. |
| V02 review and private file | A1 | No hosted review or private download. | **BLOCKED**. |
| V03 unrelated verification access | X | No hosted submission/file/role probes. | **BLOCKED**. Local PostgreSQL metadata rules passed. |
| V04 protected profile fields | R/X/B | No hosted verification-field writes attempted. | **BLOCKED**. Local grants rejected the staged owner write. |
| V05 competing reviews and edits | A1/A2/R/B | Proposal was executed and rolled back in disposable local PostgreSQL. No stage or hosted function was changed. | **BLOCKED** for hosted. Local concurrency, grants and rollback **PASS**. |
| UI01 real backend cross-device acceptance | All roles | No physical devices or real-backend browser sessions. | **NOT RUN**. See fixture and independent review evidence in the handoff. |

No hosted case received a passing result. The nine isolated database cases and the browser suite have their own results in [MILESTONE_3_HANDOFF.md](MILESTONE_3_HANDOFF.md).

To continue, copy the plain project URL from **Supabase → Connect** without its query or fragment. The workspace's configured URL had a query string. The proxy must permit the project hostname for any cloud-hosted checks. A local browser that already reaches the project can perform the public catalog check and run the metadata diagnostic through the SQL Editor. Mutating acceptance cases require the designated project and approved test accounts.
