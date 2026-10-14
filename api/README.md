# Flagship API starter: build the flag server

Your evaluator decides what one user gets. This project is the **server** that stores flags and hands them out to SDKs. When it's done, `GET /snapshot` returns every flag as one JSON blob, and the SDK you'll build next downloads it.

```
 you (or a dashboard) ──► POST/PUT/DELETE /flags ──► FlagStore (in memory)
                                                         │
 SDK in someone's app  ◄── GET /snapshot (+ ETag) ◄──────┘
```

## Run it

```bash
pnpm install
pnpm dev        # re-runs the tests every time you save
```

56 tests: 55 fail, 1 passes (`/health`, the example). Make them pass in order.

## Your files

You edit three files, one per layer. Each one only talks to the layer below it:

| File | Layer | Job |
| --- | --- | --- |
| `src/validate.ts` | input checking | turn `unknown` JSON into a safe `Flag`, or a list of what's wrong |
| `src/store.ts` | storage | keep flags, count changes with `version` |
| `src/app.ts` | HTTP | routes, status codes, headers |

Everything else is provided. Read the big comment at the top of each file first. It's the spec.

## Steps

| Step | Where | New idea |
| --- | --- | --- |
| 1 | `validate.ts` | never trust input; collect all errors; strip unknown fields |
| 2 | `store.ts` | `Map`, a version counter, returning copies so nobody edits your data by accident |
| 3 | `app.ts` | REST routes and status codes (201, 400, 404, 409, 204) |
| 4 | `app.ts` | ETag + `If-None-Match` -> 304: cheap "nothing changed" polling |
| 5 | `app.ts` | stretch: JSON for unknown URLs and crashes |

Do them in order. Steps 1 and 2 don't need HTTP at all, which is why they're first.

## Status codes in one minute

- **201** created. **200** ok. **204** ok, nothing to send back.
- **400** you sent something wrong (bad JSON, failed validation).
- **404** that thing doesn't exist. **409** that thing already exists.
- **304** "you already have the latest version, no body needed".
- **500** the server broke. Never show the caller the internal error text.

## Try it by hand

When tests pass, start the real server (`pnpm start`) and talk to it. Use Postman, or PowerShell:

```powershell
# create a flag
Invoke-RestMethod -Method Post -Uri http://localhost:3000/flags -ContentType 'application/json' -Body '{"key":"new-checkout","enabled":true,"offValue":false,"rules":[],"fallthrough":{"percent":10,"value":true,"otherwise":false}}'

# see the snapshot (this is what an SDK downloads)
Invoke-RestMethod -Uri http://localhost:3000/snapshot
```

Open `http://localhost:3000/snapshot` in a browser too. Then create a second flag and watch `version` go up.

## Stuck?

- **Tests fail in bulk?** Read the first failure only. One wrong helper often breaks many tests.
- **`pnpm typecheck`** catches things Vitest doesn't. Run it before you call a step done.
- Tell me the step and what the test says. I'll give a hint, not the answer.

## When it's all green

1. Push the project to GitHub. This is real portfolio code now.
2. Stretch: `PATCH /flags/:key` to flip just `enabled`. Which status code do you return for an unknown flag?
3. Next module: the **Node SDK**. It calls `GET /snapshot`, keeps the result in memory, sends `If-None-Match` on every poll, and uses your evaluator to answer `isOn("new-checkout", user)` with no network call.
