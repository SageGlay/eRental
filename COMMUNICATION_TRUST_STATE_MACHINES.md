# Communication and trust states

## Messages and blocking

The message composer assigns an operation UUID to each intentional send. A successful save and a retry of the identical operation both return the message ID. After an uncertain send the client refreshes authoritative history and checks that ID before offering retry. Realtime changes trigger a fetch, rather than creating or displaying new persisted messages directly. The client merges by ID and sorts by timestamp then ID. The visible reader marks only received messages it has actually loaded. Message read state and notification read state are independent.

Either user can create or remove their own block. If at least one direction remains active, new conversation creation, new messages and new viewing requests fail. Existing participants can read conversation history, records and permitted cancellation/completion actions. Blocks do not automatically cancel bookings, report a person or notify the other account. A transaction that completes first determines whether an overlapping message can be stored before the block takes effect.

## Viewing appointments

All appointment values use timestamptz and display in Asia/Manila. Each confirmation holds a 30-minute slot on a single account calendar. A business account shares the same one-calendar rule as an individual account. Multiple staff calendars are outside this milestone. One active request per listing and renter prevents accidental duplicates.

| Current state | Actor and operation | Result |
| --- | --- | --- |
| New | Eligible renter requests a future appointment for an available listing | Pending. Owner receives the request event. The listing determines the owner. |
| Pending | Owner confirms the requested time | Confirmed. An overlapping slot fails atomically. |
| Pending | Owner declines with reason | Declined. Renter sees the reason in the private appointment. |
| Pending or future confirmed | Owner proposes a distinct future time | Reschedule proposed. Any previous confirmed slot remains reserved. |
| Reschedule proposed | Renter accepts | Confirmed at the proposed time if the slot remains valid. The previous time stays in event history. |
| Reschedule proposed | Renter declines the proposal | Prior confirmed schedule remains, or the original request returns to pending. |
| Active | Eligible participant cancels | Cancelled. The existing confirmation no longer reserves time. |
| Confirmed | Eligible owner completes after the scheduled slot | Completed. The viewing never creates a rental booking. |

Active contact scheduling respects blocks. Existing obligations can end through the permitted participant operations. Every successful change increments a revision and stores an immutable private history event. Repeating a stale revision cannot overwrite a later change. The event ID distinguishes successive proposals and provides a stable notification deduplication key. [Viewing migration](supabase/migrations/20261127095438_trust_viewing_appointments.sql)

## Moderation and review visibility

A submitted conversation report is pending and may carry up to five selected messages. The reporter can open their report status. An authorized administrator can uphold or dismiss it with a reason. The decision is terminal. A row lock serializes competing resolutions. It records the decision, moderator and time and sends a private notice only to the reporter.

A legitimate rental owner can submit one pending dispute about a published review. Pending and dismissed disputes leave the review published. An administrator can uphold a dispute and hide the review in one transaction. Its public response and rating contribution then disappear from public reads. Resolution and visibility change have separate recipient events. Owners can edit or remove their own response through authorized controls. The renter's original rating and text stay in evidence. This milestone has no restoration or account suspension workflow. [Review migration](supabase/migrations/20261127095520_communication_trust_reviews.sql)
