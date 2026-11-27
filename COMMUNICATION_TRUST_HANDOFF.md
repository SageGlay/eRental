# Communication and marketplace trust handoff

This milestone builds on eRental 3.0 at `9f7da46`, the merge of Marketplace Essentials. It adds realtime communication and contact safety, separate viewing appointments, and moderated review and owner reputation workflows. The existing hardened verification function and recipient notification center remain in use. [Audit and baseline](COMMUNICATION_TRUST_AUDIT.md) · [Test evidence](COMMUNICATION_TRUST_TEST_RESULTS.md)

| Workflow | Repository behavior |
| --- | --- |
| Conversations | Participant-scoped message insert/update subscriptions refresh authoritative history and unread counts, with polling, manual refresh and reconnect reconciliation. Stable operation IDs make retries idempotent. Quick responses remain drafts until sent. |
| Blocks and reporting | Either active block direction prevents new conversations, messages and viewing requests. The account settings list supports unblocking. Reports preserve up to five selected messages. An authorized moderator resolves a report with a recorded reason, and the reporter receives a private notice. |
| Viewings | Renters request viewings from listings or conversations. Owners confirm, decline or propose another time. Participants see current status and history, and end eligible appointments without modifying a rental booking. Times display in Asia/Manila. A 30-minute non-overlap rule uses one calendar per owner. |
| Reviews and owner reputation | Public listing and owner counts and averages use published reviews. The authorized booking owner can publish, edit or remove a single response, or submit a dispute. Moderators can record a dismissal or uphold a dispute and hide the review. Public ratings and responses follow that visibility decision. |
| Notifications | Appointment and moderation events extend the original notification writer and UI templates. Delivery follows confirmed transactions. Private case details remain at their authorized destinations. |

## Release gates

Hosted deployment requires matching the existing marketplace contracts, verifying both predecessor migrations, and exercising native Supabase Auth, PostgREST and Realtime with designated accounts. All CT-01–CT-18 cases remain blocked pending staging. A repository PR review can proceed using the synthetic fixture evidence. [Schema and upgrades](COMMUNICATION_TRUST_SCHEMA.md) · [Security and isolation](COMMUNICATION_TRUST_SECURITY.md) · [Deployment](COMMUNICATION_TRUST_DEPLOYMENT.md) · [Hosted checks](COMMUNICATION_TRUST_MANUAL_TESTING.md)

The current publication choice supports signed-in message inserts and updates under RLS. Incompatible existing publication settings require staged reconciliation. The dispute workflow supports hiding private evidence from public reads. Future restoration and account suspension need separate reviewed workflows. PB-031 remains partial because broader rental applications and future financial events depend on later modules. [Backlog traceability](COMMUNICATION_TRUST_BACKLOG_TRACEABILITY.md)

[State transitions](COMMUNICATION_TRUST_STATE_MACHINES.md) · [Notification event matrix](NOTIFICATION_EVENT_MATRIX.md)

Synthetic fixture screenshots show the [mobile conversation](docs/communication-trust/conversation-mobile-dark.webp), [mobile viewings](docs/communication-trust/viewings-mobile-dark.webp) and [desktop owner profile](docs/communication-trust/owner-profile-desktop-light.webp).
