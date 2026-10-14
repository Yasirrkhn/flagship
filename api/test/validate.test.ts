import { describe, expect, it } from 'vitest';
import { validateFlag } from '../src/validate.js';
import { makeFlag } from './helpers.js';

/** Returns the issue paths, or fails the test if the input was accepted. */
function pathsOf(input: unknown): string[] {
  const result = validateFlag(input);
  if (result.ok) throw new Error('expected validation to fail, but it passed');
  return result.issues.map((issue) => issue.path);
}

describe('step 1a: accepting good flags', () => {
  it('accepts a simple flag and returns it', () => {
    const flag = makeFlag();
    const result = validateFlag(flag);
    expect(result).toEqual({ ok: true, flag });
  });

  it('accepts rules and rollouts', () => {
    const flag = makeFlag({
      fallthrough: { percent: 25, value: true, otherwise: false },
      rules: [
        { attribute: 'email', operator: 'endsWith', value: '@acme.com', serve: { value: true } },
        { attribute: 'age', operator: 'equals', value: 21, serve: { percent: 100, value: 'a', otherwise: 'b' } },
      ],
    });
    expect(validateFlag(flag)).toEqual({ ok: true, flag });
  });

  it('accepts boundary percentages 0 and 100', () => {
    expect(validateFlag(makeFlag({ fallthrough: { percent: 0, value: true, otherwise: false } })).ok).toBe(true);
    expect(validateFlag(makeFlag({ fallthrough: { percent: 100, value: true, otherwise: false } })).ok).toBe(true);
  });

  it('throws away unknown fields', () => {
    const result = validateFlag({ ...makeFlag(), hacker: true, rules: [], extra: { nested: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flag).toEqual(makeFlag());
      expect(Object.keys(result.flag).sort()).toEqual(['enabled', 'fallthrough', 'key', 'offValue', 'rules']);
    }
  });
});

describe('step 1b: rejecting bad input', () => {
  it.each([null, undefined, 42, 'flag', true, [], [makeFlag()]])('rejects %j as a whole', (input) => {
    expect(pathsOf(input)).toEqual(['']);
  });

  it('rejects a bad key', () => {
    for (const key of ['', 'has space', '-starts-with-dash', 'x'.repeat(129), 123, null]) {
      expect(pathsOf({ ...makeFlag(), key })).toContain('key');
    }
  });

  it('accepts keys with dots, dashes and underscores', () => {
    for (const key of ['a', 'checkout.v2', 'new_checkout-2', 'A1']) {
      expect(validateFlag({ ...makeFlag(), key }).ok).toBe(true);
    }
  });

  it('rejects a non-boolean enabled', () => {
    expect(pathsOf({ ...makeFlag(), enabled: 'yes' })).toEqual(['enabled']);
    expect(pathsOf({ ...makeFlag(), enabled: undefined })).toEqual(['enabled']);
  });

  it('rejects an offValue that is not boolean, string or finite number', () => {
    for (const offValue of [null, undefined, {}, [], Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pathsOf({ ...makeFlag(), offValue })).toEqual(['offValue']);
    }
  });

  it('rejects a bad fallthrough', () => {
    expect(pathsOf({ ...makeFlag(), fallthrough: 'nope' })).toEqual(['fallthrough']);
    expect(pathsOf({ ...makeFlag(), fallthrough: {} })).toEqual(['fallthrough']);
    expect(pathsOf({ ...makeFlag(), fallthrough: { value: null } })).toEqual(['fallthrough.value']);
  });

  it('rejects a bad rollout', () => {
    const rollout = (patch: object) => ({ ...makeFlag(), fallthrough: { percent: 50, value: true, otherwise: false, ...patch } });
    expect(pathsOf(rollout({ percent: 101 }))).toEqual(['fallthrough.percent']);
    expect(pathsOf(rollout({ percent: -1 }))).toEqual(['fallthrough.percent']);
    expect(pathsOf(rollout({ percent: '50' }))).toEqual(['fallthrough.percent']);
    expect(pathsOf(rollout({ percent: Number.NaN }))).toEqual(['fallthrough.percent']);
    expect(pathsOf(rollout({ otherwise: undefined }))).toEqual(['fallthrough.otherwise']);
    expect(pathsOf(rollout({ value: {} }))).toEqual(['fallthrough.value']);
  });

  it('rejects non-array rules and non-object rules', () => {
    expect(pathsOf({ ...makeFlag(), rules: {} })).toEqual(['rules']);
    expect(pathsOf({ ...makeFlag(), rules: undefined })).toEqual(['rules']);
    expect(pathsOf({ ...makeFlag(), rules: [42] })).toEqual(['rules.0']);
  });

  it('points at the exact broken part of a rule', () => {
    const good = { attribute: 'plan', operator: 'equals', value: 'pro', serve: { value: true } };
    expect(pathsOf({ ...makeFlag(), rules: [good, { ...good, attribute: '' }] })).toEqual(['rules.1.attribute']);
    expect(pathsOf({ ...makeFlag(), rules: [{ ...good, operator: 'regex' }] })).toEqual(['rules.0.operator']);
    expect(pathsOf({ ...makeFlag(), rules: [{ ...good, value: null }] })).toEqual(['rules.0.value']);
    expect(pathsOf({ ...makeFlag(), rules: [{ ...good, serve: 7 }] })).toEqual(['rules.0.serve']);
    expect(
      pathsOf({ ...makeFlag(), rules: [{ ...good, serve: { percent: 500, value: true, otherwise: false } }] }),
    ).toEqual(['rules.0.serve.percent']);
  });

  it('reports every problem at once, not just the first', () => {
    const paths = pathsOf({ key: 'bad key', enabled: 'x', offValue: null, fallthrough: 1, rules: 'nope' });
    expect(paths.sort()).toEqual(['enabled', 'fallthrough', 'key', 'offValue', 'rules']);
  });

  it('gives every issue a human-readable message', () => {
    const result = validateFlag({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      for (const issue of result.issues) expect(issue.message.length).toBeGreaterThan(3);
    }
  });
});
