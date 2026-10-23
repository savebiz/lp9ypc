/**
 * LP9 YPC database backup. VICTOR runs this himself: exporting member data
 * is his decision and is never automated. See docs/backups.md.
 *
 *   npm run db:backup -- "E:\LP9 backups"
 *
 * Exports every LP9 table (public schema) to ONE dated JSON file in the
 * folder you name. The folder must already exist and must NOT be inside
 * OneDrive (it syncs to the cloud) or inside this project.
 *
 * Needs .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Values are never printed. Only table names and row counts are printed.
 * Nothing is written unless every table was read successfully.
 */
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = 1000;
const MAX_PAGES = 500; // 500,000 rows per table: far beyond LP9's size; stops a runaway loop

/**
 * Every LP9 table, in an order that is safe to restore (parents before
 * children), with the columns used to page through it in a stable order.
 * Replies are ordered by created_at so a parent reply always comes first.
 */
export const TABLES: { name: string; order: string[] }[] = [
  { name: "career_paths", order: ["id"] },
  { name: "profiles", order: ["id"] },
  { name: "job_sources", order: ["id"] },
  { name: "jobs", order: ["id"] },
  { name: "member_career_paths", order: ["id"] },
  { name: "saved_jobs", order: ["id"] },
  { name: "announcements", order: ["id"] },
  { name: "profession_research", order: ["id"] },
  { name: "career_path_suggestions", order: ["id"] },
  { name: "career_path_candidates", order: ["id"] },
  { name: "communities", order: ["id"] },
  { name: "community_members", order: ["community_id", "member_id"] },
  { name: "threads", order: ["created_at", "id"] },
  { name: "replies", order: ["created_at", "id"] },
  { name: "post_likes", order: ["member_id", "target_type", "target_id"] },
  { name: "reports", order: ["id"] },
  { name: "moderation_log", order: ["id"] },
  { name: "agent_runs", order: ["id"] },
  { name: "admin_audit", order: ["id"] },
  { name: "feedback", order: ["id"] },
  { name: "link_health", order: ["job_id"] },
];

/** Minimal .env parser (no dependency). Never prints values; never overrides variables already set. */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function norm(p: string, platform: NodeJS.Platform): string {
  const r = path.resolve(p);
  return platform === "win32" ? r.toLowerCase() : r;
}

function isInside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  const c = norm(child, platform);
  const p = norm(parent, platform).replace(/[\\/]+$/, "");
  return c === p || c.startsWith(p + path.sep);
}

/**
 * Why this folder can't hold a backup, or null if it can. Pure (tested
 * with explicit env/platform). Refuses OneDrive (by the OneDrive env
 * variables Windows sets, or any folder named "OneDrive…") and this project.
 */
export function refuseReason(
  dir: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  projectRoot: string = ROOT,
): string | null {
  const oneDriveRoots = [env.OneDrive, env.OneDriveCommercial, env.OneDriveConsumer].filter((v): v is string => !!v && v.trim() !== "");
  const inOneDrive =
    oneDriveRoots.some((root) => isInside(dir, root, platform)) ||
    path.resolve(dir).split(/[\\/]+/).some((part) => /^onedrive\b/i.test(part));
  if (inOneDrive) {
    return "That folder is inside OneDrive, which copies files to the cloud. Choose a folder on an encrypted drive instead (see docs/backups.md).";
  }
  if (isInside(dir, projectRoot, platform)) {
    return "That folder is inside the project, where a backup could be shared by mistake. Choose a folder on an encrypted drive instead.";
  }
  return null;
}

/** e.g. 2026-10-23-1530 in Lagos time. */
function stamp(d = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

function line(text = ""): void {
  console.log(text);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === "--help" || args[0] === "-h") {
    line('Usage: npm run db:backup -- "<folder on an encrypted drive>"');
    line("Saves one dated JSON file with every LP9 table. See docs/backups.md.");
    return args.length === 1 ? 0 : 2;
  }

  // 1. Where to save. Check both the path as typed and its real location
  //    (a shortcut/junction could point into OneDrive).
  const dir = path.resolve(args[0]);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    line("That folder doesn't exist. Create it first (on your encrypted drive), then run this again.");
    return 1;
  }
  const refused = refuseReason(dir) ?? refuseReason(realpathSync(dir));
  if (refused) {
    line(refused);
    return 1;
  }

  // 2. Supabase (service role: reads every row; values never printed).
  loadEnvFile(path.join(ROOT, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    line("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    return 1;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  // 3. Read everything first; write nothing if any table fails.
  line("LP9 YPC backup: reading tables…");
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number | "not in database"> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    let missing = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = admin.from(t.name).select("*");
      for (const col of t.order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) {
        if (page === 0 && isMissingTable(error)) {
          missing = true;
          break;
        }
        line(`Couldn't read ${t.name} (error ${error.code ?? "unknown"}). Nothing was saved. Check your connection and try again.`);
        return 1;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
      if (page === MAX_PAGES - 1) {
        line(`${t.name} has more rows than this script expects. Nothing was saved; tell the tech team.`);
        return 1;
      }
    }
    if (missing) {
      counts[t.name] = "not in database";
    } else {
      tables[t.name] = rows;
      counts[t.name] = rows.length;
    }
  }

  // 4. One dated file; never overwrite an existing one.
  const created = new Date();
  let projectRef = "";
  try {
    projectRef = new URL(url).hostname.split(".")[0];
  } catch {
    projectRef = "";
  }
  const file = path.join(dir, `lp9ypc-backup-${stamp(created)}.json`);
  const backup = {
    format: "lp9ypc-backup",
    version: 1,
    created_at: created.toISOString(),
    project_ref: projectRef,
    note: "Contains members' personal data. Keep on an encrypted drive; never email, share or upload it.",
    table_order: TABLES.map((t) => t.name),
    counts,
    tables,
  };
  try {
    writeFileSync(file, JSON.stringify(backup, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    line(code === "EEXIST" ? "A backup with this name already exists. Wait a minute and run it again." : `Couldn't save the file (${code ?? "unknown error"}).`);
    return 1;
  }

  // 5. Counts only.
  line("");
  const width = Math.max(...TABLES.map((t) => t.name.length));
  let total = 0;
  for (const t of TABLES) {
    const c = counts[t.name];
    if (typeof c === "number") total += c;
    line(`  ${t.name.padEnd(width)}  ${typeof c === "number" ? c : "(not in database yet)"}`);
  }
  line("");
  line(`Saved ${total} rows to ${file}`);
  line("This file holds members' personal data. Keep it on your encrypted drive and don't share it.");
  return 0;
}

// Run only when executed directly (importing for tests must not run a backup).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e: unknown) => {
      console.error(`The backup stopped unexpectedly: ${e instanceof Error ? e.name : "unknown error"}. Nothing was saved.`);
      process.exitCode = 1;
    });
}
