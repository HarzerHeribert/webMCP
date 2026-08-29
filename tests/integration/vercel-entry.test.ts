import { describe, expect, it } from 'vitest';
import { DELETE, GET, POST } from '../../server/vercel-entry';

/**
 * The deployed path, exercised the way the platform calls it.
 *
 * This exists because it did not, and the deploy shipped broken twice: Vercel
 * transpiles `api/*.ts` without bundling it, so the relative imports survived
 * into the lambda as paths that were never shipped and every request died with
 * ERR_MODULE_NOT_FOUND — while the build reported READY and the local suite
 * stayed green, because nothing in the gate had ever imported the production
 * entry point.
 *
 * It imports the entry's *source*. The bundle that actually deploys is checked
 * for drift by `scripts/check.sh`.
 */
const BASE = 'https://example.vercel.app';
const call = async (
  path: string,
  init: { method?: string; sid?: string; body?: unknown } = {},
) => {
  const method = init.method ?? 'GET';
  const handler = method === 'POST' ? POST : method === 'DELETE' ? DELETE : GET;
  const res = await handler(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(init.sid ? { 'x-mandate-session': init.sid } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, never> };
};

describe('the Vercel function entry', () => {
  it('serves the whole service under /api', async () => {
    const created = await call('/api/session', { method: 'POST' });
    expect(created.status).toBe(200);
    const view = created.json as unknown as {
      session: { id: string; customers: unknown[] };
      capabilities: { name: string }[];
    };
    expect(view.session.customers).toHaveLength(6);
    expect(view.capabilities).toHaveLength(5);

    const read = await call('/api/session', { sid: view.session.id });
    expect(read.status).toBe(200);
  });

  it('enforces the mandate on the agent path, through the deployed entry', async () => {
    const created = await call('/api/session', { method: 'POST' });
    const sid = (created.json as unknown as { session: { id: string } }).session.id;
    await call('/api/mandate', {
      method: 'POST',
      sid,
      body: { customerIds: ['c-atlas'], allowedFields: ['status'] },
    });

    const refused = await call('/api/tools/stage', {
      method: 'POST',
      sid,
      body: { customerId: 'c-kestrel', field: 'status', value: 'Active', mandateVersion: 1 },
    });
    expect((refused.json as unknown as { error: { code: string } }).error.code).toBe('OUT_OF_SCOPE');
  });

  it('has no apply route, and leaks nothing on a forged session', async () => {
    expect((await call('/api/tools/apply', { method: 'POST', sid: 's-x', body: {} })).status).toBe(404);

    const forged = await call('/api/session', { sid: 's-does-not-exist' });
    expect(forged.status).toBe(404);
    expect(JSON.stringify(forged.json)).not.toMatch(/stack|node_modules|TypeError/i);
  });
});
