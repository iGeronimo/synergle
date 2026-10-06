/** Small deterministic RNG so puzzle generation is reproducible. */

export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  }

  /** mulberry32 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  weightedPick<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const item of items) {
      r -= Math.max(0, weight(item));
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Picks `n` distinct items, each draw weighted. */
  weightedSample<T>(items: readonly T[], n: number, weight: (item: T) => number): T[] | undefined {
    const pool = [...items];
    const out: T[] = [];
    for (let k = 0; k < n; k++) {
      const item = this.weightedPick(pool, weight);
      if (item === undefined) return undefined;
      out.push(item);
      pool.splice(pool.indexOf(item), 1);
    }
    return out;
  }
}
