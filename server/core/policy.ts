import { errors } from './errors';
import type { CustomerField, DelegatableField, Mandate, Session } from './types';
import { DELEGATABLE_FIELDS } from './types';

/**
 * The enforcement point. `docs/06_SECURITY_MODEL.md`: a WebMCP caller is an
 * untrusted tool caller, not an identified individual, so nothing a caller says
 * about its own authority is believed. The schema it read is communication; this
 * file is authorization.
 *
 * Every agent-path mutation passes through `authorize`. There is no second path,
 * and no privileged agent endpoint anywhere in the service.
 */

/** Lazily settle expiry. A mandate expires by the clock, not by a client call,
 *  so every read of authority must first ask what time it is. */
export function settleExpiry(session: Session, now: number): boolean {
  const m = session.mandate;
  if (!m || m.status !== 'ACTIVE' || now < m.expiresAt) return false;
  m.status = 'EXPIRED';
  m.endedAt = now;
  m.endedReason = 'EXPIRED';
  return true;
}

export interface AgentCall {
  mandateVersion: number;
  customerId?: string;
  field?: CustomerField;
}

/**
 * Refuse anything the human did not delegate, in the order that produces the
 * most useful error: is there authority at all, is it still alive, is it the
 * authority the caller thinks it is, and only then does it cover this target.
 *
 * Ordering matters for the demo as much as for correctness. A caller holding a
 * revoked mandate should be told the policy changed, not that it is out of
 * scope — the second is true but says the wrong thing about what happened.
 */
export function authorize(session: Session, call: AgentCall): Mandate {
  const m = session.mandate;

  if (!m || m.status === 'REVOKED') {
    throw errors.noActiveMandate(
      'No active mandate. The human has not delegated any authority for this session.',
      'Ask the human to delegate a scope, then read the capabilities again.',
      { mandateStatus: m?.status ?? 'NONE' },
    );
  }

  if (m.status === 'EXPIRED') {
    throw errors.mandateExpired(
      'The mandate expired. Authority granted for this session has lapsed.',
      'Ask the human to grant a new mandate; the staged work is untouched.',
      { expiredAt: m.expiresAt },
    );
  }

  if (call.mandateVersion !== m.version) {
    throw errors.policyChanged(
      `The mandate changed while this call was in flight. It was made against ` +
        `version ${call.mandateVersion}; the current version is ${m.version}.`,
      'Read the capabilities again and re-issue the call against the current scope.',
      { calledVersion: call.mandateVersion, currentVersion: m.version },
    );
  }

  if (call.customerId !== undefined && !m.customerIds.includes(call.customerId)) {
    throw errors.outOfScope(
      'That customer is not in the delegated scope.',
      'Only the customers listed in the mandate can be changed. Selecting a ' +
        'customer in the interface does not delegate it.',
      { customerId: call.customerId, allowedCustomerIds: m.customerIds },
    );
  }

  if (call.field !== undefined && !m.allowedFields.includes(call.field as DelegatableField)) {
    throw errors.outOfScope(
      `The field "${call.field}" is not in the delegated scope.`,
      'Only the fields listed in the mandate can be changed.',
      { field: call.field, allowedFields: m.allowedFields },
    );
  }

  return m;
}

/** Field names that a mandate may name at all. Applied when the mandate is
 *  created, so an over-broad delegation is impossible to express rather than
 *  merely refused later. */
export function assertDelegatable(fields: string[]): DelegatableField[] {
  const bad = fields.filter((f) => !(DELEGATABLE_FIELDS as readonly string[]).includes(f));
  if (bad.length) {
    throw errors.badRequest(
      `These fields can never be delegated: ${bad.join(', ')}.`,
      `Delegatable fields are: ${DELEGATABLE_FIELDS.join(', ')}.`,
      { rejected: bad },
    );
  }
  return fields as DelegatableField[];
}
