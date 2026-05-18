import { requireEnv, type Env } from '../env.ts';
import { Tgc1Portal } from './tgc1.ts';
import { PescPortal } from './pesc.ts';
import type { Portal, PortalDeps } from './types.ts';
import type { SubmissionsStore } from '../storage/types.ts';

export type PortalName = Portal['name'];

/**
 * Build the list of portals that are enabled by env configuration. A portal
 * is "enabled" when its `*_LOGIN` env var is set to a non-empty string.
 * Order is stable (`tgc1` before `pesc`).
 */
export function enabledPortals(env: Env): Portal[] {
  const portals: Portal[] = [];
  if (isSet(env.TGC1_LOGIN)) {
    portals.push(new Tgc1Portal());
  }
  if (isSet(env.PESC_LOGIN)) {
    portals.push(
      new PescPortal({
        totpSecret: env.PESC_TOTP_SECRET,
        proxyUrl: env.PESC_PROXY_URL,
      }),
    );
  }
  return portals;
}

/**
 * Filter a portal list by the `--portal=NAME` CLI argument. With no
 * requested name, returns the full list. Throws when the requested portal
 * is unknown or not enabled, or when the list is empty.
 */
export function selectRequestedPortals(all: readonly Portal[], requested: string | undefined): Portal[] {
  if (requested === undefined) {
    if (all.length === 0) {
      throw new Error('No portals enabled — set TGC1_LOGIN and/or PESC_LOGIN');
    }
    return [...all];
  }
  const filtered = all.filter((p) => p.name === requested);
  if (filtered.length === 0) {
    throw new Error(`Portal not enabled or unknown: ${requested}`);
  }
  return filtered;
}

export interface PortalDepsOptions {
  env: Env;
  store: Pick<SubmissionsStore, 'lastSubmittedValueFor'>;
  now: () => Date;
}

/**
 * Resolve the per-portal `PortalDeps` from env + storage. Accepts a plain
 * string (that's what `runOnce` forwards from each `Portal.name`) and
 * throws if it doesn't match a known portal.
 */
export function portalDeps(name: string, opts: PortalDepsOptions): PortalDeps {
  const { env, store, now } = opts;
  if (name === 'tgc1') {
    return {
      login: requireEnv(env, 'TGC1_LOGIN'),
      password: requireEnv(env, 'TGC1_PASSWORD'),
      lastSubmittedValueFor: (meter) => store.lastSubmittedValueFor('tgc1', meter),
      today: now,
    };
  }
  if (name === 'pesc') {
    return {
      login: requireEnv(env, 'PESC_LOGIN'),
      password: requireEnv(env, 'PESC_PASSWORD'),
      lastSubmittedValueFor: (meter) => store.lastSubmittedValueFor('pesc', meter),
      today: now,
    };
  }
  throw new Error(`No deps configured for portal: ${name}`);
}

function isSet(v: string | undefined): boolean {
  return v !== undefined && v !== '';
}
