import type { Flag } from '../src/types.js';

export function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    key: 'new-checkout',
    enabled: true,
    offValue: false,
    rules: [],
    fallthrough: { value: false },
    ...overrides,
  };
}
