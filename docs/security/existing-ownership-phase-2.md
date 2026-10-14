# Existing Assemblyreels — ownership Phase 2

October 14, 2026 (Asia/Manila). **Database migration applied and live SQL role isolation accepted.** Application workspace activation and independent signed-in browser/REST acceptance remain later gates.

The operator reported PASS for both the guarded migration and the complete rollback-only A/B isolation script. Follow-up read-only verification completed at **15:41:49 Asia/Manila** with **33 checks passed**: all ten original table snapshots, the original confirmed identity, seven NULL workspace owners, 778 orphan scenes, generated scene references, empty operation/counter tables, all three private buckets, the 161 object keys/sizes, anonymous denial for all thirteen public tables and an unavailable sampled old public Storage URL. No synthetic identity or workspace remains. Evidence: ignored `scratch/account-backups/ownership-2026-10-14-lyArln/live-ownership-verification.json`.

The migration and test must not be replayed as another setup sequence. The live database is now ahead of the pre-migration catalog/backup; refreshing that evidence is required before preparing a different migration. Hosted flags remain auth-only and ordinary login still goes to `/account`.

## Prepared behavior

- Preserve every original application value and recorded owner. The seven NULL workspace owners and 778 orphan scenes remain quarantined. This phase performs no legacy-owner assignment.
- Preserve `scenes.project_id` as text. Add `account_project_id`, a stored UUID projection derived by PostgreSQL from the original field. New references must be canonical and have an existing project; scene/media and timeline/media links must share a project. Existing invalid rows are retained through `NOT VALID` constraints and cannot be updated into an invalid state.
- Replace the legacy policies on the eight content tables with authenticated owner reads and a restrictive ownership boundary. Remove browser table and column writes. Direct INSERT, UPDATE and DELETE remain denied; later application features use reviewed RPCs.
- Derive the actor from JWT identity plus the stored confirmed, non-anonymous, non-banned Auth account and matching profile. No caller-supplied owner field is accepted.
- Provide bounded, idempotent workspace/project creation and owned rename RPCs. Limits: three workspaces/account, ten projects/workspace, and transactional request counters. Creation retries reuse their operation records; unrelated or changed reuse is rejected.
- Keep account-profile credits protected and all three Storage buckets private. No uploads, provider jobs, rendering, billing authority, onboarding or editor activation is included.

PostgreSQL computes generated fields and disallows an ordinary caller-supplied replacement value. See [generated columns](https://www.postgresql.org/docs/17/ddl-generated-columns.html). `NOT VALID` preserves legacy rows while checking subsequent writes; see [ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html).

## Release candidate and recovery copies

**Run only the generated private bundle:** `scratch/account-existing-ownership-upgrade.sql`.

It combines request limits from generic 006 with the schema-specific ownership draft. Do not run generic 004, 005 or 007 afterward as a bulk continuation. The local source draft is `db/auth/existing-project/004-owned-records-text-projects.sql`; it is not the guarded release file.

The private bundle contains SHA-256 fingerprints of the reviewed catalog sections and ordered backup rows, so keep it out of Git and shared messages. It checks the operator, schema/permissions/policies/functions/triggers/indexes/default grants/buckets, account counts and original data under bounded locks. A mismatch stops the transaction before backup creation or permission changes. Temporary fingerprint functions normalize equivalent decimal scales (such as 1.00 and 1) while preserving string contents, keys, nulls, booleans and array order. PostgreSQL's built-in SHA-256 requires no extension or new credentials. The SQL-time recovery copy saves the actual catalog that passed these checks.

The first 4.7 MB candidate was rejected by the SQL Editor's size limit. It has been replaced at the same path with a **35,354-byte (approximately 35 KB)** candidate. The original backup remains intact. This is still one atomic transaction; no preservation or permission check was removed to meet the size limit.

The temporary `pg_temp.ownership_reviewed_catalog` table now explicitly enables RLS and revokes all PUBLIC, anon, authenticated and service_role privileges. It belongs to the SQL session and is dropped at commit. Supabase's generic destructive-operations warning may still appear because the migration replaces old policies and revokes privileges; the migration does not delete existing application content. The request-limit function includes cleanup of old counter records in its new counter table, not videos or projects.

Before enabling owned metadata reads, it creates **`account_ownership_backup_20261014`**, with copies of the ten application tables, Storage metadata and the catalog/receipt. All thirteen backup tables have RLS and the schema/tables deny PUBLIC, anon, authenticated and service_role access. The independent local byte backup remains `scratch/account-backups/ownership-2026-10-14-lyArln/`; the SQL-time copy does not replace it.

At the end, the bundle verifies every original row again, excluding only the newly generated scene field, checks that no NULL owner was assigned, then commits. Any failure rolls the whole transaction back. It refuses replay after completion. Feature flags stay off until live acceptance and the later application authorization phase.

## Validation completed

- **67 auth tests passed.** Nine new migration tests cover preservation, unknown-owner quarantine, legitimate existing-owner access, A/B isolation, input forgery, unconfirmed/banned/anonymous accounts, canonical references, same-project links, idempotency, quotas/rate limits, restrictive policies despite a permissive addition, schema/same-count data drift, and rollback/replay.
- Targeted lint passed with no warnings; `git diff --check` passed.
- **18 exported-data replay checks passed.** All ten tables' original values, seven NULL owners, 778 orphan scenes and 161 object metadata records were preserved. The SQL-time backup protection and generated bundle replay refusal were checked. The separate live-style isolation script passed locally and left no synthetic identities/workspaces.
- The replay uses the actual exported public columns, defaults, constraints, indexes, functions, triggers, policies and backed-up rows. Managed Auth and Storage structures are modeled minimally in PGlite. This proves local compatibility, not a live Supabase migration or provider/session acceptance.
- No application runtime source or hosted capability flags changed; no deployment was required for this preparation.
- After shrinking the candidate and explicitly protecting the temporary table, the 18 exported-data replay checks passed again. Eleven targeted migration/fingerprint tests passed, including same-count data and schema drift, numeric-scale equivalence, significant decimal changes, string/key/null/boolean differences, array reordering, a maximum generated-request size, and temporary-table RLS plus revocation despite inherited default grants. Targeted lint and diff checks passed.

## Completed operator procedure (historical)

1. In the existing **Assemblyreels** Supabase project, open SQL Editor as **postgres**. Reopen the updated **`scratch/account-existing-ownership-upgrade.sql`** from disk, copy the entire file into a new query and run the whole query. Use the new approximately 35 KB version, replacing the earlier oversized query. Expect `PASS: ownership metadata isolation prepared; all original rows and owners preserved; Storage and paid features remain closed; live role testing required`.
2. If it errors, stop and share only the error text. Do not remove guards, run a selected fragment, replay the old auth upgrade, or enable workspace flags. A drift error requires refreshed evidence and regeneration. Inspect transaction state and roll back an aborted transaction before retrying a reviewed replacement.
3. After PASS, run the entire **`db/auth/existing-project/test-owned-isolation.sql`** file as postgres. It creates two temporary confirmed identities and metadata fixtures, tests role isolation and cross-project constraints, then rolls everything back without email, passwords, sessions or Storage uploads. Expect `PASS: A/B owned metadata isolation, bounded RPCs, same-project links, closed direct writes/credits/storage; all test records rolled back`.
4. Both results were reported PASS and the agent completed 33 live read-only follow-up checks. Login continues to `/account` until the application authorization/onboarding phase is ready.

Live SQL role acceptance is distinct from two actual signed-in browser/REST sessions. Real A/B provider-session checks are still required before broader workspace launch; the current Resend shared sender restricts real email delivery to the configured recipient. No old workspace becomes owned automatically.

## Developer continuation

Regenerate and replay the candidate with:

```powershell
npm run prepare:ownership -- scratch/account-backups/ownership-2026-10-14-lyArln
npm run check:ownership-fixture -- scratch/account-backups/ownership-2026-10-14-lyArln
```

The regeneration/replay commands above describe the pre-application release procedure; do not generate another live setup from the stale pre-migration catalog. The repeatable read-only verification command for the current state is:

```powershell
node --use-system-ca scripts/auth/verify-existing-ownership.mjs scratch/account-backups/ownership-2026-10-14-lyArln
```

The next application phase must use the new RPCs and avoid counting a workspace/rename request both in the server handler and again inside its transactional RPC. Adapt future composite scene references to `account_project_id`; do not assume that generic UUID-only migrations are now safe to apply. Private media delivery remains a separate migration/authorization step.
