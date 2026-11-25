# Verification review deployment and rollback

**Stage the change on a designated Supabase project with the existing eRental verification schema.** Migration version `20261119184647` replaces one RPC. Existing users, decisions, badges, buckets and grants retain their values. Production application requires separate, explicit authorization after successful staging acceptance. [Migration](supabase/migrations/20261119184647_harden_verification_review.sql) · [Guarded inverse](supabase/rollbacks/20261119184647_harden_verification_review.sql) · [Executed test results](VERIFICATION_SECURITY_TEST_RESULTS.md)

## Establish the target and capture the before state

1. In Dashboard **Project Settings → General**, record the designated staging project reference privately. Check the eRental staging build uses that project's plain URL and public key. Prepare separate browser profiles for an individual applicant **I**, business applicant **B**, unrelated ordinary user **X**, and existing administrators **A1/A2**. Use separate signed-out and signed-in windows. Obtain test identities from the staging operator.
2. Use an operator with permission to read security metadata. For deployment the SQL role needs ownership of the existing `postgres`-owned RPC, or authority to act as its owner, CREATE on the function schema, and appropriate access to the CLI migration history. Browser users and service-role API keys are unsuitable migration credentials. Use the normal authenticated CLI session and credential prompt or an approved secret store. Keep tokens, connection strings, and document paths out of commands, transcripts and Git.
3. In the staging SQL Editor save the complete results of the three SELECT files below as private evidence. Record project reference, PostgreSQL version, commit and time. Capture the **full original function definition**, OID, owner, ACL, argument names/default and exact search-path setting for `public.review_verification(uuid,text,text)`. Save equivalent evidence for `public.is_admin()`. Preserve the direct ACL and effective privileges separately. Redact any unrelated function literals before sharing. [Recorded export](supabase/contracts/verification.json) · [Verification definitions, policies and bucket](supabase/diagnostics/verification_contract.sql) · [Effective table grants and administrator RLS](supabase/diagnostics/milestone_3_security_contract.sql) · [Release hashes, trigger states and effective client writes](supabase/diagnostics/verification_release_check.sql)
4. Review the following comparison. Any unexplained difference requires checking the actual definition, policies, effective role memberships and history before deployment. Schema output can differ across PostgreSQL major versions. The migration deliberately rejects a different function representation, including unreviewed source or configuration changes.

| Compare | Required evidence |
| --- | --- |
| Review RPC | Exact UUID/text/text signature returning void, third parameter default NULL, `SECURITY DEFINER SET search_path TO ''`, owner `postgres`. Direct ACL consists of owner, authenticated and service_role EXECUTE. PUBLIC and effective anon EXECUTE are false. Both expected API-role grants are true. Compare each overload if the catalog lists additional signatures. |
| Administrator membership | `is_admin()` has the recorded role probe body, owner, empty search path and restricted ACL. Both client roles have superuser and BYPASSRLS false, no membership read/write rights, and no inherited privilege that permits assuming a privileged role. `admin_users` has RLS enabled and zero policies. A1/A2 independently open the admin route using ordinary signed-in sessions. |
| Verification data | RLS is enabled. Compare every policy, constraint, unique index and trigger definition with the recorded contract. In particular check the one-pending index, applicant/admin reads and enabled `verification_prepare` and `profiles_clear_verification` triggers. The effective-write report should show only five authenticated submission INSERT columns (`user_id`, `kind`, `document_type`, `document_path`, `details`) and four authenticated profile UPDATE columns (`display_name`, `avatar_url`, `account_type`, `business_name`). Check table-level DELETE/TRUNCATE rights separately. App roles cannot write decisions or either badge column. |
| Private evidence | `verification-documents` is private, limit 5242880 bytes, allowed JPEG/PNG/WebP/PDF. Inspect all applicable Storage policies together, including general policies and policies for other buckets. Authenticated INSERT requires the applicant's folder. SELECT is limited to that owner or an authorized admin. No client policy permits verification document overwrite or deletion. |

The release check hashes the UTF-8 **full text of pg_get_functiondef**, including the trailing newline. The expected hashes come from the reviewed SQL and recorded export.

| Function / phase | Expected SHA-256 |
| --- | --- |
| `review_verification` before forward, or after inverse | `431f69852d5fac7ebf518476792fb8f415775929155ca8e021e4899eb11f1023` |
| `review_verification` after forward, or before inverse | `cbd3cea69935bea9aad11a5873b839c88329f71482e9aa82fa41d395e1b76fa7` |
| `is_admin` throughout | `f7e4cb344b922be64505ecee1e1694b0d11eb37440dc18083c0e154e00d83b5d` |

## Reconcile migration history

Use a clean checkout of the reviewed commit. The Supabase CLI 2.122.1 command forms below use an explicit staging reference. Replace `STAGING_PROJECT_REF` with the staging project identifier. A deployment operator should coordinate schema changes so only one migration runner acts on this project at a time.

```sh
supabase --version
supabase link --project-ref STAGING_PROJECT_REF
supabase migration list --linked
supabase db advisors --linked --type security --level info
```

Check local and remote versions against `supabase_migrations.schema_migrations`. The base migration is `20261102083451`. The later verification schema was recorded as metadata, so this repository alone cannot provision that schema on an empty database. Classify the target before running a push.

| Observation | Operator action |
| --- | --- |
| Previous versions match, reviewed old definition present, new version absent remotely | Continue to the dry run below. |
| Extra remote migration versions, missing local historical SQL, or an unrelated pending migration | Obtain the authoritative historical files from source control or deployment backups. To inspect available remote statements use `supabase migration fetch --linked` in a separate disposable checkout linked only to staging. Review recovered SQL and provenance before including it in a deployment checkout. Do not execute this hardening until history reconciliation leaves exactly the intended change pending. |
| Objects exist following manual SQL without a matching history row | Establish which complete historical migration actually ran using its exact source, schema, data-change evidence where applicable and deployment records. Only after that comparison can the operator record an identified version with `supabase migration repair --linked --status applied VERSION`. The presence of a table alone cannot establish that a historical script, including its seeds, ran. An exported catalog snapshot is not a deployable historical migration. |
| Version `20261119184647` already recorded and exact hardened definition/ACL present | Skip applying SQL. Run the post-deployment checks and hosted acceptance. |
| Hardened definition exists but its version is absent | Compare the complete migration effects, guards, OID, owner, effective grants and deployment record. If they establish that this exact change already ran, record only this version as applied with the repair command above and verify the history again. |
| Anything else, including missing verification schema, an intermediate proposal body, or an applied version with old/different code | Preserve the private diagnostics, investigate the divergence and restore the authoritative prerequisites or prepare a separate reviewed reconciliation. Avoid replaying foundation/seed SQL or clearing existing migration history. |

`migration repair` only changes the history entry. It never changes the function. Keep the observed version list and reason for any targeted repair in the deployment record. [Supabase migration workflow and history](https://supabase.com/docs/guides/deployment/database-migrations) · [CLI reference](https://supabase.com/docs/reference/cli/introduction)

## Apply on staging and verify

1. Run the following preview. Continue only if the CLI lists **one** pending file, `20261119184647_harden_verification_review.sql`. The explicit vault flag limits the push to the migration. Leave seed/role/include-all options off.

   ```sh
   supabase db push --linked --skip-vault --dry-run
   ```

2. Coordinate a review pause with all staging administrators and any API review workers. Drain or complete open review transactions and confirm that every reviewer or worker has stopped sending decisions. A call already executing the old function can finish after replacement. Keep reviews paused through the catalog and history checks in step 3. With that pause, the staging target and the original-definition backup confirmed, apply from the same checkout. The migration checks its prerequisites, replaces the existing function and checks the postimage within one PostgreSQL statement. A guard error aborts the statement. If the client loses its response, inspect the catalog and migration history before retrying.

   ```sh
   supabase db push --linked --skip-vault
   supabase migration list --linked
   supabase db advisors --linked --type security --level info
   ```

3. Rerun the read-only diagnostic files on the same target. Compare the captured OID (within this database), owner, ACL including grantors, effective EXECUTE, definer flag, search path, arguments and return type. Only the reviewed function body should change. Verify the hardened SHA-256 and inspect the definition for the pending-request lock and the applicant lock/eligibility check before approval. Check the version appears in both columns of the migration list. Record security advisor results separately from the catalog assertions. Supabase recommends fixed search paths, qualified references and restricted EXECUTE for privileged functions. [Supabase function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)
4. After the expected catalog and history are confirmed, reopen review for the designated staging identities. Run the scenarios below with the actual staging Auth, PostgREST and Storage services. Mark each PASS, FAIL, BLOCKED or NOT RUN and capture the observed outcome. Use UTC time, role aliases, app commit and harmless case identifiers. Retain no raw IDs, credentials, signed URLs, object names or private file contents in shared reports.

## Hosted acceptance

Use distinct synthetic samples labeled **TEST DOCUMENT — INVALID FOR IDENTIFICATION**. Keep within the existing five-submissions-per-day and one-pending limits. Allow a new test day or use additional designated test applicants when repeats require it. Cross-user checks refer only to known fixtures owned by the participating test accounts. The staging operator can use their usual authenticated application client to verify role-bound responses. Dashboard-owner queries do not exercise end-user RLS.

| Case | Staging procedure | Passing observation |
| --- | --- | --- |
| VS01 | I opens My profile → Account verification, uploads a synthetic identity image and reloads. | Exactly one owned pending request, correct kind and no badge. |
| VS02 | B sets business account type and a valid business name. Submit a synthetic business PDF. | Pending business request with the application-selected private path and no badge. |
| VS03 | A1 opens a pending request in the verification queue, chooses View private document, then Hide or Close. Repeat as A2. | Each authorized view succeeds on demand through authenticated Storage. The preview disappears on close. No public document URL is emitted. |
| VS04 | A1 approves I after comparing current identity and fixture. Reload the queue. I uses Refresh status, checks My profile and the listing owner display for an owned fixture. | Approved decision once, correct reviewer and time. The protected profile has identity kind with a date, and the identity badge agrees. Repeat for an eligible business to confirm its distinct badge. |
| VS05 | A2 rejects an eligible pending B fixture with a nonblank sample reason. Refresh the applicant's history and the admin queue. | One rejection, the reason visible to B and no new badge. |
| VS06 | B submits corrected synthetic evidence after VS05. | Fresh pending ID, previous rejection retained, no badge from resubmission. |
| VS07 | X, then a signed-out client, opens the admin route and requests a normal review decision for a known synthetic pending case using its own session or guest role. | Admin destination is denied or requires sign-in. Authenticated non-admin review fails server authorization, anonymous execution is denied, and the case and badge remain unchanged. |
| VS08 | Compare I's permitted private read with X and the signed-out client requesting the same known synthetic document and submission. Check a legitimate owned-folder upload and the blocked cross-owner write on test-only evidence. | I and authorized admins can read the sample. Unrelated/signed-out reads return no authorized result. The bucket stays private, and client overwrite/delete cannot change the synthetic evidence. |
| VS09 | As I and X check the approved staging authorization case for a direct profile change that includes protected badge fields. Compare profile state before and after. | PostgreSQL/PostgREST denies the write. No ordinary session can assign verification; allowed public profile edits still work. |
| VS10 | Give A1 and A2 the same pending synthetic case. Open the review dialog in both sessions. Confirm competing approvals, then repeat on a new case with conflicting decisions. Refresh both queues and the applicant. | Exactly one recorded reviewer, note and timestamp; the second decision is rejected. A badge matches the committed approval, while a first rejection leaves an initially unverified applicant without a badge. A later duplicate review cannot overwrite either result. |
| VS11 | While I has a pending identity request, switch I to a business account with a valid name. Review the old case. On a separate eligible fixture, approve and then change a protected identity field. | The stale approval fails; request and badge remain unchanged. After a successful approval a later protected edit clears both badge fields and history still retains the prior approval. Verify nonblank business eligibility on a suitable fixture without weakening staging constraints. |
| VS12 | Refresh applicant and reviewer pages. Switch an applicant browser to X and an admin browser to an ordinary account; navigate through Back and direct links. | Each account sees only its authorized state, no stale private evidence or stale admin controls. A historical approved row alone never generates a badge. |

Two browser clicks close together establish competing user outcomes. For lock evidence, the disposable database suite holds independent transactions and confirms the second waits using `pg_blocking_pids`. If staging scheduling cannot demonstrate overlap, record that limitation alongside VS10. The hosted checks and current execution statuses are separate from that database proof. [Test results](VERIFICATION_SECURITY_TEST_RESULTS.md)

## Rollback and production gate

1. If a staging discrepancy or operational failure requires rollback, **pause administrator reviews**, including API-based review clients, before using the inverse. Ensure in-flight decisions have finished and preserve their case-level audit evidence. Restoring the old implementation reopens the concurrent-decision risk.
2. On the same staging project, run the release check. Compare the live hardened definition and ACL with the post-deployment capture. Compare the **entire** old function in the guarded inverse with the full definition captured immediately before forward deployment, including owner, search path and effective privileges. An unexpected hash, owner, permission, later code change or missing evidence requires investigating first.
3. In the labeled staging SQL Editor, execute the complete guarded inverse as one query. It verifies the hardened source and ACL, restores the recorded old definition, then checks the restored hash. Leave the inverse outside the migrations directory. [Inverse SQL](supabase/rollbacks/20261119184647_harden_verification_review.sql)
4. Rerun the metadata checks. Confirm the restored full definition, hash, OID, owner, ACL, search path and grant results equal the captured before state. Confirm any previously committed decisions and applicant badges still represent their recorded outcomes. The inverse changes code only. Investigating any incorrect historical decision is a separate authorized operation.
5. For this manual staging rollback, after the successful inverse and catalog verification, if the CLI still lists the version as applied, reconcile **only** its history row.

   ```sh
   supabase migration repair --linked --status reverted 20261119184647
   supabase migration list --linked
   ```

   Record the rollback event, observed definition and operator. Keep reviews paused while the prior function is active. Reapply from the reviewed checkout only after the failure is understood, then repeat the post-deployment and hosted checks. A failed inverse or mismatching catalog does not qualify for history repair.

6. Submit the staging results, advisor findings, exact before/after definitions and grants, rollback rehearsal and remaining limitations for production review. Production requires separate explicit authorization naming the project and reviewed migration. An approved production operator repeats target identification, backup, version reconciliation, dry run, review pause and transaction drain, metadata and history checks, and authorized acceptance on that target. Repository test success alone cannot open that gate.

Verification evidence may outlive a failed submission or a later identity change. Existing object DELETE permissions remain restricted. An authorized operator must handle retention or orphan cleanup under the project's retention policy. The review migration and rollback perform neither cleanup nor historical badge repair.
