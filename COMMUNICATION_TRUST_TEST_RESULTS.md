# Communication and trust test results

The baseline ran from a detached checkout of `9f7da46`. The locked installation and Vite build succeeded, all 169 Chromium tests passed in 3.4 minutes and all 34 PostgreSQL tests passed in 55.20 seconds. Browser tests use synthetic Auth and PostgREST responses. The new message transport tests also simulate the Realtime protocol in Chromium. [Baseline and source limits](COMMUNICATION_TRUST_AUDIT.md)

## Repository evidence

| Check | Observed outcome |
| --- | --- |
| Browser regression and release checks | The broad `npm test` run passed all 175 cases in 7.5 minutes. A second run of 36 affected browser cases on release commit `cd59e9e` passed in 1.2 minutes. That run included the ten additional communication and viewing cases, giving 185 distinct passing cases across the two runs. |
| Clean release build | `npm ci` installed 84 packages. `npm run build` processed 190 modules in 7.55 seconds using fictional public Supabase settings. |
| `npm run test:db` | All 58 tests passed on PostgreSQL 17.12 in 127.37 seconds with zero failures or skips. This includes the 34 earlier checks and 24 new cases. |
| Communication PostgreSQL | Ten focused cases on PostgreSQL 17.12. Verified participant access, protected read markers, stable retry identity, block/send and block/conversation races, limited private evidence and one committed report decision. |
| Viewings PostgreSQL | Six focused cases covered authorized creation, reschedule and cancel transitions, history, spoofing and invalid schedules, concurrent overlapping confirmations and a block racing a new request. |
| Reviews PostgreSQL | Seven focused cases covered completed-rental eligibility, historical owner attribution, weighted public averages, owner-only replies, private disputes, concurrent resolution and rolled-back decisions. |
| Complete SQL chain | Applied verification, Marketplace Essentials and the four new versions to a disposable database. Confirmed that the verification fingerprint and anonymous restriction remained intact, a retried send emitted one inquiry notice, and only the listing owner saw inquiry and viewing notices. |
| Supabase CLI 2.122.1 | An isolated PostgreSQL rehearsal listed the four intended pending versions, applied them in order, recorded all four in history, and returned a clean repeat dry run. |
| Communication browser tests | Six targeted Chromium cases covered editable quick replies, exact retries, block and unblock, report submission and moderation, and reconnect/refetch through a simulated socket. Ten earlier messaging and responsive regressions also passed in a targeted run. |
| Viewing browser tests | Four targeted Chromium cases covered Manila time conversion in a US browser, request retry identity, owner confirmation, reschedule history, cancellation and guest return to the listing. |
| Review browser tests | Five targeted Chromium cases covered private owner controls, published rating display, owner profile fields and five viewport widths, dispute evidence and stale review recovery. |
| UI review | An independent review found stale resolution recovery and a viewing focus defect. The review dialog now handles the finalized SQLSTATE independently of its HTTP status and exposes the dispute reason inside the dialog. The viewing flow restores focus when returning from review to edit. |

The PostgreSQL fixture runs the actual migrations and uses independent sessions for contention. Hosted booking, message and review definitions remain prerequisites. A local fake JWT claim and browser protocol stub do not verify native Supabase service access. All 18 hosted scenarios and the hosted Security Advisor are blocked until a designated staging project, compatible migration history and authorized test identities are available. [Manual acceptance](COMMUNICATION_TRUST_MANUAL_TESTING.md) · [Deployment](COMMUNICATION_TRUST_DEPLOYMENT.md)
