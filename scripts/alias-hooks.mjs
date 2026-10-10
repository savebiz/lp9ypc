// Node module-resolution hook for the local AI helper: maps the app's "@/…"
// import alias (tsconfig paths) to files under src/, so server modules can be
// reused outside Next. Resolves only to files inside this repo's src/ folder.
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.resolve(SRC, specifier.slice(2));
    if (base.startsWith(SRC + path.sep)) {
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (isFile(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
