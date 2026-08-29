import { afterAll, describe, expect, it } from 'vitest';
import { parseReply, RedisSocketStore } from '../../server/core/redis-socket-store';
import { MandateService } from '../../server/core/service';
import type { Session } from '../../server/core/types';

/**
 * The RESP client is hand-written because node-redis cannot survive bundling
 * (see `redis-socket-store.ts`). Hand-written means it needs real tests against
 * a real server, not a mock that agrees with my reading of the protocol.
 *
 * Run a Redis on 6380 to exercise the socket path:
 *   docker run -d --rm -p 6380:6379 redis:7-alpine
 * Without one, the protocol tests still run and the round-trip is skipped.
 */
const URL_ = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6380';

async function reachable(): Promise<boolean> {
  const probe = new RedisSocketStore(URL_);
  try {
    await probe.count('mandate:probe');
    return true;
  } catch {
    return false;
  } finally {
    probe.close();
  }
}

const live = await reachable();
const store = new RedisSocketStore(URL_, 60);
afterAll(() => store.close());

describe('the RESP parser', () => {
  it('reads every reply shape this client can receive', () => {
    expect(parseReply(Buffer.from('+OK\r\n'))).toEqual({ value: 'OK' });
    expect(parseReply(Buffer.from(':42\r\n'))).toEqual({ value: 42 });
    expect(parseReply(Buffer.from('$-1\r\n'))).toEqual({ value: null });
    expect(parseReply(Buffer.from('$5\r\nhello\r\n'))).toEqual({ value: 'hello' });
    expect(parseReply(Buffer.from('-ERR nope\r\n'))?.error).toBe('ERR nope');
  });

  it('asks for more when a reply is only partly arrived', () => {
    expect(parseReply(Buffer.from('$5\r\nhel'))).toBeUndefined();
    expect(parseReply(Buffer.from('+OK'))).toBeUndefined();
  });

  it('reads a bulk string containing CRLF, rather than stopping at it', () => {
    // The length prefix is what bounds a bulk string; scanning for \r\n would
    // truncate any JSON session that happens to contain one.
    expect(parseReply(Buffer.from('$5\r\na\r\nb!\r\n'))).toEqual({ value: 'a\r\nb!' });
  });
});

describe.skipIf(!live)('against a real Redis', () => {
  it('round-trips a whole session', async () => {
    const svc = new MandateService(store);
    const created = await svc.createSession();
    await svc.setSelection(created.id, ['c-atlas']);
    await svc.createMandate(created.id, { customerIds: ['c-atlas'], allowedFields: ['status'] });

    // Read it back through a *separate* connection: this is the thing process
    // memory cannot do, and the reason this adapter exists.
    const other = new RedisSocketStore(URL_, 60);
    try {
      const round = (await other.get(created.id)) as Session;
      expect(round.id).toBe(created.id);
      expect(round.customers).toHaveLength(6);
      expect(round.mandate?.allowedFields).toEqual(['status']);
      expect(round.selectedCustomerIds).toEqual(['c-atlas']);
    } finally {
      other.close();
    }
  });

  it('counts and expires, which is what the quota needs', async () => {
    const key = `q:test:${Math.random().toString(36).slice(2)}`;
    expect(await store.incr(key, 60)).toBe(1);
    expect(await store.incr(key, 60)).toBe(2);
    expect(await store.count(key)).toBe(2);
    expect(await store.count(`${key}:absent`)).toBe(0);
  });

  it('deletes', async () => {
    const svc = new MandateService(store);
    const s = await svc.createSession();
    expect(await store.get(s.id)).toBeDefined();
    await store.delete(s.id);
    expect(await store.get(s.id)).toBeUndefined();
  });
});
