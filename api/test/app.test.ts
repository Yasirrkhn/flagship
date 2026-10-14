import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { FlagStore } from '../src/store.js';
import { makeFlag } from './helpers.js';

let store: FlagStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new FlagStore();
  app = createApp(store);
});

/** Sends a request with a JSON body. */
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('warm-up: the example route', () => {
  it('GET /health works (already done for you)', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('step 3a: POST /flags', () => {
  it('creates a flag and answers 201 with it', async () => {
    const res = await send('POST', '/flags', makeFlag({ key: 'a' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(makeFlag({ key: 'a' }));
    expect(store.get('a')).toEqual(makeFlag({ key: 'a' }));
  });

  it('strips unknown fields before storing', async () => {
    await send('POST', '/flags', { ...makeFlag({ key: 'a' }), hacker: true });
    expect(store.get('a')).toEqual(makeFlag({ key: 'a' }));
  });

  it('answers 400 validation_failed with the issues for an invalid flag', async () => {
    const res = await send('POST', '/flags', { key: 'bad key', enabled: 'x' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string }[] };
    expect(body.error).toBe('validation_failed');
    expect(body.issues.map((issue) => issue.path)).toContain('key');
    expect(body.issues.map((issue) => issue.path)).toContain('enabled');
    expect(store.list()).toEqual([]);
  });

  it('answers 400 invalid_json when the body is not JSON', async () => {
    const res = await send('POST', '/flags', '{ this is not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('answers 409 already_exists for a duplicate key', async () => {
    await send('POST', '/flags', makeFlag({ key: 'a' }));
    const res = await send('POST', '/flags', makeFlag({ key: 'a', enabled: false }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_exists' });
    expect(store.get('a')?.enabled).toBe(true);
  });
});

describe('step 3b: reading flags', () => {
  it('GET /flags lists everything', async () => {
    store.create(makeFlag({ key: 'a' }));
    store.create(makeFlag({ key: 'b' }));
    const res = await app.request('/flags');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([makeFlag({ key: 'a' }), makeFlag({ key: 'b' })]);
  });

  it('GET /flags is an empty array when there are none', async () => {
    const res = await app.request('/flags');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('GET /flags/:key returns one flag', async () => {
    store.create(makeFlag({ key: 'a' }));
    const res = await app.request('/flags/a');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(makeFlag({ key: 'a' }));
  });

  it('GET /flags/:key answers 404 for an unknown flag', async () => {
    const res = await app.request('/flags/ghost');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

describe('step 3c: PUT /flags/:key', () => {
  it('replaces a flag', async () => {
    store.create(makeFlag({ key: 'a' }));
    const res = await send('PUT', '/flags/a', makeFlag({ key: 'a', enabled: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(makeFlag({ key: 'a', enabled: false }));
    expect(store.get('a')?.enabled).toBe(false);
  });

  it('answers 404 for an unknown flag', async () => {
    const res = await send('PUT', '/flags/ghost', makeFlag({ key: 'ghost' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('answers 400 when the key in the body differs from the URL', async () => {
    store.create(makeFlag({ key: 'a' }));
    const res = await send('PUT', '/flags/a', makeFlag({ key: 'other' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string }[] };
    expect(body.error).toBe('validation_failed');
    expect(body.issues.map((issue) => issue.path)).toContain('key');
    expect(store.get('a')).toEqual(makeFlag({ key: 'a' }));
  });

  it('answers 400 for an invalid flag and 400 for bad JSON', async () => {
    store.create(makeFlag({ key: 'a' }));
    const invalid = await send('PUT', '/flags/a', { key: 'a', enabled: 'nope' });
    expect(invalid.status).toBe(400);
    const badJson = await send('PUT', '/flags/a', 'nope{');
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: 'invalid_json' });
  });
});

describe('step 3d: DELETE /flags/:key', () => {
  it('deletes and answers 204 with no body', async () => {
    store.create(makeFlag({ key: 'a' }));
    const res = await send('DELETE', '/flags/a');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(store.get('a')).toBeUndefined();
  });

  it('answers 404 for an unknown flag', async () => {
    const res = await send('DELETE', '/flags/ghost');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

describe('step 3e: GET /snapshot', () => {
  it('returns the version and all flags keyed by key', async () => {
    store.create(makeFlag({ key: 'a' }));
    store.create(makeFlag({ key: 'b', enabled: false }));
    const res = await app.request('/snapshot');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      version: 2,
      flags: { a: makeFlag({ key: 'a' }), b: makeFlag({ key: 'b', enabled: false }) },
    });
  });

  it('moves the version when flags change through the API', async () => {
    const before = (await (await app.request('/snapshot')).json()) as { version: number };
    await send('POST', '/flags', makeFlag({ key: 'a' }));
    const after = (await (await app.request('/snapshot')).json()) as { version: number };
    expect(after.version).toBe(before.version + 1);
  });
});

describe('step 4: ETag caching on /snapshot', () => {
  it('sends the version as a quoted ETag', async () => {
    store.create(makeFlag({ key: 'a' }));
    store.create(makeFlag({ key: 'b' }));
    const res = await app.request('/snapshot');
    expect(res.headers.get('ETag')).toBe('"2"');
  });

  it('answers 304 with no body when If-None-Match is current', async () => {
    store.create(makeFlag({ key: 'a' }));
    const res = await app.request('/snapshot', { headers: { 'If-None-Match': '"1"' } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
    expect(res.headers.get('ETag')).toBe('"1"');
  });

  it('answers 200 with the new data when the ETag is stale', async () => {
    store.create(makeFlag({ key: 'a' }));
    const stale = '"1"';
    store.create(makeFlag({ key: 'b' }));
    const res = await app.request('/snapshot', { headers: { 'If-None-Match': stale } });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    const body = (await res.json()) as { version: number };
    expect(body.version).toBe(2);
  });

  it('answers 200 for garbage in If-None-Match', async () => {
    const res = await app.request('/snapshot', { headers: { 'If-None-Match': 'whatever' } });
    expect(res.status).toBe(200);
  });
});

describe('step 5 (stretch): friendly errors', () => {
  it('unknown URLs answer 404 JSON instead of plain text', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('unexpected crashes answer 500 JSON and do not leak details', async () => {
    store.list = () => {
      throw new Error('database password is hunter2');
    };
    const res = await app.request('/flags');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });
});
