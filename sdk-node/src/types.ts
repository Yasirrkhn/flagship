
import type { Flag } from '../../evaluate/src/types.js';

/** What GET /snapshot returns. */
export interface Snapshot {
  version: number;
  flags: Record<string, Flag>;
}

/** Configuration for the Flagship SDK client. */
export interface FlagshipOptions {
  /** URL of the flag server. */
  url: string;

  /** Delay between successful polling attempts. Default: 5000 ms. */
  pollIntervalMs?: number;

  /** Maximum delay during backoff. Default: 60000 ms. */
  maxBackoffMs?: number;

  /** Maximum duration of one request. Default: 10000 ms. */
  requestTimeoutMs?: number;

  /** Fetch implementation. Useful for testing. */
  fetch?: typeof globalThis.fetch;

  /** Random number generator for backoff jitter. */
  random?: () => number;

  /** Called when a new snapshot is accepted. */
  onChange?: (snapshot: Snapshot) => void;

  /** Called when a refresh attempt fails. */
  onError?: (error: unknown) => void;
}
