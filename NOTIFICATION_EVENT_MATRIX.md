# Marketplace notification event matrix

All events below are implemented by server-side triggers. Each event belongs to its persistently stored source transaction. A rejected action or later transaction failure rolls back delivery. The browser reads controlled facts and renders fixed templates and destinations. It never sends the recipient, trusted notice text or verification outcome to a notification-creation endpoint. [Migration](supabase/migrations/20261125190326_marketplace_essentials.sql) · [Templates and destination rules](src/lib/notifications.js)

| Type | Confirmed source event | Recipient | Destination | Deduplication source |
| --- | --- | --- | --- | --- |
| booking_requested | Renter inserts a valid pending booking | Listing owner | Incoming booking | Booking ID and type |
| booking_accepted | Owner changes pending to accepted | Renter | Renter's booking | Booking ID and type |
| booking_rejected | Owner changes pending to rejected | Renter | Renter's booking | Booking ID and type |
| booking_cancelled | Renter cancels a pending request or either participant cancels an accepted booking as permitted by the source workflow | Other participant | Booking in the recipient's queue | Booking ID and type |
| rental_completed | Owner changes accepted to completed | Renter | Completed booking and eligible review action | Booking ID and type |
| inquiry_received | First nonblank message persists in a conversation without meaningful prior messages | Other participant | Exact conversation | Message ID, plus one inquiry per conversation |
| message_received | A further nonblank message or reply persists | Other participant | Exact conversation | Message ID, shared with the inquiry delivery identity |
| simulated_payment_recorded | Renter's simulated payment produces a persisted simulated_paid line | Owner | Booking with simulated payment information | Booking ID and type for the existing one-payment operation |
| simulated_refund_recorded | An authorized participant's action produces a persisted simulated_refunded line | Other participant | Booking with simulated refund information | Booking ID and type for the existing refund operation |
| verification_approved | Hardened admin review moves the applicant's pending submission to approved | Applicant | Account verification | Submission ID and type |
| verification_rejected | Hardened admin review moves the applicant's pending submission to rejected | Applicant | Account verification and permitted feedback | Submission ID and type |

Booking and payment handlers check the actor against the persisted participants and the owner against the listing. A verification handler checks the already-persisted transition, reviewer identity, unchanged applicant and server administrator membership. It adds no verification status or badge mutation. The business transaction stays authoritative. Server-side maintenance writes without an end-user actor do not generate a user-attributed notification. Hosted source policies, RPCs, supported transitions and effective grants are staging prerequisites. [Schema and role boundaries](MARKETPLACE_ESSENTIALS_SCHEMA.md)

## Delivery, ordering and recovery

- Opening an empty conversation emits nothing. The insert trigger processes only messages that were actually inserted. It locks affected conversations in stable order, accounts for older messages predating deployment and treats at most one message in a new batch as the initial inquiry. Simultaneous writers serialize on the conversation. UUID order breaks a tie within a multi-row batch. The inquiry and message forms share a delivery key per message.
- A single simulated payment can write rental and deposit rows. The recipient receives one notification for that booking operation. A refund has its own key and can produce its own notification. Existing workflows allow a single payment operation per booking. A future installment or partial-refund feature must use a durable operation ID in the key before emitting multiple same-kind transactions. No money moves.
- A semantically new persisted message ID receives its own delivery. Replaying the same insert or terminal transition does not produce another delivery. If a client cannot determine whether a message was sent, it refreshes the conversation before resending. Repeating a genuinely new message write with a new ID creates a new source event.
- A storage or constraint failure other than duplicate delivery aborts the source transaction as well. At stronger transaction isolation, retry the entire failed transaction through the source's authorized recovery flow. The operational pause can restore source-workflow availability if the notification component fails. It stops new events, preserves existing records and requires reconciliation before any historical backfill. [Pause and recovery](MARKETPLACE_ESSENTIALS_SCHEMA.md#rollback-and-recovery)
- Opening or marking a notification persists its recipient-scoped read state. Reading a conversation continues to update the existing message read markers independently. The notice can remain unread after opening a conversation by another route. A notification read does not mark every message as read. Timestamps, read status and unread counts come from the database. The application refreshes by fetching on entry, focus and polling.
- The destination contains only a known internal route with a validated entity ID. The destination page checks the current user's normal access. Event type, recipient role and entity ID choose the destination. Private source content stays on the authorized detail page. [Test results](MARKETPLACE_ESSENTIALS_TEST_RESULTS.md)

## Future integrations

PB-031 remains partial. Viewing scheduled, rescheduled and cancelled require an authorized viewing workflow. Expanded rental application updates, rental agreement acceptance, payment due/overdue and payment proof decisions require their own persistent source operations. Their event producers are deferred. When a source exists, define its recipient and actor, expected transition, controlled event type, destination and stable operation or revision key. For rescheduling and partial payments, distinct legitimate revisions must have distinct keys. Add constraint/template support, a transaction-owned producer, tenant-isolation and rollback tests, and hosted acceptance before enabling delivery.

Optional report-resolution, listing-removal and administrator new-verification alerts are outside this implementation. Existing moderation and verification queues continue to provide their respective workflows.
