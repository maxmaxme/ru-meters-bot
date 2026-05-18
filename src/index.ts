import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runOnce } from './runOnce.ts';
import { openSubmissionsStore } from './storage/sqlite.ts';
import { TelegramNotifier } from './notify/telegram.ts';
import { createLogger } from './logger.ts';
import { loadEnvFiles, defaultEnvCandidates, requireEnv } from './env.ts';
import { parseCliArgs, USAGE } from './cli.ts';
import { enabledPortals, selectRequestedPortals, portalDeps } from './portals/registry.ts';

const log = createLogger('index');

// Auto-load .env when running outside the container. In production the file
// is injected by docker-compose's `env_file`, so this is a no-op.
loadEnvFiles(defaultEnvCandidates(import.meta.url));

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const env = process.env;
  const dataDir = requireEnv(env, 'METERS_DATA_DIR', '/app/data');
  await mkdir(dataDir, { recursive: true });

  const store = openSubmissionsStore(join(dataDir, 'meters.sqlite'));
  const notifier = new TelegramNotifier({
    token: requireEnv(env, 'TELEGRAM_BOT_TOKEN'),
    chatId: requireEnv(env, 'TELEGRAM_CHAT_ID'),
  });

  const portals = selectRequestedPortals(enabledPortals(env), args.portal);

  try {
    await runOnce({
      store,
      notifier,
      portals,
      portalDepsFor: (name) => portalDeps(name, { env, store, now: () => new Date() }),
      now: new Date(),
      force: args.force,
    });
  } finally {
    store.close();
  }
}

main().catch((err) => {
  log.error({ err }, 'fatal');
  process.exit(1);
});
