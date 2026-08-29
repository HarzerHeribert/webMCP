import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { LIMITS, MandateService } from '../../server/core/service';
import { MemorySessionStore } from '../../server/core/store';
import { redisQuota, type CounterStore } from '../../server/core/quota';
/**
 * The demo is a public URL on a free tier. These are the bounds that keep one
 * script from filling the store before a judge can open a session — not a
 * security boundary, and not claimed as one.
 */
describe('session size is bounded', () => {
  const svc = () => new MandateService(new MemorySessionStore());

  it('refuses a field value longer than a person would type', async () => {
    const s = svc();
    const session = await s.createSession();
    await expect(
      s.stageAsHuman(session.id, {
        resourceId: 'c-atlas',
        field: 'nextAction',
        after: 'x'.repeat(LIMITS.valueChars + 1),
      }),
    ).rejects.toThrow(/characters; the limit is/);
  });

  it('drops the oldest timeline events instead of growing without limit', async () => {
    const s = svc();
    const session = await s.createSession();
    for (let i = 0; i < LIMITS.timeline + 40; i += 1) {
      await s.setSelection(session.id, i % 2 === 0 ? ['c-atlas'] : []);
    }
    const read = await s.read(session.id);
    expect(read.timeline.length).toBe(LIMITS.timeline);
    // The newest survive; the seeded creation event is long gone.
    expect(read.timeline.at(-1)?.kind).toBe('SELECTION_CHANGED');
    expect(read.timeline.some((e) => e.kind === 'SESSION_CREATED')).toBe(false);
  });
});

describe('the store budget', () => {
  /** A counter store that records calls, so the quota's arithmetic is visible. */
  class FakeStore extends MemorySessionStore implements CounterStore {
    counters = new Map<string, number>();
    async incr(key: string): Promise<number> {
      const n = (this.counters.get(key) ?? 0) + 1;
      this.counters.set(key, n);
      return n;
    }
    async count(key: string): Promise<number> {
      return this.counters.get(key) ?? 0;
    }
  }

  it('refuses one caller opening sessions in a loop, with a 429 and a way forward', async () => {
    const store = new FakeStore();
    const app = createApp(store, redisQuota(store, { perFingerprint: 3, windowSeconds: 60, globalSessions: 1000 }));
    const hit = () =>
      app.request('/session', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.7' } });

    for (let i = 0; i < 3; i += 1) expect((await hit()).status).toBe(200);

    const refused = await hit();
    expect(refused.status).toBe(429);
    const body = (await refused.json()) as { error: { message: string; recovery: string } };
    expect(body.error.message).toMatch(/opened 3 demo sessions/);
    expect(body.error.recovery).toMatch(/Reuse the session/);
  });

  it('refuses new sessions once the store is at capacity', async () => {
    const store = new FakeStore();
    store.counters.set('q:live', 5);
    const app = createApp(store, redisQuota(store, { perFingerprint: 99, windowSeconds: 60, globalSessions: 5 }));
    const res = await app.request('/session', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(JSON.stringify(await res.json())).toMatch(/at capacity/);
  });

  it('admits when the store cannot be measured — an outage must not close the demo', async () => {
    const broken: CounterStore = {
      get: async () => undefined,
      put: async () => {},
      delete: async () => {},
      incr: async () => {
        throw new Error('redis down');
      },
      count: async () => {
        throw new Error('redis down');
      },
    };
    const app = createApp(new MemorySessionStore(), redisQuota(broken));
    expect((await app.request('/session', { method: 'POST' })).status).toBe(200);
  });
});
