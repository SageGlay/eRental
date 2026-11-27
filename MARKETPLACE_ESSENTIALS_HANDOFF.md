# Marketplace essentials handoff

The eRental 3.0 milestone adds persistent bookmarks, featured and personalized discovery, a notification center, and draft terms and privacy pages. The new migration requires the existing marketplace data model and the hardened verification function from PR #5. Database and browser checks use synthetic records. Hosted rollout remains blocked pending staging access and acceptance. [Test evidence](MARKETPLACE_ESSENTIALS_TEST_RESULTS.md) · [Deploy to staging](MARKETPLACE_ESSENTIALS_DEPLOYMENT.md)

## What changed

| Workflow | Result |
| --- | --- |
| Save a rental | A separate button saves or removes a listing from cards and detail pages. The account menu opens `/saved`. Unavailable rentals retain their status and inaccessible entries can be removed without revealing listing details. |
| Discover rentals | Home features up to three distinct named owners with available, photographed rentals among the newest 32 visible listings. Up to four viewed and saved categories contribute to recommendations. Latest visible inventory is the fallback. Signed-in history retains up to 12 distinct listings per account, and guest history stays in the current tab. Both can be cleared. |
| Follow updates | The bell displays a separate unread count. `/notifications` groups updates, pages through lists, filters unread items, and marks one or all as read. Opening an unread update confirms its read state before navigating. |
| Confirm activity | Booking decisions, inquiry and message delivery, simulated payment/refund and verification decisions generate persistent notifications from the source transaction. Payment keys reflect the current one-operation-per-type model. Recipient-only reads and server-controlled event templates preserve confidentiality. The original verification RPC remains authoritative. |
| Read legal information | Public `/terms` and `/privacy` are reachable from registration, the footer and relevant private pages. They describe the actual implementation and identify unapproved operational contact and retention information. |

## Release gates

- **Hosted contract and acceptance.** Compare live schema and effective authorization, reconcile the hardened verification migration, and run ME01–ME10 before requesting production approval. The new migration assumes the existing booking, message and simulated payment contracts described in the runbook. [Acceptance](MARKETPLACE_ESSENTIALS_MANUAL_TESTING.md) · [Database schema](MARKETPLACE_ESSENTIALS_SCHEMA.md)
- **Backlog.** PB-031 remains partial. Viewing appointments and expanded rental applications require their own source workflows. Future events have a documented integration contract. Legal pages are drafts pending owner and academic or legal review. [Traceability](MARKETPLACE_ESSENTIALS_BACKLOG_TRACEABILITY.md) · [Event matrix](NOTIFICATION_EVENT_MATRIX.md)
- **Recovery.** The additive migration can remain installed when reverting the frontend. The SQL pause disables these event triggers and freezes new feature writes, retaining saved items, personal history and existing notifications. [Runbook](MARKETPLACE_ESSENTIALS_DEPLOYMENT.md)

Fixture screenshots show [featured discovery](docs/marketplace-essentials/discovery-desktop-light.webp), [saved listings](docs/marketplace-essentials/saved-desktop-light.webp), [mobile notifications](docs/marketplace-essentials/notifications-mobile-dark.webp) and [the mobile privacy draft](docs/marketplace-essentials/privacy-mobile-dark.webp).
