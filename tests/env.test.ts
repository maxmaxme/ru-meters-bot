import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFiles, defaultEnvCandidates } from '../src/env.ts';

describe('loadEnvFiles', () => {
  let dir: string;
  const sentinelKeys = [
    'METERS_TEST_KEY_A',
    'METERS_TEST_KEY_B',
    'METERS_TEST_KEY_C',
    'METERS_TEST_KEY_PREEXISTING',
  ];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'meters-env-'));
    for (const k of sentinelKeys) delete process.env[k];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const k of sentinelKeys) delete process.env[k];
  });

  it('loads variables from an existing .env file', () => {
    const path = join(dir, '.env');
    writeFileSync(path, 'METERS_TEST_KEY_A=hello\nMETERS_TEST_KEY_B=world\n');

    const loaded = loadEnvFiles([path]);

    expect(loaded).toEqual([path]);
    expect(process.env.METERS_TEST_KEY_A).toBe('hello');
    expect(process.env.METERS_TEST_KEY_B).toBe('world');
  });

  it('silently skips missing files', () => {
    const missing = join(dir, 'does-not-exist.env');

    const loaded = loadEnvFiles([missing]);

    expect(loaded).toEqual([]);
  });

  it('skips missing files and still loads existing ones', () => {
    const missing = join(dir, 'missing.env');
    const present = join(dir, '.env');
    writeFileSync(present, 'METERS_TEST_KEY_A=ok\n');

    const loaded = loadEnvFiles([missing, present]);

    expect(loaded).toEqual([present]);
    expect(process.env.METERS_TEST_KEY_A).toBe('ok');
  });

  it('earlier candidates win over later ones (process.loadEnvFile semantics)', () => {
    const first = join(dir, 'first.env');
    const second = join(dir, 'second.env');
    writeFileSync(first, 'METERS_TEST_KEY_A=from-first\n');
    writeFileSync(second, 'METERS_TEST_KEY_A=from-second\nMETERS_TEST_KEY_B=only-in-second\n');

    loadEnvFiles([first, second]);

    expect(process.env.METERS_TEST_KEY_A).toBe('from-first');
    expect(process.env.METERS_TEST_KEY_B).toBe('only-in-second');
  });

  it('does not override variables that are already set in process.env', () => {
    process.env.METERS_TEST_KEY_PREEXISTING = 'from-shell';
    const path = join(dir, '.env');
    writeFileSync(path, 'METERS_TEST_KEY_PREEXISTING=from-file\n');

    loadEnvFiles([path]);

    expect(process.env.METERS_TEST_KEY_PREEXISTING).toBe('from-shell');
  });

  it('returns an empty list for an empty candidate array', () => {
    expect(loadEnvFiles([])).toEqual([]);
  });
});

describe('defaultEnvCandidates', () => {
  it('resolves to <src dir>/../.env relative to the importing module', () => {
    // Simulate src/index.ts asking for candidates: its dir is `<repo>/src/`,
    // so the resolved candidate should be `<repo>/.env`.
    const fakeSrcUrl = 'file:///fake/repo/src/index.ts';

    const [candidate] = defaultEnvCandidates(fakeSrcUrl);

    expect(candidate).toBe('/fake/repo/.env');
  });

  it('returns exactly one candidate (no surprise lookups outside the repo)', () => {
    expect(defaultEnvCandidates('file:///fake/repo/src/index.ts')).toHaveLength(1);
  });
});
