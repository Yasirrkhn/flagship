import type { Flag } from '../../evaluate/src/types.js';

export function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    key: 'new-checkout',
    enabled: true,
    offValue: false,
    rules: [],
    fallthrough: { value: false },
    ...overrides,
  };
}

/** How the fake server should misbehave. `undefined` = behave normally. */
export type Failure =
  | number // answer with this HTTP status, e.g. 500 or 401
  | 'network' // fetch itself throws, like a dropped connection
  | 'bad-json' // 200, but the body isn't JSON
  | 'wrong-shape' // 200 and valid JSON, but not a snapshot
  | 'hang' // never answers; only an AbortSignal can end the request
  | undefined;

export interface RecordedRequest {
  url: string;
  ifNoneMatch: string | null;
  signal: AbortSignal | undefined;
}

/**
 * A pretend flag server that lives in memory. It plays the part of your real API:
 * GET /snapshot with an ETag, and 304 when the ETag matches. It records every
 * request so tests can check what the SDK sent.
 *
 * Responses are small hand-made objects instead of real `Response`s. That keeps the
 * fake clock simple (real Responses use streams and timers internally).
 */
export class FakeServer {
  version = 0;
  flags: Record<string, Flag> = {};
  failWith: Failure = undefined;
  requests: RecordedRequest[] = [];

  setFlag(flag: Flag): void {
    this.flags[flag.key] = structuredClone(flag);
    this.version++;
  }

  removeFlag(key: string): void {
    delete this.flags[key];
    this.version++;
  }

  /** Pass this as the SDK's `fetch` option. */
  fetch = (input: unknown, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal ?? undefined;
    const ifNoneMatch = new Headers(init?.headers as HeadersInit | undefined).get('if-none-match');
    this.requests.push({ url: String(input), ifNoneMatch, signal });

    const failure = this.failWith;
    if (failure === 'network') return Promise.reject(new TypeError('fetch failed'));
    if (failure === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (typeof failure === 'number') return Promise.resolve(reply(failure));
    if (failure === 'bad-json') return Promise.resolve(reply(200, undefined, '"x"', true));
    if (failure === 'wrong-shape') return Promise.resolve(reply(200, { hello: 'world' }, `"${this.version}"`));

    const etag = `"${this.version}"`;
    if (ifNoneMatch === etag) return Promise.resolve(reply(304, undefined, etag));
    return Promise.resolve(reply(200, { version: this.version, flags: this.flags }, etag));
  };
}

function reply(status: number, body?: unknown, etag?: string, brokenJson = false): Response {
  const fake = {
    status,
    // Like the real thing: `ok` is only true for 200-299, so it is FALSE for a 304.
    ok: status >= 200 && status < 300,
    headers: new Headers(etag === undefined ? {} : { ETag: etag }),
    json: async (): Promise<unknown> => {
      if (brokenJson) throw new SyntaxError('Unexpected token x in JSON');
      return structuredClone(body);
    },
    text: async (): Promise<string> => JSON.stringify(body ?? ''),
  };
  return fake as unknown as Response;
}
