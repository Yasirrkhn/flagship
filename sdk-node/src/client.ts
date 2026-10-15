
import { evaluate } from '../../evaluate/src/evaluate.js';
import type { User, Value } from '../../evaluate/src/types.js';
import type { FlagshipOptions, Snapshot } from './types.js';

export class FlagshipClient {
  private readonly options: Required<
    Pick<
      FlagshipOptions,
      | 'url'
      | 'pollIntervalMs'
      | 'maxBackoffMs'
      | 'requestTimeoutMs'
      | 'fetch'
      | 'random'
    >
  > &
    Pick<FlagshipOptions, 'onChange' | 'onError'>;

  private snapshot: Snapshot | undefined;
  private etag: string | undefined;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private started = false;
  private closed = false;
  private startPromise: Promise<void> | undefined;

  constructor(options: FlagshipOptions) {
    this.options = {
      ...options,
      url: options.url.replace(/\/+$/, ''),
      pollIntervalMs: options.pollIntervalMs ?? 5000,
      maxBackoffMs: options.maxBackoffMs ?? 60_000,
      requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      random: options.random ?? Math.random,
    };
  }

  /** Download the first snapshot and begin polling. Never rejects. */
  start(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }

    // Reuse the same promise if start() is called more than once.
    if (this.startPromise) {
      return this.startPromise;
    }

    this.started = true;
    this.startPromise = this.poll();

    return this.startPromise;
  }

  /** The value of a flag for a user, computed locally. */
  get(key: string, user: User, defaultValue: Value): Value {
    const flags = this.snapshot?.flags;

    if (!flags || !Object.hasOwn(flags, key)) {
      return defaultValue;
    }

    const flag = flags[key];

    if (flag === undefined) {
      return defaultValue;
    }

    return evaluate(flag, user);
  }

  /** Shorthand for "is this boolean flag on?" */
  isOn(key: string, user: User): boolean {
    return this.get(key, user, false) === true;
  }

  /** Stop everything. Safe to call more than once. */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    this.controller?.abort();
    this.controller = undefined;
  }

  /** Fetch one snapshot, then schedule the next attempt. */
  private async poll(): Promise<void> {
    if (this.closed) {
      return;
    }

    let succeeded = false;

    const controller = new AbortController();
    this.controller = controller;

    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      timeout = setTimeout(() => {
        controller.abort();
      }, this.options.requestTimeoutMs);

      const headers: Record<string, string> = {};

      if (this.etag !== undefined) {
        headers['If-None-Match'] = this.etag;
      }

      const response = await this.options.fetch(
        `${this.options.url}/snapshot`,
        {
          method: 'GET',
          headers,
          signal: controller.signal,
        }
      );

      // A 304 means the existing snapshot is still valid.
      if (response.status === 304) {
        succeeded = true;
        this.failures = 0;
        return;
      }

      if (!response.ok) {
        throw new Error(`Snapshot request failed: HTTP ${response.status}`);
      }

      const body: unknown = await response.json();

      if (!this.isSnapshot(body)) {
        throw new Error('Invalid snapshot response');
      }

      // Do not accept a response after close().
      if (this.closed) {
        return;
      }

      this.snapshot = body;
      this.etag = response.headers.get('ETag') ?? undefined;
      this.failures = 0;
      succeeded = true;

      try {
        this.options.onChange?.(body);
      } catch (error) {
        this.reportError(error);
      }
    } catch (error) {
      // Closing the client intentionally aborts its request.
      if (this.closed) {
        return;
      }

      this.failures++;
      this.reportError(error);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      if (this.controller === controller) {
        this.controller = undefined;
      }

      // Schedule the next attempt only after this one finishes.
      if (!this.closed && this.started) {
        const delay = succeeded
          ? this.options.pollIntervalMs
          : Math.min(
              this.options.maxBackoffMs,
              this.options.pollIntervalMs * 2 ** this.failures
            ) * this.options.random();

        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.poll();
        }, delay);
      }
    }
  }

  /** Check the basic shape of a snapshot received from the server. */
  private isSnapshot(input: unknown): input is Snapshot {
    if (
      typeof input !== 'object' ||
      input === null ||
      Array.isArray(input)
    ) {
      return false;
    }

    const value = input as Record<string, unknown>;
    const flags = value.flags;

    return (
      typeof value.version === 'number' &&
      Number.isFinite(value.version) &&
      typeof flags === 'object' &&
      flags !== null &&
      !Array.isArray(flags)
    );
  }

  /** Keep errors from callbacks from breaking the polling loop. */
  private reportError(error: unknown): void {
    try {
      this.options.onError?.(error);
    } catch {
      // An error callback must not stop the SDK.
    }
  }
}

export type { Snapshot };
