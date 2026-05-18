import { describe, it, expect } from 'vitest';
import { parseCliArgs, USAGE } from '../src/cli.ts';

describe('parseCliArgs', () => {
  it('returns defaults for an empty argv', () => {
    expect(parseCliArgs([])).toEqual({
      portal: undefined,
      force: false,
      help: false,
    });
  });

  it('parses --portal=tgc1', () => {
    expect(parseCliArgs(['--portal=tgc1'])).toMatchObject({ portal: 'tgc1' });
  });

  it('parses --portal pesc (space form)', () => {
    expect(parseCliArgs(['--portal', 'pesc'])).toMatchObject({ portal: 'pesc' });
  });

  it('parses --force as boolean true', () => {
    expect(parseCliArgs(['--force'])).toMatchObject({ force: true });
  });

  it('parses --help and short -h equivalently', () => {
    expect(parseCliArgs(['--help'])).toMatchObject({ help: true });
    expect(parseCliArgs(['-h'])).toMatchObject({ help: true });
  });

  it('combines multiple flags', () => {
    expect(parseCliArgs(['--portal=pesc', '--force'])).toEqual({
      portal: 'pesc',
      force: true,
      help: false,
    });
  });

  it('does not mutate the input argv array', () => {
    const argv = ['--force'];
    parseCliArgs(argv);
    expect(argv).toEqual(['--force']);
  });
});

describe('USAGE', () => {
  it('mentions both supported portals', () => {
    expect(USAGE).toMatch(/tgc1/);
    expect(USAGE).toMatch(/pesc/);
  });

  it('documents --force', () => {
    expect(USAGE).toMatch(/--force/);
  });
});
