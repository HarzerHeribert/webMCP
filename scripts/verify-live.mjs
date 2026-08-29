/**
 * Verify a deployed origin. There is no CI, and the deploy has broken in ways
 * every local check was green through — a bad module specifier, a default export
 * the platform ignores, a store that silently fell back to memory. This asks the
 * live URL the questions those failures would have answered.
 *
 *   node scripts/verify-live.mjs https://your-origin
 */
const BASE = process.argv[2];
const api = async (path, { method = 'GET', sid, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(sid ? { 'x-mandate-session': sid } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 160) }; }
  return { status: res.status, json };
};
const ok = (c, msg, extra = '') => console.log(`${c ? ' PASS' : ' FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`);

console.log(`\n=== ${BASE} ===\n`);

// 1. static origin
const page = await fetch(BASE);
const html = await page.text();
ok(page.status === 200 && html.includes('<div id="root">'), 'the client is served from the origin', `${page.status}`);

// 2. session creation on the same origin
const a = await api('/session', { method: 'POST' });
const sidA = a.json.session?.id;
ok(a.status === 200 && a.json.session?.customers?.length === 6, 'POST /api/session seeds six accounts', sidA);
ok(a.json.capabilities?.length === 5, 'five tool descriptors compiled', `${a.json.capabilities?.length}`);

// 3. THE ONE THAT MATTERS: does the session survive a later, probably-different invocation?
await new Promise((r) => setTimeout(r, 6000));
const reread = await api('/session', { sid: sidA });
ok(reread.status === 200 && reread.json.session?.id === sidA,
   'the session survives a later invocation (Redis is bound)',
   reread.status === 404 ? 'GONE — the store fell back to process memory' : 'same id');

// 4. cross-session isolation
const b = await api('/session', { method: 'POST' });
const sidB = b.json.session.id;
await api('/selection', { method: 'POST', sid: sidA, body: { customerIds: ['c-atlas'] } });
const bView = await api('/session', { sid: sidB });
ok(bView.json.session.selectedCustomerIds.length === 0, "session B cannot see session A's selection");

// 5. a forged id is refused, and says nothing internal
const forged = await api('/session', { sid: 's-does-not-exist' });
const leaks = /stack|node_modules|at Object|TypeError|Error:/i.test(JSON.stringify(forged.json));
ok(forged.status === 404, 'a forged session id is refused', `${forged.status}`);
ok(!leaks, 'the refusal discloses nothing internal', JSON.stringify(forged.json.error?.code));

// 6. the agent path is enforced server-side
await api('/mandate', { method: 'POST', sid: sidA, body: { customerIds: ['c-atlas'], allowedFields: ['status'] } });
const outOfScope = await api('/tools/stage', { method: 'POST', sid: sidA,
  body: { customerId: 'c-kestrel', field: 'status', value: 'Active', mandateVersion: 1 } });
ok(outOfScope.json.error?.code === 'OUT_OF_SCOPE', 'an undelegated customer is refused OUT_OF_SCOPE', `${outOfScope.status}`);
const staleVersion = await api('/tools/stage', { method: 'POST', sid: sidA,
  body: { customerId: 'c-atlas', field: 'status', value: 'Active', mandateVersion: 99 } });
ok(staleVersion.json.error?.code === 'POLICY_CHANGED', 'a stale mandate version is refused POLICY_CHANGED');

// 7. there is no apply tool, and no apply route
const applyRoute = await api('/tools/apply', { method: 'POST', sid: sidA, body: {} });
ok(applyRoute.status === 404, 'POST /api/tools/apply does not exist', `${applyRoute.status}`);
const names = (a.json.capabilities ?? []).map((d) => d.name);
ok(!names.some((n) => /apply/i.test(n)), 'no compiled tool is named apply', names.join(', '));

// 8. deterministic reset
await api('/session/reset', { method: 'POST', sid: sidA });
const after = await api('/session', { sid: sidA });
ok(after.json.session.mandate === null && after.json.session.changes.length === 0 &&
   after.json.session.customers[0].status === 'At risk', 'reset restores the seed and clears authority');
