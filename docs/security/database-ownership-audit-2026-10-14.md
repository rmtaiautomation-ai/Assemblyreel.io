# Database ownership audit and backup — October 14, 2026

Status: **fresh application backup verified; application relationship audit and PostgreSQL catalog review complete**. The subsequent [Phase 2 migration](existing-ownership-phase-2.md) has been applied and passed live SQL role isolation plus 33 read-only follow-up checks. No legacy-owner assignment has been applied. This document records the pre-migration audit; its catalog snapshot must not be reused for another live migration.

## Saved backup

Private directory, relative to the project:

`scratch/account-backups/ownership-2026-10-14-lyArln/`

This directory is under the existing OneDrive project path. Git ignores `scratch/`; the private rows, account inventory and media bytes stay outside the repository. The previous `assemblyreels-wXHYQ5` backup remains intact.

- Ten public application tables exported with exact counts, ordered IDs and SHA-256 file hashes.
- All **161 Storage objects / 92,814,253 bytes** downloaded. The three buckets are private.
- API schema, bucket/object metadata, limited Auth identity inventory and private ownership mapping saved alongside the rows.
- Full application row, schema, stable identity and Storage metadata re-reads matched. Each object was downloaded a second time and its content hash matched.
- Independent local verification checked every file against the manifest. All ten tables were replayed into an ephemeral PostgreSQL-compatible test database using the current API column types; all restored row values matched, including timestamps at the source's UTC timezone.
- `manifest.json` records completion; `receipt.sha256` records its SHA-256 receipt:

`cef4ea62f67693ea3f391fc1a07d5bf55a5d2dc82b9af75b960119c4cd0edca8`

Verification evidence is private: `offline-verification.json`, `audit-summary.json`, and `ownership-media-review.json`. The latter is a supplementary review generated after the sealed backup manifest; it does not replace or alter the sealed files.

This is an application export using paginated APIs and consistency re-checks, **not a transactional/full PostgreSQL or Auth backup**. Auth password hashes, sessions, tokens and provider configuration are excluded. The account identity inventory is for ownership matching, not for restoring authentication. External media links and legacy local filesystem paths are preserved as references; their bytes are not included unless the corresponding object is in Supabase Storage.

## Current inventory

| Resource | Rows |
|---|---:|
| Confirmed Auth accounts | 1 |
| Public account profiles | 1 |
| Workspaces | 7 |
| Projects | 18 |
| Scenes | 2,050 |
| Media | 527 |
| Timeline items | 0 |
| Overlay clips | 13 |
| Act narrations | 53 |
| Channel facts | 40 |
| Marketing leads | 0 |

The one profile matches its Auth account by ID and email and has zero legacy credits. All eight legacy content table hashes and all 161 object hashes match the October 13 backup. The new profile and empty marketing-leads table are the expected additions since the original zero-account export.

## Findings for the ownership migration

1. **All seven legacy workspaces have `user_id = null`.** None is assigned to the current account. The private audit retains their IDs and project membership. They remain quarantined until an explicit legitimate owner is verified.
2. **778 scenes reference projects that are absent.** Their reference strings are syntactically valid UUIDs; the parent projects are missing. These rows are preserved for explicit investigation rather than deletion or automatic reassignment.
3. **`scenes.project_id` is text; `video_projects.id` and other project references are UUID.** The generic `004-owned-records.sql` uses direct UUID/text comparisons and foreign keys and cannot be applied unchanged. Composite scene/media constraints also need schema-specific handling. Do not convert or rewrite the legacy column during an unreviewed migration.
4. There are no orphan projects, orphan media, orphan overlay clips, orphan narrations or orphan channel facts. Existing linked scenes/timeline items show no missing media or cross-project media conflicts. Profile/Auth matching also has no missing identity or email mismatch.
5. Media URL migration requires review. The recursive reference inventory found **1,014 local-path occurrences** and **55 HTTP URL occurrences outside recognized project Storage URLs**. It matched 147 stored-path occurrences and 9 local-path occurrences to Storage objects by exact object name. Five objects had no recognized reference in this heuristic inventory; this is not evidence that they are unused. Repeated occurrences are not counts of unique files. No external URLs were fetched.

Ten live anonymous table-read probes returned permission denial. One sampled old public Storage URL was unavailable. Together with the private bucket inventory, these confirm the checked containment behavior; they do not substitute for a complete fresh RLS/grants/catalog review or prove every possible access path.

## Catalog reviewed

The configured service key can read application APIs and Storage but does not provide a SQL catalog connection. `DATABASE_URL` is not a verified connection to this Supabase project and was not used. No database-management credential is configured.

The operator exported the catalog at **October 14, 2026, 15:02:48 Asia/Manila**. It is saved privately as **`scratch/ownership-catalog.csv`**. It confirms PostgreSQL 17.6, all ten public tables under RLS, revoked browser table privileges, only authenticated `users.id/email` column reads, five public functions with browser execution revoked, and the restrictive Storage quarantine. Legacy permissive policies remain behind those closed grants and must be replaced before owned reads open.

The catalog's public columns were compared with the API inventory and replayed with their defaults, constraints, indexes, functions, triggers and policies. The saved export predates the query's addition of Auth column metadata; the release candidate checks the required Auth column types directly before creating ownership functions. The original sealed backup manifest retains its historical pending-catalog status; the subsequent review does not alter that receipt.

Default grants for objects created by `postgres` are restricted. Default grants for the separate managed creator `supabase_admin` remain broad. This migration does not attempt to alter that managed role: future public tables/functions must receive explicit RLS and privilege review regardless of which creator produces them. The release guards the exported default grants and complete relation/function inventory against drift.

A fresh pre-migration consistency check is required if data changes after this backup. The prepared release includes exact original-row and catalog comparisons under table locks, and aborts instead of silently proceeding on a mismatch.

## Repeatable commands

Create another independent application backup:

```powershell
npm run backup:ownership
```

Verify this saved backup locally without network access:

```powershell
node scripts/auth/verify-ownership-backup.mjs scratch/account-backups/ownership-2026-10-14-lyArln
```

The original `backup:account-existing` remains a zero-account auth-upgrade tool. Its guard has not been relaxed, and the completed auth upgrade must not be replayed.

Validation: **58 auth tests passed**, including five new backup/audit tests; the five targeted tests passed again after extending stored-path matching and the network guard. Lint passed for all three new scripts and their tests. No application runtime, deployment, paid capability or provider-email configuration was changed.
