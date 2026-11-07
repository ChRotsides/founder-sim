// Seeded PRNG (mulberry32). The state lives inside the game save so every run is reproducible.
export interface RngState {
  s: number;
}

export class Rng {
  constructor(public st: RngState) {}

  next(): number {
    let t = (this.st.s = (this.st.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of items) {
      r -= w;
      if (r <= 0) return v;
    }
    return items[items.length - 1][0];
  }

  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Lognormal parameterised by its median and a multiplicative spread (sigma of the underlying normal). */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(this.normal(0, sigma));
  }

  /** Poisson draw, used for "how many events happened today". */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const l = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > l);
    return k - 1;
  }

  id(prefix: string): string {
    return `${prefix}_${Math.floor(this.next() * 2 ** 32).toString(36)}`;
  }
}

export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
