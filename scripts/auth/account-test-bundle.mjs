import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const accountTestMigrations = [
  "db/auth/test-project/000-empty-core.sql",
  "db/auth/001-auth-only-containment.sql",
  "db/auth/002-account-identities-and-leads.sql",
  "db/auth/003-confirmed-email-sync.sql",
  "db/auth/004-owned-records.sql",
  "db/auth/005-private-assets.sql",
  "db/auth/006-account-request-limits.sql",
  "db/auth/007-resumable-onboarding.sql",
];

export async function createAccountTestBundle() {
  const sections = [];
  for (const name of accountTestMigrations) {
    const sql = await readFile(resolve(root, name), "utf8");
    // Flatten only the exact top-level transaction lines, preserving function bodies.
    const begin = [...sql.matchAll(/^begin;\s*$/gim)];
    const commit = [...sql.matchAll(/^commit;\s*$/gim)];
    if (begin.length !== 1 || commit.length !== 1 || begin[0].index >= commit[0].index) {
      throw new Error(`Review transaction structure before bundling: ${name}`);
    }
    sections.push(`-- Source: ${name}\n${sql.replace(/^begin;\s*$/gim, "").replace(/^commit;\s*$/gim, "").trim()}`);
  }
  const verification = await readFile(resolve(root, "db/auth/test-project/verify-account-setup.sql"), "utf8");
  return "-- Generated: EMPTY isolated Supabase test project only.\n" +
    "-- No real accounts, paid catalog, provider jobs or legacy editor activation.\n" +
    "-- A failure rolls back this entire bundle; do not run against existing data.\n" +
    "begin;\n" + sections.join("\n\n") + "\n\n" + verification + "\ncommit;\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(root, "scratch", "account-test-setup.sql");
  await mkdir(resolve(root, "scratch"), { recursive: true });
  await writeFile(output, await createAccountTestBundle());
  console.log(`Prepared SQL: ${output}`);
  console.log("No SQL was executed. Use only an empty isolated test project; see the local account test guide.");
}
