import type { SessionStore } from './store';

/**
 * A budget on how many sessions the store will hold, and how fast one caller
 * can create them.
 *
 * The demo is a public URL backed by a free tier. Nothing here is a security
 * boundary — a determined actor rotates IPs — and it is not pretending to be
 * one. It exists so that ordinary crawling, an accidental loop, or one bored
 * person cannot fill the store before a judge opens it. The failure it prevents
 * is "the demo is unavailable on judging day", not "an attacker got in".
 *
 * The counters live in the same store as the sessions and expire on their own,
 * so there is nothing to clean up and nothing to run.
 */

export interface Quota {
  /** Throws a plain `Error` when the caller may not create another session. */
  admit(fingerprint: string): Promise<void>;
  /** Called when a session is created, so the global count stays honest. */
  admitted(): Promise<void>;
}

export const unlimited: Quota = {
  admit: async () => {},
  admitted: async () => {},
};

/** Counter operations a quota needs, which the memory store does not have. */
export interface CounterStore extends SessionStore {
  incr(key: string, ttlSeconds: number): Promise<number>;
  count(key: string): Promise<number>;
}

export interface QuotaLimits {
  /** New sessions one fingerprint may create per window. */
  perFingerprint: number;
  windowSeconds: number;
  /** Sessions alive at once across everyone. */
  globalSessions: number;
}

export const DEFAULT_LIMITS: QuotaLimits = {
  // A judge reloading, resetting and re-reading is a handful. Twenty is room to
  // be curious; a thousand is a script.
  perFingerprint: 20,
  windowSeconds: 60 * 30,
  // At ~15 KB a session, 4,000 live sessions is well inside a 30 MB tier even
  // if every one of them is driven to its size ceiling.
  globalSessions: 4000,
};

export function redisQuota(store: CounterStore, limits: QuotaLimits = DEFAULT_LIMITS): Quota {
  return {
    async admit(fingerprint: string) {
      // A store that is briefly unreachable must not take the demo down with
      // it: an unmeasurable quota admits rather than refuses.
      let used = 0;
      let live = 0;
      try {
        used = await store.incr(`q:fp:${fingerprint}`, limits.windowSeconds);
        live = await store.count('q:live');
      } catch {
        return;
      }
      if (used > limits.perFingerprint) {
        throw new Error(
          `This address has opened ${limits.perFingerprint} demo sessions recently. ` +
            'Reuse the one you have — "Reset demo" restores the seed without a new session.',
        );
      }
      if (live >= limits.globalSessions) {
        throw new Error(
          'The demo store is at capacity right now. Sessions expire after thirty ' +
            'minutes, so this clears on its own shortly.',
        );
      }
    },
    async admitted() {
      try {
        await store.incr('q:live', 60 * 30);
      } catch {
        /* the count is an estimate, not a ledger */
      }
    },
  };
}
