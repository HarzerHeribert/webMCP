import { errors, MandateError } from './errors';
import { assertDelegatable, authorize, settleExpiry } from './policy';
import { DEFAULT_DOMAIN, domainOf } from './domains';
import { stageToolName } from './capabilities';
import type { SessionStore } from './store';
import type {
  Actor,
  Change,
  Resource,
  Session,
  TimelineEvent,
  TimelineKind,
} from './types';

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

/**
 * Hard bounds on how large one session can get.
 *
 * The demo is public and the store is a free tier. Without these, one script
 * staging long values in a loop grows a single session without limit until the
 * store is full and no judge can open one. Each is generous for a three-minute
 * demo and absurd for anything else.
 */
export const LIMITS = {
  /** A CRM field. The longest seeded value is 27 characters. */
  valueChars: 280,
  /** Distinct staged changes. The demo uses two. */
  changes: 50,
  /** Timeline events kept. Older ones are dropped, oldest first. */
  timeline: 300,
} as const;

export class MandateService {
  #store: SessionStore;
  #clock: Clock;

  constructor(store: SessionStore, clock: Clock = systemClock) {
    this.#store = store;
    this.#clock = clock;
  }

  // ── session lifecycle ────────────────────────────────────────────────────

  async createSession(domainId: string = DEFAULT_DOMAIN): Promise<Session> {
    const now = this.#clock.now();
    const domain = domainOf(domainId);
    const session: Session = {
      id: uid('s'),
      createdAt: now,
      revision: 1,
      mandateVersion: 0,
      domainId: domain.id,
      resources: seed(domain),
      selectedResourceIds: [],
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
  /**
   * Move this session to a different host application. Everything the mandate
   * touched belonged to the old host's records, so this is a reset — the point
   * being demonstrated is that the *compiler and the enforcement* are unchanged,
   * not that a mandate survives a change of universe.
   */
  async switchHost(id: string, domainId: string): Promise<Session> {
    const session = await this.read(id);
    const domain = domainOf(domainId);
    session.domainId = domain.id;
    session.revision = 1;
    session.mandateVersion = 0;
    session.resources = seed(domain);
    session.selectedResourceIds = [];
    session.mandate = null;
    session.changes = [];
    session.timeline = [];
    this.#log(
      session,
      'SESSION_RESET',
      'human',
      `Host application switched to ${domain.product}.`,
      `The capability compiler and the server are unchanged. Only the records, ` +
        `the field names and the compiled tool surface differ.`,
    );
    await this.#store.put(session);
    return session;
  }

  async reset(id: string): Promise<Session> {
    const session = await this.read(id);
    session.revision = 1;
    session.mandateVersion = 0;
    session.resources = seed(domainOf(session.domainId));
    session.selectedResourceIds = [];
    session.mandate = null;
    session.changes = [];
    session.timeline = [];
    this.#log(session, 'SESSION_RESET', 'human', 'Session reset to the seeded state.');
    await this.#store.put(session);
    return session;
  }

  // ── selection: proposes scope, grants nothing ────────────────────────────

  async setSelection(id: string, resourceIds: string[]): Promise<Session> {
    const session = await this.read(id);
    const known = new Set(session.resources.map((c) => c.id));
    session.selectedResourceIds = resourceIds.filter((c) => known.has(c));
    this.#log(
      session,
      'SELECTION_CHANGED',
      'human',
      session.selectedResourceIds.length === 0
        ? 'Selection cleared.'
        : `${session.selectedResourceIds.length} ${domainOf(session.domainId).noun}(s) selected. Selection grants no authority.`,
    );
    await this.#store.put(session);
    return session;
  }

  // ── mandate ──────────────────────────────────────────────────────────────

  async createMandate(
    id: string,
    input: { resourceIds: string[]; allowedFields: string[]; ttlMs?: number },
  ): Promise<Session> {
    const session = await this.read(id);
    const now = this.#clock.now();
    const fields = assertDelegatable(domainOf(session.domainId), input.allowedFields);
    const known = new Set(session.resources.map((c) => c.id));
    const resourceIds = input.resourceIds.filter((c) => known.has(c));

    if (resourceIds.length === 0 || fields.length === 0) {
      throw errors.badRequest(
        `A mandate must name at least one ${domainOf(session.domainId).noun} and one field.`,
        'Choose what to delegate, then delegate again.',
      );
    }

    const previous = session.mandate;
    const narrowing = previous?.status === 'ACTIVE';
    session.mandateVersion += 1;
    session.mandate = {
      id: narrowing ? previous.id : uid('m'),
      version: session.mandateVersion,
      status: 'ACTIVE',
      resourceIds,
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
        : `Mandate granted over ${resourceIds.length} ${domainOf(session.domainId).noun}(s) and ${fields.length} field(s).`,
      `${resourceIds.map((c) => this.#name(session, c)).join(', ')} · ${fields.join(', ')}`,
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
    input: { resourceId: string; field: string; after: string },
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
      resourceId: string;
      field: string;
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
        resourceId: input.resourceId,
        field: input.field,
      });
    } catch (e) {
      await this.#logRefusal(session, stageToolName(domainOf(session.domainId)), e, input.resourceId);
      throw e;
    }
    if (input.changeVersion !== undefined) {
      const target = session.changes.find(
        (c) => c.resourceId === input.resourceId && c.field === input.field && c.state !== 'APPLIED',
      );
      if (target && target.version !== input.changeVersion) {
        const e = errors.changeVersionConflict(
          `This change was edited to version ${target.version} after the call was ` +
            `made against version ${input.changeVersion}.`,
          'Read the workspace again and re-issue the update against the current value.',
          { changeId: target.id, calledVersion: input.changeVersion, currentVersion: target.version },
        );
        await this.#logRefusal(session, stageToolName(domainOf(session.domainId)), e, input.resourceId);
        throw e;
      }
    }
    const result = await this.#stage(session, 'agent', input.mandateVersion, input);
    this.#log(
      session,
      'TOOL_CALL',
      'agent',
      `${stageToolName(domainOf(session.domainId))} accepted for ${this.#name(session, input.resourceId)}.`,
      `${input.field} → ${input.after}`,
      { changeId: result.change.id, resourceId: input.resourceId, tool: stageToolName(domainOf(session.domainId)) },
    );
    await this.#store.put(session);
    return result;
  }

  async #stage(
    session: Session,
    actor: Actor,
    mandateVersion: number | null,
    input: { resourceId: string; field: string; after: string },
  ): Promise<{ session: Session; change: Change }> {
    const resource = this.#resource(session, input.resourceId);
    const domain = domainOf(session.domainId);
    if (!domain.fields.some((f) => f.key === input.field)) {
      throw errors.badRequest(
        `Unknown field "${input.field}" for ${domain.product}.`,
        `Fields in this host are: ${domain.fields.map((f) => f.key).join(', ')}.`,
      );
    }
    if (input.after.length > LIMITS.valueChars) {
      throw errors.badRequest(
        `That value is ${input.after.length} characters; the limit is ${LIMITS.valueChars}.`,
        'Send a value a person would actually type into that field.',
      );
    }
    const now = this.#clock.now();

    // One staged change per (resource, field). A second stage on the same target
    // edits the existing change rather than queueing a second one — that is what
    // makes the co-edit in FR-005 a shared entity rather than two opinions.
    const existing = session.changes.find(
      (c) => c.resourceId === input.resourceId && c.field === input.field && c.state !== 'APPLIED',
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
        `${actor === 'human' ? 'Human' : 'Agent'} changed ${input.field} for ${resource.name} to "${input.after}".`,
        existing.touchedBy.length > 1 ? 'This change has now been edited by both the human and the agent.' : undefined,
        { changeId: existing.id, resourceId: resource.id },
      );
      await this.#store.put(session);
      return { session, change: existing };
    }

    if (session.changes.filter((c) => c.state !== 'APPLIED').length >= LIMITS.changes) {
      throw errors.badRequest(
        `This session already has ${LIMITS.changes} staged changes.`,
        'Apply or discard some before staging more.',
      );
    }

    const change: Change = {
      id: uid('ch'),
      resourceId: input.resourceId,
      field: input.field,
      before: resource.values[input.field] ?? '',
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
      `${actor === 'human' ? 'Human' : 'Agent'} staged ${input.field} for ${resource.name}.`,
      `${change.before} → ${change.after}`,
      { changeId: change.id, resourceId: resource.id },
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
    this.#log(session, 'CHANGE_DISCARDED', 'human', `Discarded the staged change to ${change.field} for ${this.#name(session, change.resourceId)}.`, undefined, { resourceId: change.resourceId });
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
      const resource = this.#resource(session, change.resourceId);
      change.before = resource.values[change.field] ?? '';
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
        `Rebased ${change.field} for ${resource.name} onto revision ${session.revision}.`,
        `Intended value preserved: "${change.after}". Now reads ${change.before} → ${change.after}.`,
        { changeId: change.id, resourceId: resource.id },
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
      const resource = this.#resource(session, change.resourceId);
      resource.values[change.field] = change.after;
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
        .map((c) => `${this.#name(session, c.resourceId)} · ${c.field}: ${c.before} → ${c.after} (staged by ${c.touchedBy.join(' then ')})`)
        .join('\n'),
    );
    await this.#store.put(session);
    return session;
  }

  // ── the deterministic external update that creates the conflict beat ─────

  async simulateExternalUpdate(id: string): Promise<Session> {
    const session = await this.read(id);
    // Fixed per domain, so the conflict beat lands identically every time.
    const { resourceId, field, value } = domainOf(session.domainId).externalUpdate;
    const resource = this.#resource(session, resourceId);
    const was = resource.values[field] ?? '';
    resource.values[field] = was === value ? `${value} (again)` : value;
    session.revision += 1;
    this.#log(
      session,
      'EXTERNAL_UPDATE',
      'system',
      `Another user changed ${resource.name}. The record is now at revision ${session.revision}.`,
      `${field}: ${was} → ${resource.values[field]}`,
      { resourceId: resource.id },
    );
    await this.#store.put(session);
    return session;
  }

  // ── internals ────────────────────────────────────────────────────────────

  #resource(session: Session, id: string): Resource {
    const c = session.resources.find((x) => x.id === id);
    if (!c) throw errors.notFound(`No ${domainOf(session.domainId).noun} "${id}" in this session.`);
    return c;
  }

  #name(session: Session, id: string): string {
    return session.resources.find((c) => c.id === id)?.name ?? id;
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
    // The timeline is the only unbounded structure here: it grows with every
    // action forever. Keep the newest and drop the rest, so a session cannot
    // grow without limit no matter how long someone drives it.
    if (session.timeline.length > LIMITS.timeline) {
      session.timeline.splice(0, session.timeline.length - LIMITS.timeline);
    }
  }

  async #logRefusal(session: Session, tool: string, e: unknown, resourceId?: string): Promise<void> {
    const code = e instanceof MandateError ? e.envelope.code : 'BAD_REQUEST';
    const message = e instanceof Error ? e.message : String(e);
    this.#log(session, 'TOOL_REFUSED', 'agent', `${tool} refused: ${code}.`, message, {
      tool,
      errorCode: code,
      resourceId,
    });
    await this.#store.put(session);
  }
}

/** Field-level validation. Small on purpose: it exists so VALIDATION_FAILED is a
 *  real state with a real cause, not a decorative one. */
export function validateValue(field: string, value: string): string | undefined {
  if (value.trim() === '') return 'This field cannot be empty.';
  if (field === 'renewalDate' && value !== '—' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Renewal date must be YYYY-MM-DD, or “—” for none.';
  }
  if (field === 'nextAction' && value.trim().length < 4) {
    return 'Next action needs at least a few words to be actionable.';
  }
  return undefined;
}

/** A fresh copy of a domain's records, so a reset cannot hand back objects a
 *  previous session mutated. */
function seed(domain: { records: readonly Resource[] }): Resource[] {
  return domain.records.map((r) => ({ ...r, values: { ...r.values } }));
}
