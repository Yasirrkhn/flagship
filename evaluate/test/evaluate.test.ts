import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/index.js';
import type { Flag } from '../src/index.js';

/** A plain on/off flag. Tests tweak it with `overrides`. */
function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    key: 'new-checkout',
    enabled: true,
    offValue: false,
    rules: [],
    fallthrough: { value: false },
    ...overrides,
  };
}

describe('step 1: the kill switch', () => {
  it('returns offValue when the flag is disabled', () => {
    const flag = makeFlag({ enabled: false, offValue: 'safe', fallthrough: { value: 'new' } });
    expect(evaluate(flag, { id: 'u1' })).toBe('safe');
  });

  it('ignores matching rules while disabled', () => {
    const flag = makeFlag({
      enabled: false,
      rules: [{ attribute: 'plan', operator: 'equals', value: 'pro', serve: { value: true } }],
    });
    expect(evaluate(flag, { id: 'u1', attributes: { plan: 'pro' } })).toBe(false);
  });
});

describe('step 2: the default (fallthrough)', () => {
  it('serves the fallthrough value when there are no rules', () => {
    const flag = makeFlag({ fallthrough: { value: true } });
    expect(evaluate(flag, { id: 'u1' })).toBe(true);
  });

  it('works with strings and numbers too', () => {
    expect(evaluate(makeFlag({ fallthrough: { value: 'blue-button' } }), { id: 'u1' })).toBe('blue-button');
    expect(evaluate(makeFlag({ fallthrough: { value: 42 } }), { id: 'u1' })).toBe(42);
  });
});

describe('step 3: rules', () => {
  const proRule = { attribute: 'plan', operator: 'equals', value: 'pro', serve: { value: true } } as const;

  it('serves the rule value when it matches', () => {
    const flag = makeFlag({ rules: [proRule] });
    expect(evaluate(flag, { id: 'u1', attributes: { plan: 'pro' } })).toBe(true);
  });

  it('falls through when the rule does not match', () => {
    const flag = makeFlag({ rules: [proRule] });
    expect(evaluate(flag, { id: 'u1', attributes: { plan: 'free' } })).toBe(false);
  });

  it('the first matching rule wins', () => {
    const flag = makeFlag({
      fallthrough: { value: 'default' },
      rules: [
        { attribute: 'plan', operator: 'equals', value: 'pro', serve: { value: 'first' } },
        { attribute: 'plan', operator: 'equals', value: 'pro', serve: { value: 'second' } },
      ],
    });
    expect(evaluate(flag, { id: 'u1', attributes: { plan: 'pro' } })).toBe('first');
  });

  it('a user without that attribute never matches', () => {
    const flag = makeFlag({ rules: [proRule] });
    expect(evaluate(flag, { id: 'u1' })).toBe(false);
    expect(evaluate(flag, { id: 'u1', attributes: { country: 'IN' } })).toBe(false);
  });

  it('equals does not coerce types: 21 is not "21"', () => {
    const flag = makeFlag({
      rules: [{ attribute: 'age', operator: 'equals', value: 21, serve: { value: true } }],
    });
    expect(evaluate(flag, { id: 'u1', attributes: { age: 21 } })).toBe(true);
    expect(evaluate(flag, { id: 'u1', attributes: { age: '21' } })).toBe(false);
  });
});

describe('step 4: the endsWith operator', () => {
  const staffRule = {
    attribute: 'email',
    operator: 'endsWith',
    value: '@acme.com',
    serve: { value: true },
  } as const;

  it('matches by suffix', () => {
    const flag = makeFlag({ rules: [staffRule] });
    expect(evaluate(flag, { id: 'u1', attributes: { email: 'love@acme.com' } })).toBe(true);
    expect(evaluate(flag, { id: 'u2', attributes: { email: 'love@gmail.com' } })).toBe(false);
  });

  it('never matches non-string attributes (and never crashes)', () => {
    const flag = makeFlag({ rules: [staffRule] });
    expect(evaluate(flag, { id: 'u1', attributes: { email: 12345 } })).toBe(false);
    expect(evaluate(flag, { id: 'u1', attributes: { email: true } })).toBe(false);
  });
});

describe('step 5: percentage rollouts', () => {
  const rollout = (percent: number): Flag =>
    makeFlag({ fallthrough: { percent, value: true, otherwise: false } });

  const users = Array.from({ length: 2000 }, (_, i) => ({ id: `user-${i}` }));
  const countOn = (flag: Flag) => users.filter((u) => evaluate(flag, u) === true).length;

  it('0% gives the feature to nobody, 100% to everybody', () => {
    expect(countOn(rollout(0))).toBe(0);
    expect(countOn(rollout(100))).toBe(users.length);
  });

  it('gives the same answer to the same user every time', () => {
    const flag = rollout(50);
    for (const user of users.slice(0, 200)) {
      expect(evaluate(flag, user)).toBe(evaluate(flag, user));
    }
  });

  it('roughly matches the percentage across many users', () => {
    // 30% of 2000 is 600. We allow +/- 120 (that's +/- 6 percentage points).
    expect(Math.abs(countOn(rollout(30)) - 600)).toBeLessThan(120);
  });

  it('never removes a user when you raise the percentage', () => {
    // Everyone in the 20% group must still be in at 40%. This is why we hash instead of using Math.random().
    const at20 = rollout(20);
    const at40 = rollout(40);
    for (const user of users) {
      if (evaluate(at20, user) === true) expect(evaluate(at40, user)).toBe(true);
    }
  });
});

describe('step 6 (stretch): rules can roll out too', () => {
  it('a matching rule can serve a percentage rollout', () => {
    const flag = makeFlag({
      rules: [
        {
          attribute: 'plan',
          operator: 'equals',
          value: 'pro',
          serve: { percent: 100, value: 'new', otherwise: 'old' },
        },
      ],
      fallthrough: { value: 'old' },
    });
    expect(evaluate(flag, { id: 'u1', attributes: { plan: 'pro' } })).toBe('new');
    expect(evaluate(flag, { id: 'u1', attributes: { plan: 'free' } })).toBe('old');
  });
});
