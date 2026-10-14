// PROVIDED. Starts a real HTTP server. Run it with: pnpm start
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { FlagStore } from './store.js';

const store = new FlagStore();
const app = createApp(store);
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Flagship API listening on http://localhost:${info.port}`);
});
