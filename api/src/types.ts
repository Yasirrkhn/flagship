// Same types as the evaluator project, plus the API's own shapes at the bottom.

export type Value = boolean | string | number;

export type Serve = { value: Value } | { percent: number; value: Value; otherwise: Value };

export interface Rule {
  attribute: string;
  operator: 'equals' | 'endsWith';
  value: string | number | boolean;
  serve: Serve;
}

export interface Flag {
  key: string;
  enabled: boolean;
  offValue: Value;
  rules: Rule[];
  fallthrough: Serve;
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

/** One thing wrong with the input. `path` says where, e.g. "key" or "rules.0.operator". */
export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; flag: Flag } | { ok: false; issues: ValidationIssue[] };

/** Everything an SDK needs: all flags, plus a number that goes up on every change. */
export interface Snapshot {
  version: number;
  flags: Record<string, Flag>;
}
