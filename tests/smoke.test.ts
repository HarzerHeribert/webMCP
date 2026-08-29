import { describe, expect, it } from 'vitest';
import { MandateService } from '../server/core/service.ts';
import { MemorySessionStore } from '../server/core/store.ts';
import { MandateError } from '../server/core/errors.ts';

/** M0/M2 smoke. The full suite is the `tests` packet's; this exists so the gate
 *  is never green on an empty run. */
describe('foundation', () => {
  const svc = () => new MandateService(new MemorySessionStore());

  it('seeds a session deterministically and resets back to it', async () => {
    const s = svc();
    const a = await s.createSession();
    expect(a.customers).toHaveLength(6);
    await s.stageAsHuman(a.id, { customerId: 'c-atlas', field: 'status', after: 'Active' });
    const reset = await s.reset(a.id);
    expect(reset.changes).toHaveLength(0);
    expect(reset.customers).toEqual((await s.createSession()).customers);
  });

  it('M2 GATE: a selected but undelegated customer cannot be written by the agent path', async () => {
    const s = svc();
    const session = await s.createSession();
    await s.setSelection(session.id, ['c-atlas', 'c-kestrel']);
    await s.createMandate(session.id, { customerIds: ['c-atlas'], allowedFields: ['status'] });

    await expect(
      s.stageAsAgent(session.id, {
        customerId: 'c-kestrel',
        field: 'status',
        after: 'Active',
        mandateVersion: 1,
      }),
    ).rejects.toSatisfy((e) => e instanceof MandateError && e.envelope.code === 'OUT_OF_SCOPE');
  });
});
