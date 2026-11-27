# Communication and Marketplace Trust staging acceptance

All 18 scenarios are **BLOCKED** pending a designated Supabase staging project, reconciled migration history and five test identities. No hosted runs or evidence captures have been recorded. Use this guide with the staged app and its native Auth, PostgREST, Storage and Realtime services. The release also needs a separate production approval. [Deployment procedure](COMMUNICATION_TRUST_DEPLOYMENT.md) · [Automated results](COMMUNICATION_TRUST_TEST_RESULTS.md)

## Prepare a run

1. Ask the staging operator to verify the existing marketplace catalog, the hardened verification migration, Marketplace Essentials, then the Communication and Marketplace Trust migrations in their approved order. Record the staged app commit, migration versions and project alias without credentials. Confirm Realtime publication, client authorization and test accounts on that target. [Release checks](COMMUNICATION_TRUST_DEPLOYMENT.md)
2. Prepare **R** (Renter A), **O** (Owner B), **X** (Unrelated user C), **A1** (Authorized administrator A) and **A2** (Authorized administrator B). Keep all five signed-in sessions in separate browser profiles or private browser contexts. An additional signed-out browser is useful for checking public listings and owner ratings. Use named roles in the evidence and record account IDs only in the team's private fixture inventory.
3. Give O two available listings and one unavailable listing. Prepare distinct authorized conversations with synthetic messages, confirmed appointments suitable for rescheduling or cancellation, and qualifying completed bookings with test reviews. Use fresh fixtures for terminal actions and races. Use an unverified applicant with a harmless test document for CT-18. Record current time in Asia/Manila and choose future windows that allow enough time for both actors to complete each case.
4. Record the app commit, UTC run time, browser and viewport width, theme, fixture alias, observed outcome and **PASS**, **FAIL**, **BLOCKED** or **NOT RUN** per case. Store cropped screenshots or a short screen recording under the evidence identifier below in the private staging record. Omit credentials, authorization headers, real identity documents, addresses and message content from shared evidence. Use ordinary browser accounts to check access. Administrator or service-role SQL would bypass the client authorization under test.

## Messaging and quick responses

### CT-01 · Realtime delivery · PB-018, PB-031

**Preconditions and accounts:** R and O can open an authorized conversation on an available listing. Start with no messages for the inquiry variation. Keep O's conversation open and also have an O tab on Messages for unread counts.

1. In R's conversation, wait for the connection state to settle. Send one harmless message. Watch O's open conversation without reloading or pressing Refresh.
2. Compare the rendered message once on each side. Record whether O had a joined Realtime channel and received a matching change event without including its payload. If delivery only occurs on a timed refresh, record that fallback separately. Repeat with O on the inbox and the thread closed, then open the thread and confirm its unread state clears.
3. Check the initial and subsequent notices in the recipient's notification center. Compare the thread and inbox order after both actors reload.

**Expected:** The committed message appears once in the authorized recipient's conversation without manual refresh. A closed thread contributes to the unread count and opening it marks the appropriate messages read. The first meaningful message creates a single inquiry notice. Later sends use the message event. A notification's read state follows the notification workflow. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-01 two-session delivery recording, before/after unread count and notification totals.

### CT-02 · Edit and send a quick response · PB-018

**Preconditions and accounts:** O can reply to R in an authorized conversation. R has sent a test inquiry.

1. As O select a quick response near the composer using the keyboard. Check that its text enters the composer and that R has received nothing.
2. Edit the text before selecting Send. Press Send once and compare the message in R's conversation with the edited draft.
3. Repeat in the renter role to check the applicable suggestions and the same editable flow. Check the normal pending and read states.

**Expected:** Selection only prepares an editable draft. The intentionally sent message arrives once, with O or R as its actual sender and the edited text intact. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-02 composer before editing and recipient timeline after the intentional send.

### CT-03 · Reconnect and recover missed messages · PB-018

**Preconditions and accounts:** R and O have an authorized conversation open in isolated profiles. Both are online and neither account blocks the other.

1. Put O's browser offline using DevTools, leaving R online. As R send two distinct synthetic messages while O is disconnected.
2. Restore O's connection. Observe its connection state and allow the socket to resubscribe. The conversation's online fallback runs about every eight seconds while reconnecting and every 30 seconds when connected. Compare message count and chronological order with R, and check the unread count. If automatic recovery fails, use the provided refresh control and record both outcomes.
3. Repeat around first load by opening the thread as the other actor sends a message. In a controlled staging test, interrupt the sender's response and use its documented reconcile action before retrying. Compare the final history and notice count.

**Expected:** O can distinguish an interruption from normal operation. Recovery reconciles the authoritative stored messages in order, each once. Retry of the same logical message creates one message and one corresponding event. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-03 connection-state transitions, ordered message counts and retry outcome.

## Viewing appointments

### CT-04 · Request and confirm a viewing · PB-019, PB-031

**Preconditions and accounts:** R and O have a visible, available rental with no active block. Record the existing booking/payment counts for the sample or inspect its empty transaction history.

1. As R open the listing and select **Request a viewing**. Review the form using an Asia/Manila future start time and optional synthetic note, then submit it.
2. As O follow the incoming viewing notice or open the incoming viewings page. Check the listing, renter and timezone. Confirm the requested slot. As R open the confirmed update and compare the schedule after refresh.
3. Repeat on a second eligible fixture for an owner decline. In separate ordinary-account sessions exercise a past time, an unavailable listing and a self-viewing. Use two distinct pending requests with overlapping windows to check that an overlapping confirmation is rejected for the same owner.

**Expected:** Only eligible requests persist. The correct participants see pending and final states in Philippine time. A confirmed appointment occupies a single 30-minute slot. Only a successful owner decision produces its notice. The approved conflict policy is enforced. The workflow creates no booking, reserve, rental agreement or simulated payment. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-04 request and confirmation, declined and invalid variants, before/after booking and payment evidence.

### CT-05 · Accept or decline a proposed schedule · PB-019, PB-031

**Preconditions and accounts:** R and O have separate pending or confirmed appointments eligible for rescheduling.

1. As O propose a different future date and time for one appointment. As R check the proposal, the original schedule and whether the new appointment is awaiting your decision.
2. Accept the proposal as R. Open **History** on both participants' viewing cards. Compare the new active slot, the prior confirmed event when applicable and the change notice.
3. For a fresh eligible appointment, propose another schedule and decline it as R. Check that the prior confirmed slot is retained, or that an appointment without a confirmed slot returns to Pending. Check the declined proposal in **History**. Repeat with a later legitimate proposal on an eligible record and verify that it produces a distinct notice.

**Expected:** The proposal alone does not confirm new dates. The designated counterpart's decision is required. A previously confirmed schedule remains identifiable in history or as the active slot, according to the documented outcome. Repeating a stale decision does not overwrite the current schedule. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-05 original, proposed and final windows, roles and notification counts. [State machines](COMMUNICATION_TRUST_STATE_MACHINES.md)

### CT-06 · Cancel a viewing and retain history · PB-019, PB-031

**Preconditions and accounts:** R and O have a future appointment eligible for cancellation. Prepare a separate confirmed appointment whose end time has passed for the completion variation.

1. As the authorized participant cancel the future viewing and complete any confirmation step. Open both participants' history after refresh. Follow the other participant's notice.
2. Try to change the final appointment using the controls available to each participant. Confirm the booking/payment records from CT-04 remain independent.
3. As O mark the separately eligible past viewing completed and confirm the recorded state and applicable notification.

**Expected:** Authorized cancellation and completion persist once and appear in history. The terminal record cannot be reopened by repeating a decision. Existing booking/payment records do not change. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-06 terminal history, client denial and notification timeline.

## Blocking, conversation reporting and privacy

### CT-07 · Block an account · PB-018, PB-019, PB-022

**Preconditions and accounts:** R and O share a conversation with history and have a separate booking or viewing record. Prepare a second listing so the same two identities can try to begin a new conversation.

1. As R use **Conversation actions → Block account**, read the consequences and confirm. Open **My profile → Account settings → Blocked accounts** and confirm the relationship appears. Inspect historical conversation and rental records as both participants.
2. With O's conversation left open before the block, try to send after the block has completed. Repeat from R and with a quick response. Try starting a conversation and requesting a new viewing for the other listing.
3. Verify prohibited operations do not create new records or notifications. If both actors can work nearly simultaneously, send a single staged test message while confirming the block and compare the recorded ordering. The PostgreSQL concurrency test provides deterministic transaction evidence.

**Expected:** Either participant's active block stops new contact in both directions. After the block commits, prohibited writes fail even from a stale composer. A send already committed can remain in history. Previously authorized rental obligations and permitted appointment cancellation remain available to the right participants. Blocking itself sends no notice. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-07 blocked-accounts section, retained history, stale send result and before/after notice count.

### CT-08 · Remove only your own block · PB-018, PB-022

**Preconditions and accounts:** R has blocked O. Both use their own sessions. Use the same known conversation as CT-07.

1. As O create your own block of R through the available block controls. As R view your blocked list and remove your block there.
2. Repeat the contact attempt while O's independent block remains. As O remove your own block.
3. Refresh both actors. Send a new test message and confirm the normal Realtime and notification paths resume.

**Expected:** Each account manages only its own relation. Removing R's block does not remove O's. Communication resumes when neither block remains. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-08 each account's own blocked list and send outcomes before and after both removals.

### CT-09 · Report and resolve a conversation · PB-022, PB-031

**Preconditions and accounts:** R and O are authorized conversation participants with synthetic messages. A1 is on the conversation report queue.

1. As R start Report conversation. Check that the form requires a supported reason. Select up to five synthetic example messages from that conversation's offered recent messages. Provide harmless context, review the report and submit once.
2. As A1 open **Administration → Conversation reports**, filter by reason and status, and open the report. Compare the authorized evidence with the synthetic evidence submitted. Dismiss with a reason, then check the finalized audit fields. Use a separate report to exercise an upheld outcome.
3. As R follow the result notice to the conversation's report section and inspect the permitted outcome. Confirm the report action itself did not block either participant. Check the original listing-report tools remain usable.

**Expected:** A participant can report their own conversation with a valid reason. The administrator can access only the incident's authorized evidence and record a reasoned final outcome. The reporter receives the permitted result. No broad private history or unnecessary reporter identity is exposed. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-09 submitted status, redacted evidence scope, finalized queue and notice count.

### CT-10 · Private records and evidence stay scoped · PB-019, PB-022

**Preconditions and accounts:** R and O have a staged viewing and report. X is unrelated. A1 can access the specific authorized report evidence. Share test URLs or fixture identifiers in the restricted staging record.

1. As X open the normal appointment view, then use R's known synthetic viewing and conversation destinations. Repeat signed out.
2. As X try to open the administrator report view and its specific evidence destination. Compare the result with A1's permitted access and R's participant or reporter access.
3. In the authorized staging harness, check access to the known fixture under each ordinary role. Verify X receives no records and no subscription events from the R/O thread while R and O exchange a test message.

**Expected:** Unrelated and anonymous sessions cannot read the private viewing, conversation, report evidence or its events. The administrator's report access is scoped to evidence for that submitted report. Any available public listing data stays public. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-10 role/outcome table and subscription observation without private payloads.

## Ratings, owner responses and review disputes

### CT-11 · Publish a completed-rental review · PB-030, PB-031

**Preconditions and accounts:** R has an eligible completed booking on O's second visible listing and has never reviewed that booking. Stage visible ratings of 5 and 3 on O's first listing and one rating of 1 on the second. Use known eligible historical fixture bookings for those reviews.

1. As X or guest first confirm that the owner has three published reviews averaging 3.0. As R open the completed booking and submit a 5-star review with a harmless comment. Verify the same booking no longer offers another review. Check an incomplete booking and a booking owned by someone else offer no new review to R.
2. As X or guest open O's two listings and owner profile. Compare published reviews, their dates and permitted reviewer information with the fixture inventory.
3. Check any event from the new published review in O's notification center. Reopen the completed booking, listings and profile after reload.

**Expected:** The second listing shows two reviews and average 3.0. The first retains two reviews and average 4.0. The owner profile shows four reviews and average 3.5, calculated from the underlying ratings. The original review remains in booking history. A duplicate or ineligible write is denied. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-11 completed booking and listing/profile aggregates before and after publishing.

### CT-12 · Publish and edit an owner's response · PB-030, PB-031

**Preconditions and accounts:** O has a visible written review submitted by R on O's completed rental. X is unrelated.

1. As O open the review. Publish one harmless response, then edit it. As R or guest reload the public review and check the words and owner attribution.
2. Check that a second response is unavailable to O. As X check that there is no response form or ability to change O's response. Exercise owner removal if enabled and record the observed public state.
3. Check ratings and counts after publish/edit/remove and the expected initial response notification. Verify minor edits do not repeatedly notify R.

**Expected:** Only the legitimate owner can create and manage their response. A visible review shows at most one public response. The renter's original rating and comment remain intact. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-12 owner response before/after editing, unchanged aggregate and authorized controls.

### CT-13 · Submit and resolve a review dispute · PB-021, PB-031

**Preconditions and accounts:** O received R's written review on a completed rental. A1 can open the dispute queue. Prepare separate reviews for different terminal decisions.

1. As O open the affected listing's reviews, select **Dispute review**, choose an allowed reason and enter harmless context. Submit it and open **Review disputes** from the account menu. Try to open a second active dispute for the same review. As X verify the private dispute is unavailable.
2. As A1 open **Administration → Review disputes**, inspect the original review and permitted rental context, and dismiss with a justified note. Repeat on the second review for an upheld outcome. Open the resulting states again after refresh.
3. As O inspect the outcome and the result notice. For the upheld case, check that R receives the review visibility notice. Check the published review remains visible while its dispute is pending, and verify the moderation decision never rewrites the original text.

**Expected:** Only an eligible owner can file one active dispute with a valid reason. Administrator decisions remain auditable and cannot be overwritten. Private context is absent from public review reads and notice previews. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-13 dispute lifecycle, reason requirement, participant outcomes and duplicate attempt.

### CT-14 · Recalculate ratings after moderation · PB-021, PB-030

**Preconditions and accounts:** O has two published reviews rated 5 and 3 on one listing and a published review rated 1 on a second listing. A1 can review an eligible dispute concerning the 1-star review. Use synthetic policy-violation content independent of its rating. X is unrelated.

1. Record public counts and averages for both listings and the owner profile. As A1 resolve the eligible case with a documented, authorized visibility change.
2. As X or guest reload both listings and the owner profile. Confirm the hidden review and any attached response disappear from public views. Compare the preserved original content only through an authorized case view.
3. Confirm the operator understands that restoration requires a separately reviewed workflow. The current moderation UI has no restore action.

**Expected:** With the 1-star review hidden, the second listing shows no published reviews and the owner aggregate changes from three reviews at 3.0 to two at 4.0. The first listing remains unchanged. The review remains stored for authorized moderation history. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-14 before/after rating counts and reasoned moderation outcome.

## Notifications, concurrency and regression

### CT-15 · Viewing and moderation notices · PB-019, PB-021, PB-022, PB-031

**Preconditions and accounts:** R, O, X and A1 have fresh viewing, conversation-report and review/dispute fixtures. Record each actor's baseline unread count.

1. Run CT-04–06 and CT-09 plus CT-11–14 using new fixtures. Compare committed event transitions with the recipient and destination for each event listed in the notification matrix.
2. Open the existing notification bell and full center. Check All and Unread, follow supported destinations and mark one and then all of your notifications read. Confirm the recipient's unread count after renewal and compare X's separate list.
3. Repeat a denied, stale or duplicate decision and confirm it produces no notice. Compare distinct legitimate reschedule proposals. Inspect previews for private message bodies, report evidence, private notes and unnecessary reporter identifiers.

**Expected:** Committed events appear in the same notification center with the appropriate recipient, event and internal destination, once per intended transition. Reading a notice persists for that recipient. Failed or blocked operations do not notify anyone. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-15 restricted event/recipient/destination matrix and before/after counts. [Event matrix](NOTIFICATION_EVENT_MATRIX.md)

### CT-16 · Competing administrator decisions · PB-021, PB-022, PB-031

**Preconditions and accounts:** A1 and A2 are individually authorized and have opened the same pending conversation report. Prepare a separate pending review dispute.

1. In two sessions enter different justified decisions. Coordinate submitting as close together as possible. Refresh both queues and inspect the final decision, reviewer and timestamp.
2. Repeat with the pending review dispute. Compare the one persisted resolution with any associated review visibility change and final aggregate.
3. Compare the intended recipients' notices with the committed outcomes. Try again from the losing actor's stale view. Record which decision committed without assuming which actor should win.

**Expected:** Each case permits one decision. The losing submission receives a recoverable stale/finalized error. The recorded reason, visibility and notices reflect the committed decision only. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-16 simultaneous-session recording, final reviewer aliases and notice counts. [Automated transaction checks](COMMUNICATION_TRUST_TEST_RESULTS.md)

### CT-17 · Session switching · PB-018, PB-019, PB-022, PB-031

**Preconditions and accounts:** R's session has a busy or unread conversation, appointment and notification. X has separate account data. Keep O signed in separately.

1. With R's conversation open, sign out and sign in as X in the same browser. Use Back, refresh and open the previously known private conversation/viewing destinations. While X is active, have O send another message to R.
2. Look at the inbox, bell, notifications and viewings during the change, then after the new account settles. Check browser reconnect or tab-focus refresh with X still signed in.
3. Sign in again as R to confirm that R's committed message/history and unread behavior reconcile correctly. Repeat the role change from A1 to X while on a moderation queue.

**Expected:** Page state, cached messages, badges, drafts and subscribed events do not expose the previous session's private data. X receives only their own authorized data. R's history remains intact. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-17 screen recording with synthetic markers and role transitions.

### CT-18 · Existing marketplace regression · PB-016, PB-018, PB-030, PB-031, PB-035

**Preconditions and accounts:** R, O and A1 have synthetic listings, an eligible booking and a new verification submission. R has a saved listing. Use a guest session for public inventory.

1. Browse and open public listings. As O create or update one authorized listing and check availability. As R save and remove a visible item, then verify the saved collection after refresh.
2. Submit a booking and accept it in O's session. Perform an eligible simulated payment as R and verify supported refund behavior on a separate record. Check current booking notifications and read state.
3. Submit and resolve a synthetic verification request. Verify one decision notice, the authoritative badge and the private document access. Check existing listing moderation and that viewings leave booking and payment results unchanged.
4. Verify light, dark and system appearance. Check keyboard focus, dialogs, recovery, readable status labels and no horizontal overflow at 320, 390, 768, 1024 and 1440px where the new controls appear.

**Expected:** Existing listing, booking, payment, bookmark and verification workflows remain usable. Notifications still match actual state. The new navigation and controls work with touch, keyboard and both palettes. **Actual:** Not run. **Status:** BLOCKED. **Evidence:** CT-18 short regression checklist and redacted screenshots for relevant widths. [Previous staging guide](MARKETPLACE_ESSENTIALS_MANUAL_TESTING.md) · [Verification staging guide](VERIFICATION_SECURITY_DEPLOYMENT.md#hosted-acceptance)
