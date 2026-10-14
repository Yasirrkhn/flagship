import { beforeEach, describe, expect, it } from 'vitest';
import { FlagStore } from '../src/store.js';
import { makeFlag } from './helpers.js';

describe('step 2: the flag store', () => {
  let store: FlagStore;

  beforeEach(() => {
    store = new FlagStore();
  });

  it('starts empty at version 0', () => {
    expect(store.list()).toEqual([]);
    expect(store.version).toBe(0);
    expect(store.snapshot()).toEqual({ version: 0, flags: {} });
    expect(store.get('nothing')).toBeUndefined();
  });

  it('creates a flag, and bumps the version', () => {
    expect(store.create(makeFlag({ key: 'a' }))).toBe(true);
    expect(store.get('a')).toEqual(makeFlag({ key: 'a' }));
    expect(store.version).toBe(1);
  });

  it('refuses a duplicate key and leaves the version alone', () => {
    store.create(makeFlag({ key: 'a' }));
    expect(store.create(makeFlag({ key: 'a', enabled: false }))).toBe(false);
    expect(store.get('a')?.enabled).toBe(true);
    expect(store.version).toBe(1);
  });

  it('lists flags in creation order', () => {
    store.create(makeFlag({ key: 'c' }));
    store.create(makeFlag({ key: 'a' }));
    store.create(makeFlag({ key: 'b' }));
    expect(store.list().map((flag) => flag.key)).toEqual(['c', 'a', 'b']);
  });

  it('updates an existing flag, and bumps the version', () => {
    store.create(makeFlag({ key: 'a' }));
    expect(store.update('a', makeFlag({ key: 'a', enabled: false }))).toBe(true);
    expect(store.get('a')?.enabled).toBe(false);
    expect(store.version).toBe(2);
  });

  it('refuses to update an unknown flag, and the version stays put', () => {
    expect(store.update('ghost', makeFlag({ key: 'ghost' }))).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.version).toBe(0);
  });

  it('deletes a flag, and bumps the version', () => {
    store.create(makeFlag({ key: 'a' }));
    expect(store.delete('a')).toBe(true);
    expect(store.get('a')).toBeUndefined();
    expect(store.version).toBe(2);
  });

  it('refuses to delete an unknown flag, and the version stays put', () => {
    expect(store.delete('ghost')).toBe(false);
    expect(store.version).toBe(0);
  });

  it('builds a snapshot keyed by flag key', () => {
    store.create(makeFlag({ key: 'a' }));
    store.create(makeFlag({ key: 'b', enabled: false }));
    expect(store.snapshot()).toEqual({
      version: 2,
      flags: { a: makeFlag({ key: 'a' }), b: makeFlag({ key: 'b', enabled: false }) },
    });
  });

  it('hands out copies, so callers cannot change the store behind its back', () => {
    store.create(makeFlag({ key: 'a' }));

    const fromGet = store.get('a')!;
    fromGet.enabled = false;
    expect(store.get('a')?.enabled).toBe(true);

    store.list()[0]!.enabled = false;
    expect(store.get('a')?.enabled).toBe(true);

    store.snapshot().flags['a']!.enabled = false;
    expect(store.get('a')?.enabled).toBe(true);
  });

  it('copies what it is given, too', () => {
    const flag = makeFlag({ key: 'a' });
    store.create(flag);
    flag.enabled = false;
    expect(store.get('a')?.enabled).toBe(true);
  });
});
