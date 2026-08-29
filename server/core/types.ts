/**
 * The domain, exactly as `docs/03_DOMAIN_AND_STATE.md` states it.
 *
 * Two invariants are load-bearing and are the reason several of these fields
 * exist at all:
 *   1. Selection is not authority. Nothing here derives permission from a
 *      customer being selected — only from a Mandate that names it.
 *   2. Changes store absolute targets, not deltas, so a rebase can preserve the
 *      intended value across a revision it never saw.
 */

export const CUSTOMER_FIELDS = [
  'status',
  'nextAction',
  'owner',
  'renewalDate',
  'arr',
  'notes',
] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];

/** The fields a mandate is allowed to cover. `arr` and `notes` are deliberately
 *  excluded: money and free text are where an over-broad delegation hurts, and
 *  the demo needs a field that is visible but never delegable. */
export const DELEGATABLE_FIELDS = [
  'status',
  'nextAction',
  'owner',
  'renewalDate',
] as const satisfies readonly CustomerField[];
export type DelegatableField = (typeof DELEGATABLE_FIELDS)[number];

export const CUSTOMER_STATUSES = [
  'Prospect',
  'Trial',
  'Active',
  'At risk',
  'Churned',
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  id: string;
  name: string;
  segment: string;
  status: CustomerStatus;
  nextAction: string;
  owner: string;
  renewalDate: string;
  arr: string;
  /** Untrusted external content. Never an instruction to any tool. */
  notes: string;
}

export type MandateStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface Mandate {
  id: string;
  version: number;
  status: MandateStatus;
  customerIds: string[];
  allowedFields: DelegatableField[];
  createdAt: number;
  expiresAt: number;
  /** Set when the mandate leaves ACTIVE, so the timeline can say why. */
  endedAt?: number;
  endedReason?: 'REVOKED' | 'EXPIRED';
}

export type ChangeState = 'DRAFT' | 'VALIDATED' | 'STALE' | 'APPLIED';
export type Actor = 'human' | 'agent';

export interface Change {
  id: string;
  customerId: string;
  field: CustomerField;
  /** The value at the moment the change was staged, for the before → after read. */
  before: string;
  /** The absolute intended value. Never a delta. */
  after: string;
  baseRevision: number;
  version: number;
  state: ChangeState;
  actor: Actor;
  /** Null for human edits: a human needs no mandate to stage a change. */
  mandateVersion: number | null;
  createdAt: number;
  updatedAt: number;
  /** Every actor that has touched this change, in order. A change edited by both
   *  is the point of FR-005, so one `actor` field cannot carry the story. */
  touchedBy: Actor[];
  appliedAt?: number;
  validationMessage?: string;
}

export type TimelineKind =
  | 'SESSION_CREATED'
  | 'SESSION_RESET'
  | 'SELECTION_CHANGED'
  | 'MANDATE_CREATED'
  | 'MANDATE_REVOKED'
  | 'MANDATE_EXPIRED'
  | 'MANDATE_NARROWED'
  | 'TOOL_CALL'
  | 'TOOL_REFUSED'
  | 'CHANGE_STAGED'
  | 'CHANGE_EDITED'
  | 'CHANGE_DISCARDED'
  | 'VALIDATED'
  | 'CONFLICT'
  | 'REBASED'
  | 'APPLIED'
  | 'EXTERNAL_UPDATE';

export interface TimelineEvent {
  id: string;
  at: number;
  kind: TimelineKind;
  actor: Actor | 'system';
  summary: string;
  detail?: string;
  changeId?: string;
  customerId?: string;
  /** Present on TOOL_CALL / TOOL_REFUSED so the timeline can show the wire truth. */
  tool?: string;
  errorCode?: string;
}

export interface Session {
  id: string;
  createdAt: number;
  /** Bumped by every applied change and every simulated external update.
   *  Staged work carries the revision it was based on; that is the whole of
   *  optimistic concurrency here. */
  revision: number;
  mandateVersion: number;
  customers: Customer[];
  /** Proposes scope. Grants nothing. */
  selectedCustomerIds: string[];
  mandate: Mandate | null;
  changes: Change[];
  timeline: TimelineEvent[];
}
