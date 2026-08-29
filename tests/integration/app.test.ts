import { describe, expect, it } from 'vitest';
import { createApp, SESSION_HEADER } from '../../server/app';

/**
 * Integration layer: drives `createApp()` through Hono's built-in fetch
 * harness (`app.request(...)`) — no real server needed. This is where the
 * routing itself is on trial: which paths exist, what headers select which
 * session, and what a forged or cross-session request gets back.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

async function newSession(app: ReturnType<typeof createApp>) {
  const res = await app.request('/session', { method: 'POST' });
  return (await res.json()) as {
    session: { id: string; changes: unknown[]; selectedCustomerIds: string[] };
    capabilities: Array<{ name: string }>;
    neverRegistered: Array<{ name: string }>;
  };
}

describe('the human and agent paths share one service over HTTP', () => {
  it('a human change is visible in the workspace an agent reads next', async () => {
    const app = createApp();
    const created = await newSession(app);
    const sid = created.session.id;

    await app.request('/changes', {
      method: 'POST',
      headers: { [SESSION_HEADER]: sid, ...JSON_HEADERS },
      body: JSON.stringify({ customerId: 'c-solvent', field: 'nextAction', after: 'Call to confirm renewal' }),
    });

    // The agent path reads through exactly the same route the
    // `mandate_get_workspace` tool exposes: GET /session.
    const res = await app.request('/session', { headers: { [SESSION_HEADER]: sid } });
    const body = await res.json();
    const change = body.session.changes.find((c: { customerId: string }) => c.customerId === 'c-solvent');

    expect(change).toBeDefined();
    expect(change.after).toBe('Call to confirm renewal');
    expect(change.actor).toBe('human');
  });
});

describe('apply is unreachable at the HTTP layer', () => {
  it('POST /tools/apply 404s: no agent-reachable apply route exists', async () => {
    const app = createApp();
    const created = await newSession(app);

    const res = await app.request('/tools/apply', {
      method: 'POST',
      headers: { [SESSION_HEADER]: created.session.id, ...JSON_HEADERS },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });

  it("no compiled tool descriptor's name matches /apply/i", async () => {
    const app = createApp();
    const created = await newSession(app);

    const res = await app.request('/session', { headers: { [SESSION_HEADER]: created.session.id } });
    const body = await res.json();
    const names: string[] = body.capabilities.map((t: { name: string }) => t.name);

    expect(names.some((n) => /apply/i.test(n))).toBe(false);
    // NEVER_REGISTERED names `mandate_apply_changes` explicitly, so the
    // inspector can show it as structurally absent rather than merely
    // missing. The assertion above is what proves it never appears among
    // what is actually registered.
    expect(body.neverRegistered.some((t: { name: string }) => t.name === 'mandate_apply_changes')).toBe(true);
  });
});

describe('session isolation', () => {
  it("session A's id cannot read session B's data", async () => {
    const app = createApp();
    const a = await newSession(app);
    const b = await newSession(app);

    // Give B a distinguishing mutation so leakage into A would be observable.
    await app.request('/selection', {
      method: 'POST',
      headers: { [SESSION_HEADER]: b.session.id, ...JSON_HEADERS },
      body: JSON.stringify({ customerIds: ['c-holloway'] }),
    });

    const readA = await app.request('/session', { headers: { [SESSION_HEADER]: a.session.id } });
    const bodyA = await readA.json();
    expect(bodyA.session.id).toBe(a.session.id);
    expect(bodyA.session.selectedCustomerIds).toEqual([]); // untouched by B's mutation

    // A forged id — close to a real one but not equal to it — is rejected
    // outright, never silently served someone else's session.
    const forged = await app.request('/session', { headers: { [SESSION_HEADER]: `${b.session.id}x` } });
    expect(forged.status).toBe(404);
  });

  it("session A's id cannot write session B's data", async () => {
    const app = createApp();
    const a = await newSession(app);
    const b = await newSession(app);

    // Mutate under A's header only.
    await app.request('/selection', {
      method: 'POST',
      headers: { [SESSION_HEADER]: a.session.id, ...JSON_HEADERS },
      body: JSON.stringify({ customerIds: ['c-atlas'] }),
    });

    const readB = await app.request('/session', { headers: { [SESSION_HEADER]: b.session.id } });
    const bodyB = await readB.json();
    expect(bodyB.session.selectedCustomerIds).toEqual([]); // B is untouched by a mutation issued under A's id
  });
});
