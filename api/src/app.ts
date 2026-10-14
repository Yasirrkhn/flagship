
import { Hono } from 'hono';
import type { FlagStore } from './store.js';
import { validateFlag } from './validate.js';

export function createApp(store: FlagStore): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // STEP 3a: Create a flag.
  app.post('/flags', async (c) => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const result = validateFlag(body);

    if (!result.ok) {
      return c.json(
        { error: 'validation_failed', issues: result.issues },
        400
      );
    }

    const flag = result.flag;

    if (!store.create(flag)) {
      return c.json({ error: 'already_exists' }, 409);
    }

    return c.json(flag, 201);
  });

  // STEP 3b: Get all flags.
  app.get('/flags', (c) => {
    return c.json(store.list());
  });

  // Get one flag.
  app.get('/flags/:key', (c) => {
    const key = c.req.param('key');
    const flag = store.get(key);

    if (!flag) {
      return c.json({ error: 'not_found' }, 404);
    }

    return c.json(flag);
  });

  // STEP 3c: Update a flag.
  app.put('/flags/:key', async (c) => {
    const key = c.req.param('key');

    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const result = validateFlag(body);

    if (!result.ok) {
      return c.json(
        { error: 'validation_failed', issues: result.issues },
        400
      );
    }

    // The body key must match the URL key.
    if (result.flag.key !== key) {
      return c.json(
        {
          error: 'validation_failed',
          issues: [
            {
              path: 'key',
              message: 'Flag key must match the URL key.',
            },
          ],
        },
        400
      );
    }

    if (!store.update(key, result.flag)) {
      return c.json({ error: 'not_found' }, 404);
    }

    return c.json(result.flag);
  });

  // STEP 3d: Delete a flag.
  app.delete('/flags/:key', (c) => {
    const key = c.req.param('key');

    if (!store.delete(key)) {
      return c.json({ error: 'not_found' }, 404);
    }

    return c.body(null, 204);
  });

  // STEP 3e + STEP 4: Get a cache-friendly snapshot.
  app.get('/snapshot', (c) => {
    const snapshot = store.snapshot();
    const etag = `"${snapshot.version}"`;

    c.header('ETag', etag);

    if (c.req.header('If-None-Match') === etag) {
      return c.body(null, 304);
    }

    return c.json(snapshot);
  });

  // STEP 5: Friendly errors.
  app.notFound((c) => {
    return c.json({ error: 'not_found' }, 404);
  });

  app.onError((err, c) => {
    console.error(err);

    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
