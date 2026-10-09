// Entry point so `node --test tests/agents` works: Node treats a directory
// argument as a script to run, so this file loads every *.test.ts beside it.
// (`node --test "tests/agents/*.test.ts"` also works and runs them one per process.)
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of readdirSync(here).filter((name) => name.endsWith(".test.ts")).sort()) {
  await import(pathToFileURL(join(here, file)).href);
}
