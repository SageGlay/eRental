# Live integration test plan

Use this plan in a designated Supabase test project or staging database with the same verified backend definitions as the intended pilot. The current workspace identified no designated hosted staging target or approved test identities. Use the corresponding IDs in [LIVE_TEST_RESULTS.md](LIVE_TEST_RESULTS.md) to record each observed result.

## Prepare a run

1. Confirm the approved project name and project reference in Supabase. Use a separate browser profile or contexts for each account. Keep normal RLS and Storage policies enabled. Use only synthetic records named with the run ID, for example `M3-20261118-camera`. A designated maintainer owns cleanup and retention.
2. Prepare these identities in the approved test project. An existing authorized administrator can confirm membership. Keep account credentials in the normal secure channel for your team.

   | Label | Role and purpose |
   | --- | --- |
   | R | Individual renter. Sends requests, starts a conversation, simulates payment, writes a review and submits identity verification. |
   | O | Individual owner. Publishes the fixture listing and acts on renter requests. |
   | B | Business account with a synthetic business name. Submits business verification and provides a second renter when testing overlapping accepted dates. |
   | A1, A2 | Two designated administrators for moderation and concurrency. Existing `is_admin()` must confirm each. |
   | X | Unrelated ordinary user. Has no relationship to the fixture transactions or administrator role. |

3. Open the eRental folder containing `package.json`. In PowerShell run `npm.cmd ci`. Set the two existing public variables for this terminal using the approved project's Connect dialog. Copy the bare project URL and its publishable or legacy **anon** key. Start `npm.cmd run dev -- --port 5173 --strictPort` and open `http://localhost:5173/`. On macOS or Linux use equivalent shell exports and `npm`.
4. Read the hosted metadata in **Supabase Dashboard → SQL Editor → New query**. Paste and run [the metadata diagnostic](supabase/diagnostics/milestone_3_security_contract.sql). It selects definitions and permissions. Compare with [the source snapshot](supabase/contracts/verification.json) and record any drift in the security audit. Keep the result private and redact any sensitive function literals before sharing.
5. Prepare an ordinary JPEG/PNG/WebP photo and a tiny PDF or image labelled **TEST DOCUMENT — INVALID FOR IDENTIFICATION**. Use future dates for acceptance and a distinct completed or elapsed fixture for completion. Confirm the designated administrator's role before viewing any test document.
6. In the results file record **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN**, plus the observed result, sanitized screenshot or request status, and defect ticket if needed. Use Developer Tools → Network to confirm expected server responses. Do not copy authorization headers, cookies, credentials, raw documents or unrelated records into the evidence.

For UI permission cases check both the screen and the corresponding server outcome. A hidden menu or a client redirect proves the UI guard only. To validate an RPC or database ACL when the screen prevents the request, use the project's authorized staging test client with the ordinary role assigned to the fixture. Record only the denied/empty outcome and the absence of a fixture state change.

## Authentication and discovery

| ID | Role and precondition | Steps | Expected result |
| --- | --- | --- | --- |
| A01 | R, new approved test address | Use **Sign up**, submit the test account, open the confirmation email and follow its link. | Auth follows the configured confirmation rule. The account becomes usable through the configured redirect. |
| A02 | R, confirmed account | Try an incorrect password, then sign in with the correct password. Reload My profile, log out and reopen My profile. | Invalid attempt stays signed out. Reload restores the session. Logout returns protected routes to login. |
| A03 | R and X, disposable sessions | Let R's session expire or have the staging admin invalidate the test session. Open Bookings. Sign in as X in the same browser. | Protected reads wait for valid auth. A valid refresh restores only R. Failed refresh requires sign-in. X sees only X's session and role. |
| A04 | B, ordinary account | Edit display name and business information in **My profile**, save and reload. | Only B's permitted profile fields change. An existing badge clears when an identity field changes. |
| D01 | Guest, fixture listing visible | Open Home and Browse. Check categories, real items, a listing detail and public photos. | Real catalog appears with correct prices and no removed listings. |
| D02 | Guest, multiple matching fixture listings | Search by title. Add category, location, price range and period. Try both price sorts, **Load more**, an impossible query, then clear and use Back/Forward. | Results and count match filters. Additional rows do not repeat. Empty state is honest. History restores the query. |

## Listings and bookings

| ID | Role and precondition | Steps | Expected result |
| --- | --- | --- | --- |
| L01 | O, authenticated | Use **List an item**, enter category, price, location, terms and permitted photos. Save. Open **Edit**, change the price and toggle availability in **My listings**. | One owned listing persists with correct photos and status. Unavailable listings cannot be requested. |
| L02 | X, O's known test listing | Open the fixture detail and its edit route as X. Check that fixture details and listing state stay intact. | X has no editing rights. The server denies ownership-restricted writes. Public detail remains subject to visibility. |
| L03 | O, test listing with multiple photos | Disconnect briefly during an authorized fixture upload, return online, and retry the same form. Check listing and photo records after reload. | Only intended records exist. Retried upload/metadata reconcile without creating a duplicate. Errors preserve the current form's work. |
| L04 | O, disposable unbooked listing | In **My listings**, confirm **Remove listing** for the fixture. Reopen Browse and detail as a guest. | The public catalog and detail respect soft removal. Public photo lifecycle follows current Storage configuration. |
| B01 | R, O's available fixture listing | Try invalid date order, then valid future dates. Send one request and click again quickly. Open Bookings. | Invalid dates cannot submit. Only one permitted pending request is recorded. |
| B02 | O, distinct R requests | In **Received**, accept one eligible pending request and decline another. Reload on both roles. | Each decision persists, only the owner can decide and both roles see correct statuses. |
| B03 | R and O, suitable future and past fixtures | Cancel an eligible future request/booking as R. Complete an eligible elapsed booking as O. Try the equivalent unavailable actions on ineligible records. | Server and UI agree on roles, dates and allowed transitions. |
| B04 | R, B, O, two overlapping pending fixtures | Use concurrent owner sessions to attempt confirmation of both time ranges. Reload both bookings. | At most one confirmation persists for overlapping dates. The rejected action reports the conflict. |
| B05 | X, bookings owned by R and O | Open Bookings as X with the other fixture's identifiers known to the tester. Verify approved role-bound reads and decisions for that fixture. | X sees zero private rows and cannot change either booking. |

## Payments, messages, reviews and reports

| ID | Role and precondition | Steps | Expected result |
| --- | --- | --- | --- |
| P01 | R, confirmed fixture booking | Open payment confirmation, verify simulated copy and totals, confirm once and reload. Confirm that repeated requests for this same simulation are denied or reconcile to one result. | Correct simulated rental/deposit rows persist once. No real transfer or payment request occurs. |
| P02 | X or O, and R with ineligible booking | Check that the normal UI hides the simulation and use the authorized staging test client to confirm the RPC is denied. Cancel a paid future fixture if the existing rules permit. | Unauthorized/ineligible calls cannot pay. Cancellation updates refund state according to the actual reviewed RPC/trigger contract. |
| M01 | R and O, fixture listing | Use **Message owner**, send sample text, open the owner's inbox, read it and refresh both sessions. | Exactly one thread persists for the pair/listing, messages persist, read markers and unread counts update. |
| M02 | X, no participant role | Confirm the fixture thread is absent from X's inbox. Try opening its known test URL and inspect the applicable server denial. | X receives no thread, messages or participant-only read state. |
| M03 | R, open fixture thread | Interrupt connection during a sample send. Restore it, refresh and inspect the thread before choosing any retry. | UI reports the uncertain result, retains the draft and reconciles an already stored message. |
| R01 | R, completed eligible fixture rental | Use **Leave a review**, choose rating/comment, save and revisit the listing. Check duplicate and ineligible review behavior on staging fixtures. | One eligible review persists and renders accurately. Other attempts fail under the server rules. |
| T01 | R and A1, separate disposable listing | R uses **Report this listing**. A1 checks Admin, dismisses one report and removes a separate reported test listing. Reload both histories. | Reports are visible to the authorized administrator. Dismissal and removal persist and removal affects the fixture's public visibility. |
| T02 | X ordinary account | Open Admin and attempt the scoped staging authorization check for resolving one known fixture report. | Admin UI stays closed. The RPC denies X and the report/listing stay unchanged. |

## Verification and access isolation

| ID | Role and precondition | Steps | Expected result |
| --- | --- | --- | --- |
| V01 | R and B, unverified | Follow the existing [user and business walkthrough](VERIFICATION_TESTING.md). Submit only labelled sample evidence, then reload and try a second pending request. | Correct document options. One pending request per account. No badge before approval. |
| V02 | A1, V01 fixture | Open **Admin → Account verification**, use **View document**, reject one request with a reason and approve another. Check R/B afterward. | Authorized private read and correct review outcomes. Approval sources badge from protected profile fields. Rejection exposes the allowed note and permits resubmission. |
| V03 | X, unrelated fixture submission | Check own history, known test document access and admin routes with X's own browser session. Confirm read and RPC denials using the authorized staging role checks. | X cannot read another request or private identity file. No public document URL and no review permission. |
| V04 | R and X or B, approved fixture profile | Compare public badge display with protected fields. Attempt the approved staging owner and unrelated-role checks against verification-field updates. | Public badge fields remain readable as designed. Client writes to those fields are denied for either role. |
| V05 | A1/A2, dedicated staging database with reviewed proposal | Follow the acceptance and rollback sequence in [SECURITY_AUDIT.md](SECURITY_AUDIT.md). Review the same pending fixture concurrently, then repeat with an account type or business name change. | Only the first final decision persists. Incompatible account type and blank business identity block approval. A later identity edit clears the badge. |

## Responsive acceptance

Run **UI01** in a Chromium browser at 320, 390, 768, 1024 and 1440 px in Light and Dark modes. Repeat key steps on physical phones when available. In Browse, Bookings, Messages, Profile and both admin pages use Tab and Escape, exercise an error and its recovery, and verify text contrast, touch targets, reachable dialogs and no horizontal overflow. Recheck date controls, photo galleries and private previews using sample data. Confirm reduced motion and search Back/Forward. The automated matrix covers fixture rendering. Physical touch, spoken screen-reader feedback and hosted results need their own evidence.
