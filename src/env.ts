import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load `.env` files into `process.env` for each existing path, in order.
 * Earlier entries win — `process.loadEnvFile` is a no-op for keys that are
 * already set. Missing or unreadable files are silently skipped.
 *
 * Returns the subset of paths that were actually loaded — useful for tests
 * and for logging at startup.
 */
export function loadEnvFiles(paths: readonly string[]): string[] {
  const loaded: string[] = [];
  for (const p of paths) {
    try {
      process.loadEnvFile(p);
      loaded.push(p);
    } catch {
      // File missing or unreadable — fine, fall through to the next candidate.
    }
  }
  return loaded;
}

/**
 * Default candidate paths used by the CLI entry point: a `.env` colocated
 * with the source tree (one level up from `src/`). Exposed for the entry
 * point and for tests; replaceable in callers that want different lookup.
 */
export function defaultEnvCandidates(metaUrl: string): string[] {
  const here = dirname(fileURLToPath(metaUrl));
  return [join(here, '..', '.env')];
}
