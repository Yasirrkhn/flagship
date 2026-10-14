
import type { Flag, Snapshot } from './types.js';

export class FlagStore {
  private flags = new Map<string, Flag>();
  private _version = 0;

  /** All flags, in the order they were created. */
  list(): Flag[] {
    return Array.from(this.flags.values()).map((flag) =>
      structuredClone(flag)
    );
  }

  /** One flag, or undefined if there isn't one. */
  get(key: string): Flag | undefined {
    const flag = this.flags.get(key);

    return flag === undefined ? undefined : structuredClone(flag);
  }

  /** Add a flag. Returns false if the key already exists. */
  create(flag: Flag): boolean {
    if (this.flags.has(flag.key)) {
      return false;
    }

    this.flags.set(flag.key, structuredClone(flag));
    this._version++;

    return true;
  }

  /** Replace the flag stored under key. */
  update(key: string, flag: Flag): boolean {
    if (!this.flags.has(key)) {
      return false;
    }

    // Keep the original key consistent with the Map key.
    const updatedFlag = structuredClone({
      ...flag,
      key,
    });

    this.flags.set(key, updatedFlag);
    this._version++;

    return true;
  }

  /** Remove a flag. */
  delete(key: string): boolean {
    if (!this.flags.has(key)) {
      return false;
    }

    this.flags.delete(key);
    this._version++;

    return true;
  }

  get version(): number {
    return this._version;
  }

  /** Return the current version and all flags. */
  snapshot(): Snapshot {
    const flags: Record<string, Flag> = {};

    for (const [key, flag] of this.flags) {
      flags[key] = structuredClone(flag);
    }

    return {
      version: this._version,
      flags,
    };
  }
}
