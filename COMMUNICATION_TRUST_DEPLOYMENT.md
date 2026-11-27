# Communication and trust deployment

Use a designated staging project with real test sessions and the existing eRental marketplace. Reconcile the project schema and migration history before changing it. Production deployment requires separate explicit authorization after staging. [Manual acceptance](COMMUNICATION_TRUST_MANUAL_TESTING.md)

## Prerequisites

1. Link the current CLI checkout only to the approved staging project. The staging operator needs permission to read catalog metadata, execute the reviewed DDL and configure Supabase Realtime. Keep the project database connection and authentication credentials private.
2. Capture the deployed schema and actual migration list. Compare listing, booking, conversation, message, review and profile keys and constraints, client grants, RLS, existing triggers and RPC definitions. Verify that `supabase_realtime` is an appropriate publication for participant-scoped message inserts and updates. Record all existing published tables and operations before changing them. [Read-only release catalog](supabase/diagnostics/communication_trust_contract.sql) If other active workflows require incompatible publication settings, reconcile staging and retest before installing. [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
3. Establish the exact applied predecessor versions. Check the protected review function fingerprint and effective privileges for `20261119184647`. Verify `20261125190326` against its event schema, trigger state, recipient grants and read RPCs. Apply any missing reviewed prerequisite from its own reviewed checkout after reconciling history. The catalog and deployment record must establish that an earlier migration actually ran before any history repair. [Verification](VERIFICATION_SECURITY_DEPLOYMENT.md) · [Marketplace Essentials](MARKETPLACE_ESSENTIALS_DEPLOYMENT.md)
4. Check source ownership and history on real test claims as well as catalog definitions. Ordinary users need existing participant SELECT, valid message/conversation creation, and recipient-only read markers. The complete-rental review contract must preserve the original owner, correct renter and one review per booking. Resolve legacy data inconsistent with required identities or keys as a reviewed migration before continuing.

## Apply only the expected versions

Supabase CLI 2.122.1 generated the migration files. The event vocabulary version precedes the feature SQL.

```sh
supabase --version
supabase link --project-ref STAGING_PROJECT_REF
supabase migration list --linked
supabase db push --linked --skip-vault --dry-run
```

On a ready staging target that has the preceding milestones, the only pending versions are:

1. `20261127090000` notification event types.
2. `20261127090001` communication safety and scoped Realtime publication.
3. `20261127095438` viewing appointments.
4. `20261127095520` review responses, aggregates and disputes.

Capture a verified backup of the target. Coordinate the write window, especially the recipient backfill and constraint validation on existing messages. If any guard fails, stop and inspect the catalog and migration history. A failed migration can leave preceding versions successfully applied. Proceed from actual history and definitions after resolving the discrepancy. Never reset the deployed database or replay the foundation to repair a partial deployment.

```sh
supabase db push --linked --skip-vault
supabase migration list --linked
supabase db advisors --linked --type security --level info
```

Verify each version and compare grants, RLS and Realtime publication membership. Ensure `public.messages` publishes only inserts and updates under the approved policy, and test with independent signed-in browser profiles. Native Realtime delivery and authorization cannot be inferred from a browser protocol stub or a SQL fixture. Deploy the staged frontend after database readiness. Complete CT-01–CT-18 with the actual services and get the operator's approval before requesting production rollout. [Acceptance evidence record](COMMUNICATION_TRUST_MANUAL_TESTING.md)

## Recover while preserving data

A temporary client rollback can revert the UI while the additive tables and guards remain present. The server restrictions on blocked contact, retained evidence and controlled review visibility continue to protect those records. If delivery causes a problem, inspect relevant trigger and publication state before a reviewed forward change. Disabling Realtime on messages reduces automatic refresh to the client's polling and manual recovery paths. Changing publication-wide operations can affect unrelated consumers and requires checking the captured publication first.

If a migration or hosted compatibility issue needs further repair, pause affected new operations and prepare a narrowly scoped, versioned forward recovery from the exact deployed state. Do not use generic DROP/CASCADE, remove private evidence, clear moderation history, or reset versions whose objects remain installed. Expanded notification types can stay installed during recovery to preserve old and new records. Keep existing booking, payment and verification workflows available. Review the decision and validate it on staging before production.
