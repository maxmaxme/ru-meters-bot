import { describe, it, expect, vi } from 'vitest';
import {
  enabledPortals,
  selectRequestedPortals,
  portalDeps,
} from '../src/portals/registry.ts';
import type { Portal } from '../src/portals/types.ts';

function fakePortal(name: 'tgc1' | 'pesc'): Portal {
  return { name, run: vi.fn() };
}

describe('enabledPortals', () => {
  it('returns an empty list when no *_LOGIN is set', () => {
    expect(enabledPortals({})).toEqual([]);
  });

  it('treats empty-string login as disabled', () => {
    expect(enabledPortals({ TGC1_LOGIN: '', PESC_LOGIN: '' })).toEqual([]);
  });

  it('enables tgc1 when TGC1_LOGIN is set', () => {
    const portals = enabledPortals({ TGC1_LOGIN: 'user' });
    expect(portals.map((p) => p.name)).toEqual(['tgc1']);
  });

  it('enables pesc when PESC_LOGIN is set', () => {
    const portals = enabledPortals({ PESC_LOGIN: 'user' });
    expect(portals.map((p) => p.name)).toEqual(['pesc']);
  });

  it('enables both with a stable order (tgc1 first)', () => {
    const portals = enabledPortals({ TGC1_LOGIN: 'a', PESC_LOGIN: 'b' });
    expect(portals.map((p) => p.name)).toEqual(['tgc1', 'pesc']);
  });

  it('does not require PESC_TOTP_SECRET / PESC_PROXY_URL to be set', () => {
    expect(() => enabledPortals({ PESC_LOGIN: 'u' })).not.toThrow();
  });
});

describe('selectRequestedPortals', () => {
  const tgc1 = fakePortal('tgc1');
  const pesc = fakePortal('pesc');

  it('returns the full list when no portal is requested', () => {
    expect(selectRequestedPortals([tgc1, pesc], undefined)).toEqual([tgc1, pesc]);
  });

  it('returns a fresh copy (caller may not see mutations on the source)', () => {
    const source = [tgc1, pesc];
    const result = selectRequestedPortals(source, undefined);
    expect(result).not.toBe(source);
  });

  it('filters to the requested portal', () => {
    expect(selectRequestedPortals([tgc1, pesc], 'pesc')).toEqual([pesc]);
  });

  it('throws when the requested portal is unknown', () => {
    expect(() => selectRequestedPortals([tgc1, pesc], 'unknown')).toThrow(
      /Portal not enabled or unknown: unknown/,
    );
  });

  it('throws when the requested portal is known but not in the enabled list', () => {
    expect(() => selectRequestedPortals([tgc1], 'pesc')).toThrow(
      /Portal not enabled or unknown: pesc/,
    );
  });

  it('throws when no portal is requested and the list is empty', () => {
    expect(() => selectRequestedPortals([], undefined)).toThrow(
      /No portals enabled — set TGC1_LOGIN and\/or PESC_LOGIN/,
    );
  });
});

describe('portalDeps', () => {
  const now = () => new Date('2026-05-18T12:00:00Z');
  const store = { lastSubmittedValueFor: vi.fn().mockReturnValue(null) };

  it('resolves tgc1 credentials and wires lastSubmittedValueFor to "tgc1"', () => {
    const deps = portalDeps('tgc1', {
      env: { TGC1_LOGIN: 'login-1', TGC1_PASSWORD: 'pw-1' },
      store,
      now,
    });

    expect(deps.login).toBe('login-1');
    expect(deps.password).toBe('pw-1');
    expect(deps.today()).toEqual(now());

    deps.lastSubmittedValueFor('meter-A');
    expect(store.lastSubmittedValueFor).toHaveBeenCalledWith('tgc1', 'meter-A');
  });

  it('resolves pesc credentials and wires lastSubmittedValueFor to "pesc"', () => {
    const deps = portalDeps('pesc', {
      env: { PESC_LOGIN: 'login-2', PESC_PASSWORD: 'pw-2' },
      store,
      now,
    });

    expect(deps.login).toBe('login-2');
    expect(deps.password).toBe('pw-2');

    deps.lastSubmittedValueFor('meter-B');
    expect(store.lastSubmittedValueFor).toHaveBeenCalledWith('pesc', 'meter-B');
  });

  it('throws a descriptive error when required credentials are missing', () => {
    expect(() => portalDeps('tgc1', { env: {}, store, now })).toThrow(
      /Missing required env var: TGC1_LOGIN/,
    );
    expect(() => portalDeps('tgc1', { env: { TGC1_LOGIN: 'u' }, store, now })).toThrow(
      /Missing required env var: TGC1_PASSWORD/,
    );
  });

  it('throws when asked for an unknown portal name', () => {
    expect(() => portalDeps('unknown', { env: {}, store, now })).toThrow(
      /No deps configured for portal: unknown/,
    );
  });
});
