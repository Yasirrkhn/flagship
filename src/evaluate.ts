import { bucket } from './hash.js';
import type { Flag, Rule, Serve, User, Value } from './types.js';

export function evaluate(flag: Flag, user: User): Value {
  if (!flag.enabled) {
    return flag.offValue
  }

  for (const rule of flag.rules) {
    if (ruleMatches(rule, user)) {
      return resolveServe(rule.serve, flag.key, user)
    }
  }

  return resolveServe(flag.fallthrough, flag.key, user)

}

function ruleMatches(rule: Rule, user: User): boolean {
    const attribute = user.attributes?.[rule.attribute]

    if (attribute === undefined) {
      return false
    }

    if(rule.operator === "equals") {
      return attribute === rule.value
    }

    if(rule.operator === "endsWith") {
      if (typeof attribute !== 'string') {
        return false
      }

      if(typeof rule.value !== 'string') {
        return false
      }

      return attribute.endsWith(rule.value)
    }
    return false
}

/** Turn a Serve into an actual value for this user. */
function resolveServe(serve: Serve, flagKey: string, user: User): Value {

  if (!('percent' in serve)) {
    return serve.value
  }

  const n = bucket(flagKey, user.id) 

  if (n < serve.percent) {
    return serve.value
  }

  return serve.otherwise

}
