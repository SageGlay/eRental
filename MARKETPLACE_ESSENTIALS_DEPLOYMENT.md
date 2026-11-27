# Deploy marketplace essentials to staging

The repository migration was tested in disposable PostgreSQL. A staging operator must verify the hosted contract and run acceptance before requesting separate production approval. Use a reviewed checkout, a staging Supabase project with the existing marketplace schema and five designated identities. Only the plain project URL and matching publishable key go into the frontend build. Keep database credentials in the operator's approved secret store. [Manual acceptance](MARKETPLACE_ESSENTIALS_MANUAL_TESTING.md)

## Compare the existing project and history

1. Confirm the staging project reference and its PostgreSQL version. Save the metadata output of the existing marketplace and verification probes in a private location. Review hosted RLS, keys, grants, trigger definitions and actual function bodies for listing visibility, booking transitions, conversations, verified message sender and recipient, and simulated payment/refund creation. Check that the payment writer runs within the authorized actor's transaction. The repo's fixture schemas model these contracts. Hosted definitions are the authority for rollout. [Existing marketplace metadata](supabase/diagnostics/milestone_3_security_contract.sql) · [Essentials catalog and grants](supabase/diagnostics/marketplace_essentials_contract.sql) · [Verification preflight](supabase/diagnostics/verification_release_check.sql)
2. In a dedicated checkout, link the CLI only to the designated staging reference and compare both columns of migration history. Supabase CLI 2.122.1 generated the new migration.

   ```sh
   supabase --version
   supabase link --project-ref STAGING_PROJECT_REF
   supabase migration list --linked
   supabase db advisors --linked --type security --level info
   ```

3. Reconcile absent local historical migrations, extra remote versions or manually installed changes from authoritative scripts and deployment records. Use a disposable checkout to inspect fetched migration history. Apply targeted history repair only after the full effects and provenance of that exact version have been verified. Do not reset the project or replay the foundation to repair history. [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
4. Require the hardened `review_verification` body with SHA-256 `cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7` and its corresponding privilege and trigger checks. If `20261119184647` is still pending and the original preimage matches, apply and validate verification hardening first from the approved PR #5 checkout. Pause and drain reviews for that cutover. If the hardened body exists without a version record, use the verified history reconciliation in its runbook. If the definition or prerequisites differ, preserve diagnostic evidence and reconcile them before proceeding. [Verification deployment and rollback](VERIFICATION_SECURITY_DEPLOYMENT.md)

## Apply the single reviewed version

1. Confirm the latest backup and coordinate a short write window. Verify the tracked server-side workflows, particularly existing booking/message triggers and any constraints on simulated rental/deposit rows. If the platform has more than one simulated financial operation of a given type per booking, review its event key before enabling that hook. The migration can check its catalog prerequisites. Actual source policy logic and status meanings also need operator review. [Schema and privileges](MARKETPLACE_ESSENTIALS_SCHEMA.md) · [Event contract](NOTIFICATION_EVENT_MATRIX.md)
2. Run a dry run, continuing only if its sole pending file is `20261125190326_marketplace_essentials.sql`. The checked-in forward SQL changes the schema in one transaction. If the client loses the response, inspect installed objects and history before retrying.

   ```sh
   supabase db push --linked --skip-vault --dry-run
   supabase db push --linked --skip-vault
   supabase migration list --linked
   supabase db advisors --linked --type security --level info
   ```

3. Compare post-deployment metadata and the saved verification fingerprint. The new tables need RLS enabled and the expected policies. Confirm no effective anonymous access, no arbitrary notification writes by authenticated clients, and authenticated execution of only the documented RPCs. Confirm all intended source triggers are enabled. Use separate user browser profiles to verify isolation. Direct administrator SQL skips client authorization.
4. Deploy the staging frontend after the database is ready. Run ME01–ME10 with actual Auth, PostgREST and Storage, and exercise the booking cancellation/completion and supported simulated refund variations. Have the project owner review terms and privacy including the operator contact and retention policy before public use. Record the observed results and security advisor decisions. Label any missing viewings or expanded applications as deferred. [Staging acceptance](MARKETPLACE_ESSENTIALS_MANUAL_TESTING.md)

## Roll back or recover

A frontend rollback can return to the preceding reviewed build while keeping the additive database schema and private records. If event emission affects source operations, use the versioned operational rollback on the authorized staging target to detach only this milestone's source triggers. The pause guards trigger identities, disables the four source triggers and freezes new client writes to bookmarks, viewing history and notification read state. It retains rows, owner-only reads, RLS and the existing verification hardening. Check the catalog and confirm core workflows still perform their existing operations. Record the pause and notification gap. Use the documented recovery transaction after verifying the paused definitions to restore the grants and enable the same triggers. A history row alone cannot restore disabled triggers. [Versioned operational rollback](supabase/rollbacks/20261125190326_marketplace_essentials.sql) · [Recovery transaction](MARKETPLACE_ESSENTIALS_SCHEMA.md#rollback-and-recovery)

Keep established migration records for versions whose tables still exist. Never replay the foundation or the existing marketplace migration against that state without reconciling it first.

Production deployment requires separate explicit approval for the reviewed version, target and rollout procedure after staged acceptance. [Verification release gate](VERIFICATION_SECURITY_DEPLOYMENT.md#rollback-and-production-gate)
