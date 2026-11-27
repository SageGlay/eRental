# Marketplace essentials staging acceptance

All ten scenarios are **BLOCKED** pending a designated staging project, its migration preflight and test identities. Run this guide against the staging app and its actual Supabase services. Local browser fixtures and disposable PostgreSQL runs have separate results. [Automated evidence](MARKETPLACE_ESSENTIALS_TEST_RESULTS.md) · [Deployment procedure](MARKETPLACE_ESSENTIALS_DEPLOYMENT.md)

## Prepare a run

Use separate browser profiles for renter **R**, individual listing owner **O**, business owner **B**, unrelated member **X** and authorized administrator **A**. Use test aliases in shared notes. Have O and B publish available sample rentals in at least two categories, with enough listings to recommend other items in each category. Arrange accepted bookings with suitable dates for cancellation and completion. R and B need eligible, initially unverified profiles for the verification scenarios. Obtain the operator's confirmation of the migration versions and verification RPC before collecting results.

Use synthetic evidence marked **TEST DOCUMENT** for verification and harmless text for messages and reasons. Each row below names a suggested evidence identifier. For each execution record the staging build SHA, UTC time, browser, device width, theme, actor aliases, observed result and PASS, FAIL, BLOCKED or NOT RUN. Store sanitized evidence under that identifier in the team's private test record. Crop out session information, real addresses, identifiers and document previews. Use a new fixture for decisions that end a booking or verification request.

## Cases

### ME01 · Discover and save · PB-016

**Setup:** R is signed in. O has a visible rental that R has never saved.

1. Open Browse and locate the rental. Activate its bookmark from the card and confirm the current page stays open.
2. Open the detail page and compare its saved state. Open Saved listings, reload, then sign out and sign back in as R.
3. Check the listing's rate, rental period, location and current availability. Remove it and revisit the detail page. As a guest, try saving an available listing and follow the login prompt.

**Expect:** The same account retains one saved copy across refresh and login. Removing it clears both views. The guest receives a login prompt before a save can occur. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME01 saved collection before and after removal.

### ME02 · Personalized discovery · PB-017

**Setup:** R has an empty saved collection and cleared recent history. The eligible inventory contains several available rentals in each of two categories.

1. On Home inspect the featured inventory and the initial recommendations. Open two available detail pages in one category, then save a listing in the other.
2. Return to Home. Check the recommendations against the available inventory and category choices. Open one featured listing and compare its price, owner and any badge with its detail page.
3. Clear recent history and return to Home. Remove the remaining bookmark and reload. Check that a removed or restricted sample does not reappear.

**Expect:** Recommendation candidates reflect viewed and saved categories without duplicate recommendation cards. Clearing views preserves saved-category influence. Without activity, the app shows a useful inventory fallback. Featured records and owner information match actual listings. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME02 inventory and recommendation observations.

### ME03 · Booking notifications · PB-031

**Setup:** R can request O's available rental on distinct dates. Prepare separate eligible bookings for each terminal outcome.

1. As R submit a booking request. As O open the notification center and follow the new-request notification to the incoming booking.
2. Accept that request. Open R's notification and check the booking decision. Repeat with another request that O declines.
3. On a separate eligible request, cancel from the permitted participant. For an accepted rental whose end date has passed, mark it completed as O. Check the other participant's notifications.

**Expect:** Each committed operation yields the corresponding update for the intended participant, linked to that booking. Reopening the pages and refreshing preserves one notice per recipient and event. Other accounts receive none. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME03 participant timelines.

### ME04 · Inquiry and reply · PB-031

**Setup:** R can contact O about a test listing with no previous messages between them about that item.

1. Open the conversation as R without sending text. Check O's notifications. Send one harmless inquiry and refresh O's center.
2. Follow O's notice to the conversation. Reply as O and check R's notification and its destination.
3. Check message and notification read state separately. Opening the center alone must leave unread messages intact.

**Expect:** An empty conversation generates no message alert. The first committed message generates one inquiry notice, and the reply generates one message notice for the other participant. Previews omit the private message body. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME04 conversation and notification state.

### ME05 · Simulated payments and refunds · PB-031

**Setup:** R has an accepted booking with O, a future start date and no existing simulated payment.

1. As R open the booking and complete its payment simulation. Compare the resulting booking record with O's notification and its destination.
2. Reload the center. Check the existing simulated amount on the booking and one simulated payment notice for the booking, including when rental and deposit amounts were recorded in separate lines.
3. Cancel a separately eligible paid booking through the supported workflow. Where the backend records a simulated refund, compare the affected participant's notification with the booking. If no refund operation is available, document the specific missing prerequisite separately.

**Expect:** Notices follow committed payment records and explicitly say the activity was simulated. No real funds move. A refund notice requires a recorded refund; cancellation alone is insufficient. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME05 simulated payment/refund record and corresponding notices.

### ME06 · Verification approval · PB-035

**Setup:** R has an eligible individual account and an unused synthetic verification document. A can review the queue.

1. Submit an individual verification request as R. Check R's badge and notifications before review.
2. As A compare the document and current profile, approve through the review queue and refresh. As R open the resulting notification and navigate to verification.
3. Compare the approved submission with the authenticated profile's current badge. Reload. Repeat using a separate eligible business applicant and synthetic business evidence.

**Expect:** A pending submission alone grants no badge or decision notice. Each successful decision produces exactly one applicant notice, and the badge matches the protected identity or business state. Notifications contain no private evidence or storage path. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME06 decision, notification and badge using test aliases.

### ME07 · Verification rejection · PB-035

**Setup:** B has an eligible pending business request with a test document. Use a separate fixture or perform this case before approving B in ME06.

1. As A reject the submission with a harmless reason. As B check the notification preview, open it and read the decision under Account verification.
2. Check that the current badge is absent for this previously unverified account. Check X's and A's centers and reload B's center.
3. If B is eligible, resubmit revised sample evidence. Confirm this produces a pending record, separate from the earlier rejected decision.

**Expect:** Only the applicant receives the rejection notice. The reason is available in the authorized verification workflow and absent from the notification preview. The previous request retains its single decision. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME07 redacted preview and decision status.

### ME08 · Notification management · PB-031

**Setup:** R has at least three unread events and X has an independent unread event. For pagination, supply enough authorized fixture activity to exceed a page.

1. Open R's center. Compare the bell counter with unread records, then open one unread activity and return. Refresh.
2. Filter to unread, mark one notice read without navigating, then mark all read. Compare the bell, unread filter and All list after refreshing.
3. Where multiple pages exist, load the next page and check ordering. In separate sessions compare X's counter before and after R's mark-all operation.

**Expect:** Counts and read state persist for R. Opening a notice marks it read according to the center's interaction rule. Read records leave the unread filter and remain in All. X's status is independent. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME08 before/after counters, filter and paging.

### ME09 · Account isolation · PB-016, PB-017, PB-031

**Setup:** R and X have distinct saved rentals, views and notifications. Both are ordinary accounts.

1. In one browser sign in as R, visit Saved listings, Home and Notifications. Sign out, sign in as X, use Back and reload all three pages.
2. In authorized staging checks using each user's normal session, compare access to their own fixtures with reads of the other user's known test bookmark, view history and notification. Attempt the read-state action on the other user's known test notice and confirm its state from its owner.
3. Sign out and open the private routes directly. Check the guest discovery page.

**Expect:** X sees only X's collections, history and notifications, including while pages are loading. Unrelated records stay unread or invisible, and signed-out requests cannot read protected data. Guest history is separate. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME09 role/outcome table using aliases only.

### ME10 · Legal transparency · PB-003

**Setup:** Have a guest session and R's signed-in session. Use a phone and desktop viewport, light and dark themes, and a keyboard.

1. As a guest follow the footer links to Terms and conditions and Privacy notice. Reload both direct URLs. From registration use the legal links without submitting a form.
2. As R follow the links in account settings and the verification privacy guidance. Read the sections covering handover, simulated money, private evidence, bookmarks, history and notifications.
3. Check heading order, readable text, keyboard focus and wrapping at 320, 390, 768, 1024 and 1440px. Check system appearance follows the device theme.

**Expect:** Direct links load, the pages identify their draft status, and no extra legal consent blocks registration. Each disclosure agrees with the deployed feature and its privacy controls. Unapproved contacts, retention periods and guarantees are absent. **Actual:** Awaiting staging. **Status:** BLOCKED. **Evidence:** ME10 route, theme, width and review notes.
