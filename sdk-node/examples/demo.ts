// PROVIDED. A tiny app that uses your SDK against your real API.
//
//   Terminal 1:  cd api && pnpm start
//   Terminal 2:  cd sdk-node && pnpm demo            (or: pnpm demo my-flag-key)
//   Then change the flag through the API and watch Terminal 2 pick it up within a second.
//
// The "[sdk] ..." lines need the onChange / onError hooks from step 6. Without
// them the demo still works; it just prints less.
import { FlagshipClient } from '../src/index.js';

const url = process.env.FLAGSHIP_URL ?? 'http://localhost:3000';
const flagKey = process.argv[2] ?? 'new-checkout';

const client = new FlagshipClient({
  url,
  pollIntervalMs: 1000,
  onChange: (snapshot) => {
    console.log(`[sdk] new snapshot: version ${snapshot.version}, ${Object.keys(snapshot.flags).length} flag(s)`);
  },
  onError: (error) => {
    console.log(`[sdk] problem talking to the server: ${error instanceof Error ? error.message : String(error)}`);
  },
});

await client.start();

const user = { id: 'demo-user', attributes: { plan: 'pro' } };
const timer = setInterval(() => {
  console.log(`${flagKey} for ${user.id} ->`, client.get(flagKey, user, 'DEFAULT (flag not found)'));
}, 1000);

process.on('SIGINT', () => {
  clearInterval(timer);
  client.close();
  console.log('\nbye');
});
