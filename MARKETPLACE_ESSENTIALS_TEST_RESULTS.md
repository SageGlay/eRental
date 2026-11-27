# Marketplace essentials test results

The main-branch baseline at `3882626` passed all 145 Chromium and 20 PostgreSQL tests. The milestone adds 24 browser tests and 14 database tests. Browser requests use synthetic fixture responses. PostgreSQL exercises the installed SQL in disposable PostgreSQL 17.12 with independent connections. [Baseline and prerequisites](MARKETPLACE_ESSENTIALS_AUDIT.md)

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | Installed 84 packages from the committed lockfile. |
| `npm test` | PASS | 169 Chromium cases across established marketplace workflows and the new features. |
| `npm run build` | PASS | Vite processed 169 modules in 2.77 seconds using fictional public Supabase values. The Browse route loads on demand. The initial bundle was 494.22 kB minified and 145.03 kB gzipped. |
| `npm run test:db` | PASS | 34 cases in 23.23 seconds on PostgreSQL 17.12 with zero failures or skips. |
| Supabase CLI rehearsal | PASS | CLI 2.122.1 previewed only version `20261125190326` in the isolated fixture. A prerequisite mismatch left tables and history untouched. After correction, the CLI applied the version, recorded it in history and confirmed a clean repeat dry run. |
| Hosted acceptance and Security Advisor | BLOCKED | Need the designated staging project, an approved SQL connection and five test accounts. All ten manual scenarios remain open. Hosted booking, payment, message and verification definitions require current catalog confirmation. [Staging checks](MARKETPLACE_ESSENTIALS_MANUAL_TESTING.md) |

## Browser coverage

- Saved listings cover login return, confirmed saves and removals, repeat clicks, refresh, inaccessible and unavailable records, uncertain responses and account switching. [Saved tests](tests/e2e/saved.spec.js)
- Discovery covers eligible featured inventory and public owner badges, viewed and saved categories, fallback, exclusion of removed inventory, account separation, clearable history and responsive captions. [Discovery tests](tests/e2e/essentials-discovery.spec.js)
- Notifications cover unread counts, paginated results in stable order, confirmed and failed changes, read persistence, mark-all, logout, destination validation and keyboard focus. [Notification tests](tests/e2e/essentials-notifications.spec.js)
- Public terms and privacy are exercised from entry points and direct routes. Responsive checks cover 320, 390, 768, 1024 and 1440px, both appearances via system color preference, reduced motion and keyboard navigation. Review caught cramped navigation and a featured-owner caption overlap. Corrections are covered at the targeted widths. [Legal tests](tests/e2e/essentials-legal.spec.js) · [Layout tests](tests/e2e/essentials-layout.spec.js)

## Database coverage

The new tests install the actual migration over the existing verification export and a representative source fixture. Application-specific deployed booking, conversation and payment definitions are therefore a staging comparison point. The original 20 verification checks continue to pass. [Database tests](tests/postgres/marketplace-essentials.test.js)

| Area | Observed result |
| --- | --- |
| Saved and recent activity | Required ownership, visible listing checks, cascade deletion, key uniqueness, history clear and a 12-record cap under concurrent inserts. |
| Business events | Booking request, acceptance, rejection, cancellation and completion notify the correct counterpart. Rollback leaves no persisted event. Payment/refund lines deduplicate by the current single-operation booking contract. |
| Messaging | Authenticated participants receive one first inquiry and subsequent messages. Batch sends, concurrent first messages and duplicate delivery keys preserve that behavior. |
| Verification | Competing reviewers produce one committed notification for the applicant. Private document data and rejection notes stay outside event records. |
| Read permissions | Ordinary clients cannot create events, access internal keys, change another recipient's read state or invoke internal writer functions. Repeated reads preserve their first timestamp. |
| Recovery | Catalog query reports the installed privileges and trigger state. The operational rollback pauses feature writes and deliveries while preserving records, existing workflows and hardened review. |

The PR screenshots use synthetic inventory and activity. They document representative layouts alongside the automated checks. Hosted native Auth, Storage, real source policy behavior and owner approval of legal content will be recorded separately. [Deployment and rollback](MARKETPLACE_ESSENTIALS_DEPLOYMENT.md)
