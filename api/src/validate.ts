
import type { ValidationResult } from './types.js';

type FlagValue = boolean | string | number;

type CleanServe =
  | { value: FlagValue }
  | { percent: number; value: FlagValue; otherwise: FlagValue };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isValue(x: unknown): x is FlagValue {
  return (
    typeof x === 'boolean' ||
    typeof x === 'string' ||
    (typeof x === 'number' && Number.isFinite(x))
  );
}

function checkServe(
  input: unknown,
  path: string,
  issues: { path: string; message: string }[]
): CleanServe | undefined {
  if (!isRecord(input)) {
    issues.push({ path, message: 'Must be an object.' });
    return undefined;
  }

  const isRollout = 'percent' in input;

  if (!isRollout && !('value' in input)) {
    issues.push({ path, message: 'Must have a "value", or "percent", "value" and "otherwise".' });
    return undefined;
  }

  let value: FlagValue | undefined;
  let otherwise: FlagValue | undefined;
  let percent: number | undefined;

  if (!isValue(input.value)) {
    issues.push({
      path: `${path}.value`,
      message: 'Must be a boolean, string, or finite number.',
    });
  } else {
    value = input.value;
  }

  if (isRollout) {
    if (
      typeof input.percent !== 'number' ||
      !Number.isFinite(input.percent) ||
      input.percent < 0 ||
      input.percent > 100
    ) {
      issues.push({
        path: `${path}.percent`,
        message: 'Must be a finite number from 0 to 100.',
      });
    } else {
      percent = input.percent;
    }

    if (!isValue(input.otherwise)) {
      issues.push({
        path: `${path}.otherwise`,
        message: 'Must be a boolean, string, or finite number.',
      });
    } else {
      otherwise = input.otherwise;
    }

    if (
      value !== undefined &&
      otherwise !== undefined &&
      percent !== undefined
    ) {
      return { percent, value, otherwise };
    }

    return undefined;
  }

  if (value !== undefined) {
    return { value };
  }

  return undefined;
}

export function validateFlag(input: unknown): ValidationResult {
  const issues: { path: string; message: string }[] = [];

  if (!isRecord(input)) {
    issues.push({
      path: '',
      message: 'Must be an object.',
    });

    return { ok: false, issues } as ValidationResult;
  }

  // Validate the flag key.
  if (
    typeof input.key !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.key)
  ) {
    issues.push({
      path: 'key',
      message: 'Must be a valid flag key.',
    });
  }

  // Validate enabled.
  if (typeof input.enabled !== 'boolean') {
    issues.push({
      path: 'enabled',
      message: 'Must be a boolean.',
    });
  }

  // Validate offValue.
  if (!isValue(input.offValue)) {
    issues.push({
      path: 'offValue',
      message: 'Must be a boolean, string, or finite number.',
    });
  }

  // Validate fallthrough.
  const fallthrough = checkServe(input.fallthrough, 'fallthrough', issues);

  // Validate rules.
  const cleanRules: {
    attribute: string;
    operator: 'equals' | 'endsWith';
    value: FlagValue;
    serve: CleanServe;
  }[] = [];

  if (!Array.isArray(input.rules)) {
    issues.push({
      path: 'rules',
      message: 'Must be an array.',
    });
  } else {
    input.rules.forEach((rawRule: unknown, index: number) => {
      const path = `rules.${index}`;

      if (!isRecord(rawRule)) {
        issues.push({
          path,
          message: 'Must be an object.',
        });
        return;
      }

      let attribute: string | undefined;
      let operator: 'equals' | 'endsWith' | undefined;
      let value: FlagValue | undefined;

      if (
        typeof rawRule.attribute !== 'string' ||
        rawRule.attribute.length === 0
      ) {
        issues.push({
          path: `${path}.attribute`,
          message: 'Must be a non-empty string.',
        });
      } else {
        attribute = rawRule.attribute;
      }

      if (
        rawRule.operator !== 'equals' &&
        rawRule.operator !== 'endsWith'
      ) {
        issues.push({
          path: `${path}.operator`,
          message: "Must be 'equals' or 'endsWith'.",
        });
      } else {
        operator = rawRule.operator;
      }

      if (!isValue(rawRule.value)) {
        issues.push({
          path: `${path}.value`,
          message: 'Must be a boolean, string, or finite number.',
        });
      } else {
        value = rawRule.value;
      }

      const serve = checkServe(rawRule.serve, `${path}.serve`, issues);

      if (
        attribute !== undefined &&
        operator !== undefined &&
        value !== undefined &&
        serve !== undefined
      ) {
        cleanRules.push({ attribute, operator, value, serve });
      }
    });
  }

  // Do not return a flag if any validation failed.
  if (issues.length > 0) {
    return { ok: false, issues } as ValidationResult;
  }

  // Build a new object with only the allowed fields.
  const flag = {
    key: input.key as string,
    enabled: input.enabled as boolean,
    offValue: input.offValue as FlagValue,
    fallthrough: fallthrough!,
    rules: cleanRules,
  };

  return { ok: true, flag } as ValidationResult;
}
