/**
 * PROVIDED, don't edit. Turns (flagKey, userId) into a stable number from 0 to 99.
 *
 * The same inputs always give the same number, so a user never flips between
 * "in the rollout" and "out of the rollout". Different flags give different
 * numbers for the same user, so one unlucky user isn't always first in line.
 *
 * (Later exercise: swap this for MurmurHash3 and compare how evenly they spread.)
 */
export function bucket(flagKey: string, userId: string): number {
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  const input = `${flagKey}:${userId}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Extra mixing so the low digits are well spread before we take % 100
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) % 100;
}
