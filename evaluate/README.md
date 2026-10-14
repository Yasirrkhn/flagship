# Flagship starter: build the evaluator

You're writing one function: `evaluate(flag, user)`. It answers "what should this user get for this flag?"

All your work is in **`src/evaluate.ts`**. Everything else is given.

## Run it

```bash
pnpm install
pnpm dev        # re-runs the tests every time you save
```

Right now all 16 tests fail. Your job is to make them pass, top to bottom.

## How to work

1. Open `test/evaluate.test.ts` and read **step 1**. The test is your spec.
2. Do the matching `TODO` in `src/evaluate.ts`.
3. Save, watch the tests, move to the next step.

| Step | You build | New idea |
| --- | --- | --- |
| 1 | Kill switch | early return |
| 2 | Fallthrough default | the simplest "serve" |
| 3 | Rules, first match wins | looping, strict equality, missing data |
| 4 | `endsWith` | narrowing a type (`typeof x === 'string'`) |
| 5 | Percentage rollouts | why we hash instead of `Math.random()` |
| 6 | Rollouts inside rules | reusing `resolveServe` |

## Stuck on the rollout?

`bucket(flag.key, user.id)` gives a stable number from 0 to 99 for that user. If it's below `percent`, the user is in. Same user, same answer, every time. Raising the percentage only adds users because anyone under 20 is also under 40.

## When all 16 pass

Pick one stretch goal:

- Add operators: `in` (value in a list), `gt`, `lt`, `contains`.
- Let a rule have multiple conditions that must all match (AND).
- Return the reason too: `{ value, reason: 'OFF' | 'RULE_MATCH' | 'FALLTHROUGH' }`.
- Replace the hash in `src/hash.ts` with MurmurHash3 and compare how evenly each spreads users.
- Then move on to the next module: a tiny HTTP API that stores flags and serves them as JSON.
