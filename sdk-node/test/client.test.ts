import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlagshipClient } from '../src/index.js';
import type { FlagshipOptions } from '../src/index.js';
import { FakeServer, makeFlag } from './helpers.js';

/*
 * How these tests work (read this once):
 *
 *  - FakeServer (test/helpers.ts) pretends to be your API. The SDK talks to it through
 *    the `fetch` option, so no real network is involved.
 *
 *  - Time is FAKE. vi.useFakeTimers() replaces setTimeout, so nothing waits for real.
 *    `await tick(1000)` means "pretend 1000ms passed, and run whatever timers are due".
 *    A test that says tick(999) then tick(1) is checking that something happens at
 *    exactly 1000ms, not before.
 *
 *  - The default test setup: pollIntervalMs 1000, maxBackoffMs 5000, and random()
 *    always returns 1 (so jitter does nothing unless a test changes it).
 */

const URL = 'http://flags.test';
const user = { id: 'u1' };

let server: FakeServer;
let client: FlagshipClient | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
  client = undefined;
});

afterEach(() => {
  try {
    client?.close();
  } catch {
    // close() may not be written yet; that shows up in its own tests
  }
  vi.useRealTimers();
});

function make(overrides: Partial<FlagshipOptions> = {}): FlagshipClient {
  client = new FlagshipClient({
    url: URL,
    pollIntervalMs: 1000,
    maxBackoffMs: 5000,
    fetch: server.fetch,
    random: () => 1,
    ...overrides,
  });
  return client;
}

/** Move the fake clock forward and let any due timers (and their async work) run. */
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('step 1: load once, answer locally', () => {
  it('answers with the default before start() is called', () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    expect(c.get('a', user, 'fallback')).toBe('fallback');
    expect(c.isOn('a', user)).toBe(false);
    expect(server.requests).toHaveLength(0);
  });

  it('downloads GET <url>/snapshot on start()', async () => {
    const c = make();
    await c.start();
    expect(server.requests.map((request) => request.url)).toEqual(['http://flags.test/snapshot']);
  });

  it('copes with a trailing slash in the url', async () => {
    const c = make({ url: 'http://flags.test/' });
    await c.start();
    expect(server.requests[0]?.url).toBe('http://flags.test/snapshot');
  });

  it('evaluates flags locally using the evaluator', async () => {
    server.setFlag(
      makeFlag({
        key: 'checkout',
        fallthrough: { value: false },
        rules: [{ attribute: 'plan', operator: 'equals', value: 'pro', serve: { value: true } }],
      }),
    );
    const c = make();
    await c.start();
    expect(c.get('checkout', { id: 'u1', attributes: { plan: 'pro' } }, false)).toBe(true);
    expect(c.get('checkout', { id: 'u2', attributes: { plan: 'free' } }, true)).toBe(false);
  });

  it('never touches the network to answer a question', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    await c.start();
    for (let i = 0; i < 1000; i++) c.get('a', { id: `user-${i}` }, false);
    expect(server.requests).toHaveLength(1);
  });

  it('respects the kill switch', async () => {
    server.setFlag(makeFlag({ key: 'a', enabled: false, offValue: 'safe', fallthrough: { value: 'new' } }));
    const c = make();
    await c.start();
    expect(c.get('a', user, 'default')).toBe('safe');
  });

  it('returns the default for a flag that does not exist', async () => {
    server.setFlag(makeFlag({ key: 'a' }));
    const c = make();
    await c.start();
    expect(c.get('nope', user, 'fallback')).toBe('fallback');
    expect(c.get('constructor', user, 'fallback')).toBe('fallback');
  });

  it('isOn is true only when the value is exactly true', async () => {
    server.setFlag(makeFlag({ key: 'on', fallthrough: { value: true } }));
    server.setFlag(makeFlag({ key: 'off', fallthrough: { value: false } }));
    server.setFlag(makeFlag({ key: 'text', fallthrough: { value: 'yes' } }));
    const c = make();
    await c.start();
    expect(c.isOn('on', user)).toBe(true);
    expect(c.isOn('off', user)).toBe(false);
    expect(c.isOn('text', user)).toBe(false);
    expect(c.isOn('missing', user)).toBe(false);
  });

  it('start() twice (even at once) downloads only once', async () => {
    const c = make();
    await Promise.all([c.start(), c.start()]);
    await c.start();
    expect(server.requests).toHaveLength(1);
    await tick(1000);
    expect(server.requests).toHaveLength(2); // one polling loop, not two
  });
});

describe('step 2: keeping fresh by polling', () => {
  it('asks again after every pollIntervalMs', async () => {
    const c = make();
    await c.start();
    expect(server.requests).toHaveLength(1);
    await tick(999);
    expect(server.requests).toHaveLength(1);
    await tick(1);
    expect(server.requests).toHaveLength(2);
    await tick(1000);
    expect(server.requests).toHaveLength(3);
  });

  it('picks up a change made on the server', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: false } }));
    const c = make();
    await c.start();
    expect(c.get('a', user, 'x')).toBe(false);

    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    expect(c.get('a', user, 'x')).toBe(false); // not instant: it only learns at the next poll
    await tick(1000);
    expect(c.get('a', user, 'x')).toBe(true);
  });

  it('picks up new flags and deleted flags', async () => {
    server.setFlag(makeFlag({ key: 'old', fallthrough: { value: true } }));
    const c = make();
    await c.start();

    server.setFlag(makeFlag({ key: 'fresh', fallthrough: { value: true } }));
    server.removeFlag('old');
    await tick(1000);
    expect(c.get('fresh', user, 'default')).toBe(true);
    expect(c.get('old', user, 'default')).toBe('default');
  });

  it('sends the last ETag as If-None-Match', async () => {
    server.setFlag(makeFlag({ key: 'a' })); // server version is now 1, so the ETag is "1"
    const c = make();
    await c.start();
    await tick(1000);
    expect(server.requests[0]?.ifNoneMatch).toBeNull();
    expect(server.requests[1]?.ifNoneMatch).toBe('"1"');
  });

  it('keeps answering after a 304, and a 304 is not an error', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const onError = vi.fn();
    const c = make({ onError });
    await c.start();
    await tick(1000); // the server answers 304 here
    expect(server.requests).toHaveLength(2);
    expect(c.get('a', user, false)).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('treats 304 as a success: the next poll is one normal interval away (no backoff)', async () => {
    server.setFlag(makeFlag({ key: 'a' }));
    const c = make();
    await c.start();
    await tick(1000); // request 2 gets a 304
    expect(server.requests).toHaveLength(2);
    await tick(999);
    expect(server.requests).toHaveLength(2);
    await tick(1);
    expect(server.requests).toHaveLength(3);
  });

  it('switches to the NEW ETag after a change', async () => {
    server.setFlag(makeFlag({ key: 'a' })); // version 1
    const c = make();
    await c.start();
    server.setFlag(makeFlag({ key: 'a', enabled: false })); // version 2
    await tick(1000); // 200 with the new data and ETag "2"
    await tick(1000);
    expect(server.requests[1]?.ifNoneMatch).toBe('"1"');
    expect(server.requests[2]?.ifNoneMatch).toBe('"2"');
  });
});

describe('step 3: surviving a broken server', () => {
  it('start() still resolves when the server is down, and answers with defaults', async () => {
    server.failWith = 'network';
    const c = make();
    await expect(c.start()).resolves.toBeUndefined();
    expect(c.get('a', user, 'fallback')).toBe('fallback');
  });

  it.each([500, 503, 401, 404])('keeps serving the last good snapshot when the server answers HTTP %i', async (status) => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    await c.start();
    server.failWith = status;
    await tick(1000);
    expect(server.requests).toHaveLength(2); // it did try
    expect(c.get('a', user, false)).toBe(true);
  });

  it('keeps serving the last good snapshot on a network error', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    await c.start();
    server.failWith = 'network';
    await tick(1000);
    expect(server.requests).toHaveLength(2);
    expect(c.get('a', user, false)).toBe(true);
  });

  it('keeps serving the last good snapshot when the body is not JSON', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    await c.start();
    server.failWith = 'bad-json';
    await tick(1000);
    expect(server.requests).toHaveLength(2);
    expect(c.get('a', user, false)).toBe(true);
  });

  it('keeps serving the last good snapshot when the JSON has the wrong shape', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    await c.start();
    server.failWith = 'wrong-shape';
    await tick(1000);
    expect(server.requests).toHaveLength(2);
    expect(c.get('a', user, false)).toBe(true);
  });

  it('recovers by itself when the server comes back', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: false } }));
    const c = make();
    await c.start();

    server.failWith = 500;
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } })); // changed while it was down
    await tick(1000); // fails; the next attempt is 2000ms away
    expect(c.get('a', user, 'x')).toBe(false);

    server.failWith = undefined;
    await tick(2000);
    expect(c.get('a', user, 'x')).toBe(true);
  });

  it('works when the server is down at startup and appears later', async () => {
    server.failWith = 'network';
    const c = make();
    await c.start();

    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    server.failWith = undefined;
    await tick(2000);
    expect(c.get('a', user, false)).toBe(true);
  });
});

describe('step 4: backing off while failing', () => {
  it('waits longer after each failure in a row, up to maxBackoffMs', async () => {
    server.failWith = 500;
    const c = make(); // pollInterval 1000, cap 5000, no jitter
    await c.start();
    expect(server.requests).toHaveLength(1);

    // failure 1 -> wait min(5000, 1000 * 2^1) = 2000
    await tick(1999);
    expect(server.requests).toHaveLength(1);
    await tick(1);
    expect(server.requests).toHaveLength(2);

    // failure 2 -> wait min(5000, 1000 * 2^2) = 4000
    await tick(3999);
    expect(server.requests).toHaveLength(2);
    await tick(1);
    expect(server.requests).toHaveLength(3);

    // failure 3 -> wait min(5000, 1000 * 2^3) = 5000 (capped)
    await tick(4999);
    expect(server.requests).toHaveLength(3);
    await tick(1);
    expect(server.requests).toHaveLength(4);

    // failure 4 -> still capped at 5000
    await tick(4999);
    expect(server.requests).toHaveLength(4);
    await tick(1);
    expect(server.requests).toHaveLength(5);
  });

  it('applies jitter: the wait is multiplied by random()', async () => {
    server.failWith = 500;
    const c = make({ random: () => 0.5 });
    await c.start();

    // failure 1: 2000 * 0.5 = 1000
    await tick(999);
    expect(server.requests).toHaveLength(1);
    await tick(1);
    expect(server.requests).toHaveLength(2);

    // failure 2: 4000 * 0.5 = 2000
    await tick(1999);
    expect(server.requests).toHaveLength(2);
    await tick(1);
    expect(server.requests).toHaveLength(3);
  });

  it('returns to the normal interval after one success', async () => {
    server.failWith = 500;
    const c = make();
    await c.start(); // failure 1
    await tick(2000); // request 2 fails (failure 2); next wait is 4000
    expect(server.requests).toHaveLength(2);

    server.failWith = undefined;
    await tick(4000); // request 3 succeeds
    expect(server.requests).toHaveLength(3);

    await tick(999);
    expect(server.requests).toHaveLength(3);
    await tick(1);
    expect(server.requests).toHaveLength(4); // back to one interval
  });

  it('starts the backoff from scratch for each new outage', async () => {
    server.setFlag(makeFlag({ key: 'a' }));
    const c = make();
    await c.start(); // success

    server.failWith = 500;
    await tick(1000); // request 2 fails (failure 1); next wait is 2000
    server.failWith = undefined;
    await tick(2000); // request 3 succeeds, failures reset
    expect(server.requests).toHaveLength(3);

    server.failWith = 500;
    await tick(1000); // request 4 fails: this is failure 1 again, so the wait is 2000 again
    expect(server.requests).toHaveLength(4);
    await tick(1999);
    expect(server.requests).toHaveLength(4);
    await tick(1);
    expect(server.requests).toHaveLength(5);
  });
});

describe('step 5: shutting down cleanly', () => {
  it('close() stops polling', async () => {
    const c = make();
    await c.start();
    c.close();
    await tick(60_000);
    expect(server.requests).toHaveLength(1);
  });

  it('close() cancels a request that is still in flight', async () => {
    server.failWith = 'hang';
    const c = make();
    const started = c.start();
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.signal?.aborted).toBe(false);

    c.close();
    await started; // it must finish, not hang forever
    expect(server.requests[0]?.signal?.aborted).toBe(true);
  });

  it('does not report the abort it caused itself as an error', async () => {
    server.failWith = 'hang';
    const onError = vi.fn();
    const c = make({ onError });
    const started = c.start();
    c.close();
    await started;
    expect(onError).not.toHaveBeenCalled();
  });

  it('leaves no timers running', async () => {
    const c = make();
    await c.start();
    c.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timers running, even after cancelling an in-flight request', async () => {
    server.failWith = 'hang';
    const c = make();
    const started = c.start();
    c.close();
    await started;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can be called twice', async () => {
    const c = make();
    await c.start();
    c.close();
    expect(() => c.close()).not.toThrow();
  });

  it('start() after close() does nothing', async () => {
    const c = make();
    c.close();
    await c.start();
    await tick(10_000);
    expect(server.requests).toHaveLength(0);
  });

  it('keeps answering from the last snapshot after close()', async () => {
    server.setFlag(makeFlag({ key: 'a', fallthrough: { value: true } }));
    const c = make();
    await c.start();
    c.close();
    expect(c.get('a', user, false)).toBe(true);
  });
});

describe('step 6 (stretch): timeouts and hooks', () => {
  it('aborts a request that takes longer than requestTimeoutMs, then tries again later', async () => {
    server.failWith = 'hang';
    const c = make({ requestTimeoutMs: 2000 });
    const started = c.start();
    await tick(1999);
    expect(server.requests[0]?.signal?.aborted).toBe(false);
    await tick(1);
    await started; // the timeout ended the attempt, so start() resolves
    expect(server.requests[0]?.signal?.aborted).toBe(true);

    // it counts as failure 1, so the next attempt comes 2000ms later
    await tick(2000);
    expect(server.requests).toHaveLength(2);
  });

  it('calls onError for each failed attempt, but not for successes or 304s', async () => {
    server.setFlag(makeFlag({ key: 'a' }));
    const onError = vi.fn();
    const c = make({ onError });
    await c.start(); // success
    await tick(1000); // 304
    expect(onError).not.toHaveBeenCalled();

    server.failWith = 500;
    await tick(1000); // failure 1
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    await tick(2000); // failure 2
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('calls onChange when a new snapshot is accepted, and not on a 304', async () => {
    server.setFlag(makeFlag({ key: 'a' })); // version 1
    const onChange = vi.fn();
    const c = make({ onChange });
    await c.start();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ version: 1 });

    await tick(1000); // 304: nothing new
    expect(onChange).toHaveBeenCalledTimes(1);

    server.setFlag(makeFlag({ key: 'a', enabled: false })); // version 2
    await tick(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0]).toMatchObject({ version: 2 });
  });
});
