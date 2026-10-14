/** A value a flag can hand back. */
export type Value = boolean | string | number;

/** The person (or org, or device) we're deciding for. */
export interface User {
  /** Stable id. Used to decide who is in a percentage rollout. */
  id: string;
  /** Extra facts about the user that rules can look at, e.g. { email: "a@acme.com", plan: "pro" }. */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * What to hand back. Either one fixed value, or a percentage rollout:
 *   { percent: 30, value: true, otherwise: false }
 * means "30% of users get `value`, everyone else gets `otherwise`".
 */
export type Serve = { value: Value } | { percent: number; value: Value; otherwise: Value };

export interface Rule {
  /** Which user attribute to look at, e.g. "email". */
  attribute: string;
  operator: 'equals' | 'endsWith';
  /** What to compare against. */
  value: string | number | boolean;
  /** What to serve if this rule matches. */
  serve: Serve;
}

export interface Flag {
  key: string;
  /** The kill switch. If false, always serve `offValue`. */
  enabled: boolean;
  offValue: Value;
  /** Checked in order; the first rule that matches wins. */
  rules: Rule[];
  /** Used when no rule matches. */
  fallthrough: Serve;
}
