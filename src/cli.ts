import { parseArgs } from 'node:util';

export interface CliArgs {
  portal: string | undefined;
  force: boolean;
  help: boolean;
}

export const USAGE = `Usage: node src/index.ts [--portal=tgc1|pesc] [--force]

Options:
  --portal=NAME   Drive only the named portal. If omitted, every portal with
                  a configured *_LOGIN env is driven in order.
  --force         Ignore the targetDay gate and the done/blocked row status.
                  Still respects the per-period attempts cap.
`;

/**
 * Parses CLI arguments. `argv` is the user-supplied slice
 * (i.e. `process.argv.slice(2)`), not the full argv.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      portal: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return {
    portal: values.portal,
    force: values.force ?? false,
    help: values.help ?? false,
  };
}
