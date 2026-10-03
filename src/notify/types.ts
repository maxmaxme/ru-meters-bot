import type { AccountInfo } from '../storage/types.ts';

export interface Notifier {
  success(input: {
    portal: string;
    period: string;
    meterCount: number;
    info: AccountInfo | null;
    alreadySubmitted: boolean;
  }): Promise<void>;
  failure(input: {
    portal: string;
    period: string;
    attempt: number;
    maxAttempts: number;
    error: string;
  }): Promise<void>;
  windowClosed(input: { portal: string; period: string }): Promise<void>;
  /** The portal can't take readings this period; no more attempts until next. */
  blocked(input: { portal: string; period: string; reason: string }): Promise<void>;
}
