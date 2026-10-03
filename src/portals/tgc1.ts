import type { AccountInfo, MeterReading } from '../storage/types.ts';
import type { Portal, PortalDeps } from './types.ts';
import { createLogger } from '../logger.ts';
import { formatBalanceText } from './balance.ts';

const log = createLogger('portal:tgc1');

const BASE = 'https://lk.tgc1.ru';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36';

const VERIFY_DELAY_MS = 1500;

interface DeviceDto {
  id: number;
  number: string;
  serviceName: string;
  lastReading: number;
  dtLastReading: string;
  /** DD.MM.YYYY. Once past, the portal stops taking readings for the meter. */
  dtNextVerification?: string;
  enabled: boolean;
  requiredVerification?: boolean;
  verificationWarning?: boolean;
  personalAccountNumber?: string;
}

interface DebtDto {
  accountList: string[];
  sm: number;
}

interface LoginDto {
  accessToken: string;
  type: 'Bearer';
  refreshToken: string;
}

interface ApiError {
  message?: string;
  details?: Array<{ field: string | null; errorMessage: string }>;
}

export interface Tgc1Options {
  fetch?: typeof fetch;
  verifyDelayMs?: number;
}

export class Tgc1Portal implements Portal {
  readonly name = 'tgc1' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly verifyDelayMs: number;

  constructor(opts: Tgc1Options = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.verifyDelayMs = opts.verifyDelayMs ?? VERIFY_DELAY_MS;
  }

  async run(deps: PortalDeps): Promise<{
    info: AccountInfo | null;
    values: MeterReading[];
    alreadySubmitted: boolean;
  }> {
    const token = await this.login(deps.login, deps.password);
    const info = await this.fetchAccountInfo(token);
    const devices = await this.fetchDevices(token);

    if (devices.length === 0) {
      throw new Error('No counters on the account');
    }

    const todayStr = todayDdMmYyyy(deps.today());
    const submitted: MeterReading[] = [];
    const newlyPosted: number[] = [];

    for (const d of devices) {
      // A portal value above our last submission means someone sent a real
      // reading by hand — fine, resubmit it. Only a drop below what we sent is
      // suspicious. Refusing on any difference would wedge the bot for good:
      // the cache only updates on a successful run.
      const cached = deps.lastSubmittedValueFor(d.number);
      if (cached !== null && cached - d.lastReading > 0.001) {
        throw new Error(
          `Cached prev (${String(cached)}) for meter ${d.number} is above portal (${String(d.lastReading)}) — refuse to submit`,
        );
      }
      if (cached !== null && d.lastReading - cached > 0.001) {
        log.warn(
          { meter: d.number, cached, portal: d.lastReading },
          'portal reading is above our last submission (manual submit?), proceeding',
        );
      }

      if (d.verificationWarning || d.requiredVerification) {
        log.warn(
          {
            meter: d.number,
            requiredVerification: d.requiredVerification,
            verificationWarning: d.verificationWarning,
            dtNextVerification: d.dtNextVerification,
          },
          'meter has verification warning, proceeding anyway',
        );
      }

      if (!d.enabled) {
        if (d.dtLastReading === todayStr) {
          log.info({ meter: d.number }, 'already submitted today, treating as success');
          submitted.push({ meter: d.number, kind: d.serviceName, value: d.lastReading });
          continue;
        }
        // The likeliest cause outside the submission window is an expired
        // поверка — name it, so the failure message says what to do.
        const overdue =
          d.dtNextVerification !== undefined &&
          isBeforeDdMmYyyy(d.dtNextVerification, todayStr);
        const hint = overdue ? `; verification overdue since ${d.dtNextVerification ?? ''}` : '';
        throw new Error(
          `Meter ${d.number} not accepting readings (enabled=false, dtLastReading=${d.dtLastReading}${hint})`,
        );
      }

      await this.createReading(token, d.id, d.lastReading);
      log.info({ meter: d.number, value: d.lastReading }, 'meter submitted');
      submitted.push({ meter: d.number, kind: d.serviceName, value: d.lastReading });
      newlyPosted.push(d.id);
    }

    if (newlyPosted.length > 0) {
      await sleep(this.verifyDelayMs);
      const after = await this.fetchDevices(token);
      for (const id of newlyPosted) {
        const a = after.find((x) => x.id === id);
        if (!a) {
          throw new Error(`Meter id=${String(id)} disappeared after submit`);
        }
        if (a.dtLastReading !== todayStr) {
          throw new Error(
            `Meter ${a.number}: dtLastReading after submit is ${a.dtLastReading}, expected ${todayStr}`,
          );
        }
      }
    }

    return { info, values: submitted, alreadySubmitted: newlyPosted.length === 0 };
  }

  private async login(username: string, password: string): Promise<string> {
    const body = await this.json<LoginDto>(
      'POST',
      '/api/security/auth/login/fl',
      undefined,
      { username, password },
      '/fl/login',
    );
    return body.accessToken;
  }

  /**
   * Best-effort: the balance only decorates the success message, so a failing
   * or odd debt endpoint must not stop the readings from being submitted.
   */
  private async fetchAccountInfo(token: string): Promise<AccountInfo | null> {
    let body: DebtDto;
    try {
      body = await this.json<DebtDto>('GET', '/api/fl/dashboard/debt', token, undefined, '/fl/');
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'failed to fetch debt, leaving info null');
      return null;
    }
    if (!Array.isArray(body.accountList) || body.accountList.length === 0) {
      return null;
    }
    const sm: unknown = body.sm;
    if (typeof sm !== 'number') {
      // A missing or string `sm` would otherwise compare false both ways and
      // read as 'расчёты без долга'.
      log.warn({ sm }, 'debt.sm is not a number');
    }
    const summary =
      typeof sm === 'number'
        ? { debt: Math.max(sm, 0), overpayment: Math.max(-sm, 0) }
        : { debt: 0, overpayment: 0, unrecognised: 1 };
    return { accountId: body.accountList.join(', '), balanceText: formatBalanceText(summary) };
  }

  private async fetchDevices(token: string): Promise<DeviceDto[]> {
    return this.json<DeviceDto[]>('GET', '/api/fl/device', token, undefined, '/fl/readings');
  }

  private async createReading(token: string, counterId: number, value: number): Promise<void> {
    await this.json<unknown>(
      'POST',
      '/api/fl/device/create-reading',
      token,
      { counterId, value },
      '/fl/readings',
    );
  }

  private async json<T>(
    method: 'GET' | 'POST',
    path: string,
    token: string | undefined,
    body: unknown,
    referer: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'user-agent': UA,
      accept: 'application/json',
      origin: BASE,
      referer: BASE + referer,
    };
    if (token !== undefined) {
      headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const res = await this.fetchImpl(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      const parsed = tryParseApiError(text);
      const detail = parsed?.details?.map((d) => `${d.field ?? '?'}=${d.errorMessage}`).join(', ');
      const msg = parsed?.message ?? text.slice(0, 200);
      const suffix = detail !== undefined && detail.length > 0 ? ` (${detail})` : '';
      throw new Error(`${method} ${path} → HTTP ${String(res.status)}: ${msg}${suffix}`);
    }

    if (text.length === 0) {
      return parseJson<T>('{}');
    }
    return parseJson<T>(text);
  }
}

function parseJson<T>(text: string): T {
  // JSON.parse returns `any`; the call-site type parameter narrows it.
  return JSON.parse(text);
}

function tryParseApiError(text: string): ApiError | undefined {
  try {
    return parseJson<ApiError>(text);
  } catch {
    return undefined;
  }
}

function todayDdMmYyyy(today: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(today);
}

/** `a < b` for DD.MM.YYYY dates; false if either does not parse. */
function isBeforeDdMmYyyy(a: string, b: string): boolean {
  const key = (s: string): string | null => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    return m ? `${m[3]}${m[2]}${m[1]}` : null;
  };
  const ka = key(a);
  const kb = key(b);
  return ka !== null && kb !== null && ka < kb;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
