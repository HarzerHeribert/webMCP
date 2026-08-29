import { errors, MandateError } from './errors';
import { assertDelegatable, authorize, settleExpiry } from './policy';
import { EXTERNAL_UPDATE_TARGET, seedCustomers } from './seed';
import type { SessionStore } from './store';
import type {
  Actor,
  Change,
  Customer,
  CustomerField,
  Session,
  TimelineEvent,
  TimelineKind,
} from './types';
import { CUSTOMER_FIELDS } from './types';

/**
 * The authoritative application service. The human interface and the WebMCP
 * tool path both call these methods; there is no privileged agent route and no
 * apply method reachable from the agent path (`docs/12_DECISIONS.md` D-006).
 *
 * `actor` is not a claim the caller makes about itself — it is which method was
 * called, and the transport decides that. `stageAsAgent` requires a mandate
 * version; `stageAsHuman` cannot be reached from a tool at all.
 */

let counter = 0;
const uid = (prefix: string) => `${prefix}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

export const DEFAULT_MANDATE_TTL_MS = 10 * 60 * 1000;

export class MandateService {
  #store: SessionStore;
  #clock: Clock;

  constructor(store: SessionStore, clock: Clock = systemClock) {
    this.#store = store;
    this.#clock = clock;
  }

  // ── session lifecycle ────────────────────────────────────────────────────

  async createSession(): Promise<Session> {
    const now = this.#clock.now();
    const session: Session = {
      id: uid('s'),
      createdAt: now,
      revision: 1,
      mandateVersion: 0,
      customers: seedCustomers(),
      selectedCustomerIds: [],
      mandate: null,
      changes: [],
      timeline: [],
    };
    this.#log(session, 'SESSION_CREATED', 'system', 'Session created with seeded Relay CRM data.');
    await this.#store.put(session);
    return session;
  }

  /** Every read settles expiry first: authority lapses by the clock, and a UI
   *  that has not polled must never be the reason a mandate looks alive. */
  async read(id: string): Promise<Session> {
    const session = await this.#store.get(id);
    if (!session) {
      throw errors.notFound('This session no longer exists.', 'Reload to start a fresh session.');
    }
    if (settleExpiry(session, this.#clock.now())) {
      this.#log(session, 'MANDATE_EXPIRED', 'system', 'The mandate expired. Its authority is gone.');
      this.#markStagedAgentWorkOrphaned(session);
      await this.#store.put(session);
    }
    return session;
  }

  /** Restores the deterministic seed and clears all mandates and changes.
   *  Keeps the session id, so the demo can be replayed without a reload. */
  async reset(id: string): Promise<Session> {
    const session = await this.read(id);
    session.revision = 1;
    session.mandateVersion = 0;
    session.customers = seedCustomers();
    session.selectedCustomerIds = [];
    session.mandate = null;
    session.changes = [];
    session.timeline = [];
    this.#log(session, 'SESSION_RESET', 'human', 'Session reset to the seeded state.');
    await this.#store.put(session);
    return session;
  }

  // ── selection: proposes scope, grants nothing ────────────────────────────

  async setSelection(id: string, customerIds: string[]): Promise<Session> {
    const session = await this.read(id);
    const known = new Set(session.customers.map((c) => c.id));
    session.selectedCustomerIds = customerIds.filter((c) => known.has(c));
    this.#log(
      session,
      'SELECTION_CHANGED',
      'human',
      session.selectedCustomerIds.length === 0
        ? 'Selection cleared.'
        : `${session.selectedCustomerIds.length} customer(s) selected. Selection grants no authority.`,
    );
    await this.#store.put(session);
    return session;
  }

  // ── mandate ──────────────────────────────────────────────────────────────

  async createMandate(
    id: string,
    input: { customerIds: string[]; allowedFields: string[]; ttlMs?: number },
  ): Promise<Session> {
    const session = await this.read(id);
    const now = this.#clock.now();
    const fields = assertDelegatable(input.allowedFields);
    const known = new Set(session.customers.map((c) => c.id));
    const customerIds = input.customerIds.filter((c) => known.has(c));

    if (customerIds.length === 0 || fields.length === 0) {
      throw errors.badRequest(
        'A mandate must name at least one customer and one field.',
        'Choose the customers and fields to delegate, then delegate again.',
      );
    }

    const previous = session.mandate;
    const narrowing = previous?.status === 'ACTIVE';
    session.mandateVersion += 1;
    session.mandate = {
      id: narrowing ? previous.id : uid('m'),
      version: session.mandateVersion,
      status: 'ACTIVE',
      customerIds,
      allowedFields: fields,
      createdAt: now,
      expiresAt: now + (input.ttlMs ?? DEFAULT_MANDATE_TTL_MS),
    };

    this.#log(
      session,
      narrowing ? 'MANDATE_NARROWED' : 'MANDATE_CREATED',
      'human',
      narrowing
        ? `Mandate replaced at version ${session.mandateVersion}. Calls made against the old version will be refused.`
        : `Mandate granted over ${customerIds.length} customer(s) and ${fields.length} field(s).`,
      `${customerIds.map((c) => this.#name(session, c)).join(', ')} · ${fields.join(', ')}`,
    );
    await this.#store.put(session);
    return session;
  }

  async revokeMandate(id: string): Promise<Session> {
    const session = await this.read(id);
    const m = session.mandate;
    if (!m || m.status !== 'ACTIVE') {
      throw errors.badRequest('There is no active mandate to revoke.', 'Nothing to do.');
    }
    m.status = 'REVOKED';
    m.endedAt = this.#clock.now();
    m.endedReason = 'REVOKED';
    this.#log(
      session,
      'MANDATE_REVOKED',
      'human',
      'Mandate revoked. The tool surface is withdrawn and the server will refuse further calls.',
    );
    this.#markStagedAgentWorkOrphaned(session);
    await this.#store.put(session);
    return session;
  }

  // ── staging: the human path and the agent path stage the same entity ─────

  async stageAsHuman(
    id: string,
    input: { customerId: string; field: CustomerField; after: string },
  ): Promise<{ session: Session; change: Change }> {
    const session = await this.read(id);
    return this.#stage(session, 'human', null, input);
  }

  /** The only way a tool can write. It cannot reach `stageAsHuman`, and the
   *  mandate version is required rather than inferred so a stale caller is
   *  refused instead of silently upgraded. */
  async stageAsAgent(
    id: string,
    input: {
      customerId: string;
      field: CustomerField;
      after: string;
      mandateVersion: number;
      /** The change version the caller believes it is editing. Optional on a
       *  first stage; naming a version that no longer exists is refused, which
       *  is how a co-edit race stops being a silent last-writer-wins. */
      changeVersion?: number;
    },
  ): Promise<{ session: Session; change: Change }> {
    const session = await this.read(id);
    try {
      authorize(session, {
        mandateVersion: input.mandateVersion,
        customerId: input.customerId,
        field: input.field,
      });
    } catch (e) {
      await this.#logRefusal(session, 'mandate_stage_customer_update', e, input.customerId);
      throw e;
    }
    if (input.changeVersion !== undefined) {
      const target = session.changes.find(
        (c) => c.customerId === input.customerId && c.field === input.field && c.state !== 'APPLIED',
      );
      if (target && target.version !== input.changeVersion) {
        const e = errors.changeVersionConflict(
          `This change was edited to version ${target.version} after the call was ` +
            `made against version ${input.changeVersion}.`,
          'Read the workspace again and re-issue the update against the current value.',
          { changeId: target.id, calledVersion: input.changeVersion, currentVersion: target.version },
        );
        await this.#logRefusal(session, 'mandate_stage_customer_update', e, input.customerId);
        throw e;
      }
    }
    const result = await this.#stage(session, 'agent', input.mandateVersion, input);
    this.#log(
      session,
      'TOOL_CALL',
      'agent',
      `mandate_stage_customer_update accepted for ${this.#name(session, input.customerId)}.`,
      `${input.field} → ${input.after}`,
      { changeId: result.change.id, customerId: input.customerId, tool: 'mandate_stage_customer_update' },
    );
    await this.#store.put(session);
    return result;
  }

  async #stage(
    session: Session,
    actor: Actor,
    mandateVersion: number | null,
    input: { customerId: string; field: CustomerField; after: string },
  ): Promise<{ session: Session; change: Change }> {
    const customer = this.#customer(session, input.customerId);
    if (!(CUSTOMER_FIELDS as readonly string[]).includes(input.field)) {
      throw errors.badRequest(`Unknown field "${input.field}".`, 'Use a field from the schema.');
    }
    const now = this.#clock.now();

    // One staged change per (customer, field). A second stage on the same target
    // edits the existing change rather than queueing a second one — that is what
    // makes the co-edit in FR-005 a shared entity rather than two opinions.
    const existing = session.changes.find(
      (c) => c.customerId === input.customerId && c.field === input.field && c.state !== 'APPLIED',
    );
    if (existing) {
      existing.after = input.after;
      existing.version += 1;
      existing.state = 'DRAFT';
      existing.updatedAt = now;
      existing.validationMessage = undefined;
      if (existing.touchedBy.at(-1) !== actor) existing.touchedBy.push(actor);
      if (actor === 'agent') existing.mandateVersion = mandateVersion;
      this.#log(
        session,
        'CHANGE_EDITED',
        actor,
        `${actor === 'human' ? 'Human' : 'Agent'} changed ${input.field} for ${customer.name} to "${input.after}".`,
        existing.touchedBy.length > 1 ? 'This change has now been edited by both the human and the agent.' : undefined,
        { changeId: existing.id, customerId: customer.id },
      );
      await this.#store.put(session);
      return { session, change: existing };
    }

    const change: Change = {
      id: uid('ch'),
      customerId: input.customerId,
      field: input.field,
      before: String(customer[input.field]),
      after: input.after,
      baseRevision: session.revision,
      version: 1,
      state: 'DRAFT',
      actor,
      mandateVersion,
      createdAt: now,
      updatedAt: now,
      touchedBy: [actor],
    };
    session.changes.push(change);
    this.#log(
      session,
      'CHANGE_STAGED',
      actor,
      `${actor === 'human' ? 'Human' : 'Agent'} staged ${input.field} for ${customer.name}.`,
      `${change.before} → ${change.after}`,
      { changeId: change.id, customerId: customer.id },
    );
    await this.#store.put(session);
    return { session, change };
  }

  async discardChange(id: string, changeId: string): Promise<Session> {
    const session = await this.read(id);
    const change = session.changes.find((c) => c.id === changeId);
    if (!change) throw errors.notFound('That staged change no longer exists.');
    if (change.state === 'APPLIED') {
      throw errors.badRequest(
        'An applied change is immutable.',
        'Stage a new change to correct it.',
      );
    }
    session.changes = session.changes.filter((c) => c.id !== changeId);
    this.#log(session, 'CHANGE_DISCARDED', 'human', `Discarded the staged change to ${change.field} for ${this.#name(session, change.customerId)}.`, undefined, { customerId: change.customerId });
    await this.#store.put(session);
    return session;
  }

  // ── validation, conflict, rebase ─────────────────────────────────────────

  /** Shared by the human button and `mandate_validate_changes`. Staged work
   *  based on a revision the world has moved past becomes STALE here — that is
   *  the only place a conflict is discovered, and it is server-side. */
  async validate(id: string, caller: { actor: Actor; mandateVersion?: number }): Promise<Session> {
    const session = await this.read(id);
    if (caller.actor === 'agent') {
      try {
        authorize(session, { mandateVersion: caller.mandateVersion ?? -1 });
      } catch (e) {
        await this.#logRefusal(session, 'mandate_validate_changes', e);
        throw e;
      }
    }

    let stale = 0;
    let ok = 0;
    for (const change of session.changes) {
      if (change.state === 'APPLIED') continue;
      if (change.baseRevision !== session.revision) {
        change.state = 'STALE';
        change.validationMessage =
          `Staged against revision ${change.baseRevision}; the record is now at revision ${session.revision}.`;
        stale += 1;
        continue;
      }
      const problem = validateValue(change.field, change.after);
      if (problem) {
        change.state = 'DRAFT';
        change.validationMessage = problem;
        continue;
      }
      change.state = 'VALIDATED';
      change.validationMessage = undefined;
      ok += 1;
    }

    this.#log(
      session,
      stale > 0 ? 'CONFLICT' : 'VALIDATED',
      caller.actor,
      stale > 0
        ? `Validation found ${stale} change(s) staged against an older revision.`
        : `${ok} change(s) validated and ready for the human to apply.`,
      stale > 0 ? 'Rebase keeps the intended value and re-bases it on the current record.' : undefined,
    );
    await this.#store.put(session);

    if (stale > 0) {
      throw errors.revisionConflict(
        `${stale} staged change(s) were made against an older revision of the record.`,
        'Rebase the staged changes: the intended value is kept and re-based on the current record.',
        { staleChangeIds: session.changes.filter((c) => c.state === 'STALE').map((c) => c.id), currentRevision: session.revision },
      );
    }
    return session;
  }

  /** Produces a fresh DRAFT that preserves the absolute intended value. This is
   *  why `Change.after` is a target and never a delta: rebasing a delta across a
   *  revision nobody saw would silently mean something else. */
  async rebase(id: string, caller: { actor: Actor; mandateVersion?: number }): Promise<Session> {
    const session = await this.read(id);
    if (caller.actor === 'agent') {
      try {
        authorize(session, { mandateVersion: caller.mandateVersion ?? -1 });
      } catch (e) {
        await this.#logRefusal(session, 'mandate_rebase_changes', e);
        throw e;
      }
    }

    let rebased = 0;
    for (const change of session.changes) {
      if (change.state !== 'STALE') continue;
      const customer = this.#customer(session, change.customerId);
      change.before = String(customer[change.field]);
      change.baseRevision = session.revision;
      change.version += 1;
      change.state = 'DRAFT';
      change.updatedAt = this.#clock.now();
      change.validationMessage = undefined;
      rebased += 1;
      this.#log(
        session,
        'REBASED',
        caller.actor,
        `Rebased ${change.field} for ${customer.name} onto revision ${session.revision}.`,
        `Intended value preserved: "${change.after}". Now reads ${change.before} → ${change.after}.`,
        { changeId: change.id, customerId: customer.id },
      );
    }
    if (rebased === 0) {
      throw errors.badRequest('There is nothing to rebase.', 'No staged change is stale.');
    }
    await this.#store.put(session);
    return session;
  }

  // ── apply: human only, at every layer ────────────────────────────────────

  /**
   * There is deliberately no agent-reachable counterpart to this method, no
   * `actor` parameter that could be passed `'agent'`, and no registered tool
   * that calls it. SEC-004 is enforced by the shape of the code, not by a check
   * inside it.
   */
  async applyAsHuman(id: string, expectedRevision?: number): Promise<Session> {
    const session = await this.read(id);
    const pending = session.changes.filter((c) => c.state !== 'APPLIED');
    if (pending.length === 0) {
      throw errors.badRequest('There is nothing staged to apply.');
    }
    const notReady = pending.filter((c) => c.state !== 'VALIDATED');
    if (notReady.length > 0) {
      throw errors.validationFailed(
        `${notReady.length} staged change(s) are not validated.`,
        'Validate the staged changes first; apply only commits validated work.',
        { changeIds: notReady.map((c) => c.id) },
      );
    }

    // VALIDATED is a claim about a moment, not a permit. The world can move
    // between validating and applying — and apply is the one irreversible act
    // here, so it re-checks rather than trusting the flag it was handed.
    if (expectedRevision !== undefined && expectedRevision !== session.revision) {
      throw errors.revisionConflict(
        `The record moved to revision ${session.revision} while this apply was being prepared.`,
        'Validate again to see what changed, then rebase and apply.',
        { expectedRevision, currentRevision: session.revision },
      );
    }
    const stale = pending.filter((c) => c.baseRevision !== session.revision);
    if (stale.length > 0) {
      for (const c of stale) {
        c.state = 'STALE';
        c.validationMessage =
          `Validated against revision ${c.baseRevision}; the record is now at revision ${session.revision}.`;
      }
      this.#log(
        session,
        'CONFLICT',
        'system',
        `Apply refused: ${stale.length} change(s) were validated against an older revision.`,
        'Nothing was committed. Rebase keeps the intended value and re-bases it on the current record.',
      );
      await this.#store.put(session);
      throw errors.revisionConflict(
        `${stale.length} change(s) were validated against revision ` +
          `${stale[0].baseRevision}, but the record is now at revision ${session.revision}. ` +
          'Nothing was committed.',
        'Rebase the staged changes: the intended value is kept and re-based on the current record.',
        { staleChangeIds: stale.map((c) => c.id), currentRevision: session.revision },
      );
    }

    const now = this.#clock.now();
    session.revision += 1;
    for (const change of pending) {
      const customer = this.#customer(session, change.customerId);
      (customer[change.field] as string) = change.after;
      change.state = 'APPLIED';
      change.appliedAt = now;
      change.baseRevision = session.revision;
    }
    this.#log(
      session,
      'APPLIED',
      'human',
      `Human applied ${pending.length} change(s). The record is now at revision ${session.revision}.`,
      pending
        .map((c) => `${this.#name(session, c.customerId)} · ${c.field}: ${c.before} → ${c.after} (staged by ${c.touchedBy.join(' then ')})`)
        .join('\n'),
    );
    await this.#store.put(session);
    return session;
  }

  // ── the deterministic external update that creates the conflict beat ─────

  async simulateExternalUpdate(id: string): Promise<Session> {
    const session = await this.read(id);
    const customer = this.#customer(session, EXTERNAL_UPDATE_TARGET);
    const wasOwner = customer.owner;
    customer.owner = wasOwner === 'Dana Whitfield' ? 'Ravi Menon' : 'Dana Whitfield';
    session.revision += 1;
    this.#log(
      session,
      'EXTERNAL_UPDATE',
      'system',
      `Another user changed ${customer.name}. The record is now at revision ${session.revision}.`,
      `owner: ${wasOwner} → ${customer.owner}`,
      { customerId: customer.id },
    );
    await this.#store.put(session);
    return session;
  }

  // ── internals ────────────────────────────────────────────────────────────

  #customer(session: Session, id: string): Customer {
    const c = session.customers.find((x) => x.id === id);
    if (!c) throw errors.notFound(`No customer "${id}" in this session.`);
    return c;
  }

  #name(session: Session, id: string): string {
    return session.customers.find((c) => c.id === id)?.name ?? id;
  }

  /** Staged agent work outlives the authority that produced it — deliberately.
   *  Revoking does not destroy the human's staged draft; it removes the agent's
   *  ability to touch it further. */
  #markStagedAgentWorkOrphaned(session: Session): void {
    for (const change of session.changes) {
      if (change.state === 'VALIDATED' && change.actor === 'agent') change.state = 'DRAFT';
    }
  }

  #log(
    session: Session,
    kind: TimelineKind,
    actor: Actor | 'system',
    summary: string,
    detail?: string,
    extra?: Partial<TimelineEvent>,
  ): void {
    const event: TimelineEvent = {
      id: uid('e'),
      at: this.#clock.now(),
      kind,
      actor,
      summary,
      detail,
      ...extra,
    };
    session.timeline.push(event);
  }

  async #logRefusal(session: Session, tool: string, e: unknown, customerId?: string): Promise<void> {
    const code = e instanceof MandateError ? e.envelope.code : 'BAD_REQUEST';
    const message = e instanceof Error ? e.message : String(e);
    this.#log(session, 'TOOL_REFUSED', 'agent', `${tool} refused: ${code}.`, message, {
      tool,
      errorCode: code,
      customerId,
    });
    await this.#store.put(session);
  }
}

/** Field-level validation. Small on purpose: it exists so VALIDATION_FAILED is a
 *  real state with a real cause, not a decorative one. */
export function validateValue(field: CustomerField, value: string): string | undefined {
  if (value.trim() === '') return 'This field cannot be empty.';
  if (field === 'renewalDate' && value !== '—' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Renewal date must be YYYY-MM-DD, or “—” for none.';
  }
  if (field === 'nextAction' && value.trim().length < 4) {
    return 'Next action needs at least a few words to be actionable.';
  }
  return undefined;
}
