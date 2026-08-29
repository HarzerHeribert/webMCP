import type { Clock } from '../../server/core/service.ts';

/** A controllable clock for expiry tests. `MandateService` takes an injectable
 *  `Clock`; this is the test double so expiry can be driven by moving a number
 *  forward instead of waiting on real timers. */
export class FakeClock implements Clock {
  #now: number;

  constructor(start = Date.UTC(2026, 0, 1)) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  advance(ms: number): void {
    this.#now += ms;
  }
}
