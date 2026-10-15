# Flagship Node SDK: build the client

Your evaluator decides what one user gets. Your API serves all the flags. This is the piece in the middle: a small library that a customer's app installs.

```
 your API  ──GET /snapshot (+ ETag)──►  FlagshipClient (in the customer's app)
                                          │ keeps all flags in memory
                                          ▼
                                  client.isOn('new-checkout', user)
                                  = your evaluator, no network call
```

Three promises it makes, and what the tests check:

1. **Fast:** answering "is this on?" never touches the network.
2. **Fresh:** it checks the server every few seconds, cheaply, using the ETag you built.
3. **Resilient:** if the flag server dies, the app keeps running on the last flags it saw.

## One-time setup: turn the repo into a workspace

The SDK imports your evaluator (`@flagship/evaluator`), so the three folders need to know about each other. pnpm does this with a workspace.

Your repo should end up like this:

```
flagship/                    <- repo root
  pnpm-workspace.yaml        <- new (from the zip)
  package.json               <- new (from the zip)
  evaluator/
  api/
  sdk-node/                  <- new (from the zip)
```

1. Unzip so `pnpm-workspace.yaml`, `package.json` and `sdk-node/` land in the repo root, next to `api/` and `evaluator/`.
   (If you already have a root `package.json`, keep yours and don't overwrite it.)

2. Open **`evaluator/package.json`** and make two edits. Change the name, and add `exports`:

   ```json
   {
     "name": "@flagship/evaluator",
     "private": true,
     "type": "module",
     "exports": {
       ".": "./src/index.ts"
     },
     "scripts": { ... leave as they are ... }
   }
   ```

   `exports` tells other packages which file to import. Make sure `evaluator/src/index.ts` exports `evaluate` and the types `Flag`, `User` and `Value`. If you used my version, it already does.

3. Remove the old per-project installs. The whole repo now shares one:

   ```powershell
   cd C:\Users\ysrkh\Code\flagship
   Remove-Item evaluator\node_modules, api\node_modules -Recurse -Force -ErrorAction SilentlyContinue
   Remove-Item evaluator\pnpm-lock.yaml, api\pnpm-lock.yaml -ErrorAction SilentlyContinue
   pnpm install
   ```

4. Check nothing broke:

   ```powershell
   cd evaluator; pnpm test      # 16 passing
   cd ..\api; pnpm test         # 56 passing
   cd ..\sdk-node; pnpm typecheck   # no errors
   ```

5. Commit it. The one root `pnpm-lock.yaml` replaces the old ones.

## Run it

```powershell
cd sdk-node
pnpm dev        # re-runs the tests on every save
```

At first, all the tests fail. Make them pass in order. All your work is in **`src/client.ts`**; the big comment at the top is the spec.

## Steps

| Step | You build | New idea |
| --- | --- | --- |
| 1 | `start`, `get`, `isOn` | download once, answer locally |
| 2 | polling with `If-None-Match` | `setTimeout` chains, why 304 isn't an error |
| 3 | surviving failures | keep the last good snapshot; never throw from `start()` |
| 4 | backoff with jitter | exponential delays, and why random spreads load |
| 5 | `close()` | `AbortController`, leaving no timers behind |
| 6 | timeouts and hooks (stretch) | `onChange`, `onError`, `requestTimeoutMs` |

## How the tests work

- The SDK takes a `fetch` option. Tests pass a **fake server** (`test/helpers.ts`) instead of using the real network. That's called dependency injection.
- Time is **fake** too. `await tick(1000)` jumps the clock forward by one second instantly. A test that does `tick(999)` and then `tick(1)` checks that something happens at exactly 1000ms and not before. Read the first comment in `test/client.test.ts` once.

## See it for real

When the tests pass, run it against your actual API:

```powershell
# terminal 1
cd api; pnpm start

# terminal 2: create a flag (or use Postman)
Invoke-RestMethod -Method Post -Uri http://localhost:3000/flags -ContentType 'application/json' -Body '{"key":"new-checkout","enabled":true,"offValue":false,"rules":[],"fallthrough":{"value":false}}'

# terminal 3
cd sdk-node; pnpm demo
```

The demo prints the flag's value once a second. Now flip it through the API (send the same flag with `"fallthrough":{"value":true}` using `PUT /flags/new-checkout`) and watch the demo change within a second. Then stop the API with Ctrl+C: the demo keeps printing the last value and reports the errors. That is your resilience story, working.

## Stuck?

- Read the first failing test only. Test names say what's expected.
- Most timing bugs are "off by one poll". Draw the timeline: when is each request made, and when is the next one scheduled?
- `pnpm typecheck` catches things Vitest doesn't.
- Tell me the step and what the test says. I'll give a hint, not the answer.

## When it's all green

1. Commit it with a message like "Add Node SDK: polling, ETag, backoff, clean shutdown".
2. Record a 20-second clip of the demo: flip a flag, watch it change, kill the API, watch it keep working. That is the thing to put in the README and cold emails.
3. Next modules: **SDK keys and auth** (`api/`), then **live updates with SSE** (`api/` and `sdk-node/`).
