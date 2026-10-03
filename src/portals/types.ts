import type { AccountInfo, MeterReading } from '../storage/types.ts';

export interface PortalDeps {
  login: string;
  password: string;
  lastSubmittedValueFor(meter: string): number | null;
  today(): Date;
}

/**
 * Thrown by a portal when readings cannot be accepted this period for a
 * reason retrying won't fix (e.g. an expired поверка). runOnce marks the
 * period blocked and notifies once instead of burning the retry budget.
 * The message is user-facing (Telegram).
 */
export class PortalBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalBlockedError';
  }
}

export interface Portal {
  readonly name: 'tgc1' | 'pesc';
  /**
   * Logs in, fetches account balance and the device list, submits readings
   * for every counter where it's accepted, verifies that `dtLastReading`
   * advanced to today, and returns both the account info and the list of
   * readings actually submitted. Throws on any unrecoverable failure;
   * partial success also throws.
   */
  run(deps: PortalDeps): Promise<{
    info: AccountInfo | null;
    values: MeterReading[];
    /** True when no new reading was POSTed — every counter was already submitted earlier today. */
    alreadySubmitted: boolean;
  }>;
}
