# eRental Milestone 3 handoff

Prepared on 18 November 2026 from `main` at `f906844` on `codex/integration-security-validation`. The branch is ready for code review and a controlled fixture demonstration. A hosted pilot with real accounts or private files remains blocked by [the release gates](RELEASE_READINESS.md).

## Changes delivered

- Validated the existing Supabase public settings before creating the client. Valid HTTP/HTTPS base URLs work with publishable or legacy anon keys. Missing, malformed or privileged settings show a themed, accessible setup error on any route. Vite emits the validated configuration or a static error. The bundle and the setup UI contain no rejected values.
- Conversation metadata errors now offer retry before any message fetch. Pending, empty and failed threads have separate states. Changing the conversation ID resets notes and read state for the new thread. Reads and sends have deadlines, stale reads are canceled and refresh has a clear pending state. After an unconfirmed send, a fresh read checks for a newly seen matching message before offering another attempt. A later commit after a fresh read can still make a manual retry ambiguous, since message writes do not have a verified server idempotency contract.
- Booking reads and status/payment requests now have deadlines. Uncertain mutations require a fresh booking read before retry. Confirmed updates and focus survive moving an owner card into a different list group. A booking with no visible listing has no invalid listing link. Existing booking rules and simulated payment payloads are preserved.
- Added a CI workflow for the fixture browser suite, build and database tests. No production credentials are used. Added a read-only metadata export and a guarded review SQL proposal with a tested rollback. These SQL changes remain under proposals.
- User routes, existing Supabase session semantics, photo/listing retry IDs, private document handling and the five-color design remain intact.

## Checks performed

| Check | Actual result |
| --- | --- |
| Historical starting point | Redesign merge documented 96 browser tests. |
| Baseline reproduction | `npm ci` installed 84 packages. Node 24.22.1, npm 11.9.0, system Chromium. `npm test` passed 96/96 in 1.5 minutes. Baseline build passed, initial JS 440.84 kB. |
| Final `npm test` | **111/111 passed** in about 1.9 minutes. All 96 existing tests plus nine configuration cases and six recovery/session/history cases passed. The suite asserts against uncaught page exceptions. |
| Final `npm run build` with fictional valid Supabase settings | **Passed** in 2.92 seconds. Initial JS 441.48 kB / 127.37 kB gzip. Route splitting retained, no Vite chunk warning. The configuration suite also built with a rejected fixture key and inspected emitted assets. |
| Final `npm run test:db` | **9/9 passed** in 21.3 seconds on PostgreSQL 17.12. The two-session tests observed lock wait and durable winner, and exercised ACLs, profile eligibility, private metadata isolation and rollback. Synthetic users/storage rows only. |
| UI static audit | Strict mode returned zero findings. Shared styles use existing theme tokens. |
| Independent Chromium review | Setup passed 10 width/theme combinations at 320/390/768/1024/1440 px. Alert contrast was 6.71:1 light and 9.08:1 dark. Confirmed pending refresh, message reconciliation, booking feedback/focus, and Escape focus recovery. |
| Hosted connection | Public read blocked at proxy CONNECT 403. No hosted role, mutation, email or Storage acceptance case passed. See the live matrix. |

The browser matrix covers 150 route/theme/viewport combinations, including recovery, reduced motion, input names, keyboard navigation and no horizontal overflow in exercised screens. Real touch, native date controls across platforms, spoken screen-reader behavior and other browser engines remain unverified. Fixture browser and PostgreSQL results exercise separate layers. Legacy SDK-bound listing/photo and review flows remain subject to live outage and retry checks.

Browser tooling printed the inherited color-environment notices. npm printed an upgrade notice. No new application runtime error was observed in the final fixture suite. The independent accessibility checker was calibrated on an isolated scratch worktree with the setup alert announcement deliberately removed. The checker identified the missing alert. That calibration proves a static semantics check only. Browser behavior required the separate rendered checks. The scratch worktree was removed after review.

## Review and run

| Deliverable | Path |
| --- | --- |
| Feature inventory, gaps and baseline | [Repository audit](MILESTONE_3_AUDIT.md) |
| Test identities and step-by-step staged workflow | [Live acceptance plan](LIVE_INTEGRATION_TEST_PLAN.md) |
| Observed and blocked cases | [Live results](LIVE_TEST_RESULTS.md) |
| Advisory analysis, fresh metadata, rollout and rollback | [Supabase security audit](SECURITY_AUDIT.md) |
| Demonstration and pilot verdict | [Release readiness](RELEASE_READINESS.md) |
| Browser + database checks | [GitHub Actions workflow](.github/workflows/ci.yml) |

From the folder containing `package.json`:

```sh
npm ci
npx playwright install chromium
npm test
npm run build
# Run with Docker available. The tests create and remove their own database.
npm run test:db
```

The browser suite needs no real project variables. The build uses the safe setup screen when configuration is missing or malformed. For interactive use, set `VITE_SUPABASE_URL` to the existing project's plain Connect URL and `VITE_SUPABASE_ANON_KEY` to the matching public key, then run `npm run dev`. See [local setup](LOCAL_SETUP_AND_TESTING.md). Windows PowerShell can use `npm.cmd` and `npx.cmd`.

The next authorized milestone is staged acceptance. Obtain fresh metadata from the deployed project, confirm the applicable definitions, validate the proposal in a designated environment, and run the approved live matrix before a pilot. Follow the separate authorization and rollback steps in the security audit before altering any production functions.
