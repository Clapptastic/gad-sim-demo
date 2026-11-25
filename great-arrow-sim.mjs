/**
 * great-arrow-sim — a determinism seam, added by Great Arrow.
 *
 * Read time, randomness, timers and the network through these exports instead
 * of the Date.now, Math.random, setTimeout and fetch globals. With GAD_SEED unset
 * (always, outside a simulation run) each one IS the real thing, so moving a
 * call site here changes nothing. With GAD_SEED=<n>, random() replays the same
 * sequence, now() is a virtual clock and timers fire in a seeded order, so a
 * failing seed can be replayed exactly: GAD_SEED=<n> <your test command>.
 */

const env =
  typeof process === "undefined" ? {} : process.env;
const parsed = env.GAD_SEED ? Number(env.GAD_SEED) : Number.NaN;

/** The simulation seed, or null outside a simulation run. */
export const seed =
  Number.isInteger(parsed) && parsed >= 0 && parsed < 2 ** 32 ? parsed : null;

function mulberry32(start) {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const draw = seed === null ? null : mulberry32(seed);
const timerDraw = seed === null ? null : mulberry32((seed ^ 0x9e3779b9) >>> 0);
const faultDraw = seed === null ? null : mulberry32((seed ^ 0x85ebca6b) >>> 0);
let virtualNow = Date.UTC(2026, 0, 1);

/** Milliseconds since the epoch. Seeded: a virtual clock, +1 ms per read. */
export function now() {
  if (seed === null) return Date.now();
  virtualNow += 1;
  return virtualNow;
}

/** Uniform in [0, 1). Seeded: the same sequence for the same seed. */
export function random() {
  return draw === null ? Math.random() : draw();
}

/** setTimeout. Seeded: a seeded jitter of up to 10%, and the virtual clock advances. */
export function setTimer(fn, ms) {
  if (timerDraw === null) return setTimeout(fn, ms);
  const jitter = Math.floor(timerDraw() * Math.max(1, ms * 0.1));
  return setTimeout(() => {
    virtualNow += ms;
    fn();
  }, ms + jitter);
}

export function clearTimer(handle) {
  clearTimeout(handle);
}

const faultRate = Number(env.GAD_SIM_FETCH_FAULT_RATE ?? 0) || 0;

/** fetch. Seeded with GAD_SIM_FETCH_FAULT_RATE set: some calls fail before sending. */
export const fetch = (input, init) => {
  if (faultDraw !== null && faultRate > 0 && faultDraw() < faultRate) {
    return Promise.reject(new TypeError("great-arrow-sim: injected network failure"));
  }
  return globalThis.fetch(input, init);
};
