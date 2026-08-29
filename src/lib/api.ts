import type { ClientSession } from '../../server/app';
import type { ErrorEnvelope } from '../../server/core/errors';
import type { CustomerField } from '../../server/core/types';

export type { ClientSession };
export type { ErrorEnvelope };

const SESSION_KEY = 'mandate.session';
const HEADER = 'x-mandate-session';

export class ApiError extends Error {
  readonly envelope: ErrorEnvelope;
  constructor(envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = 'ApiError';
    this.envelope = envelope;
  }
}

let sessionId: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;

export function currentSessionId(): string | null {
  return sessionId;
}

function remember(id: string) {
  sessionId = id;
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* private mode — the session simply does not survive a reload */
  }
}

async function call(path: string, init: RequestInit = {}): Promise<ClientSession> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (sessionId) headers.set(HEADER, sessionId);
  const res = await fetch(`/api${path}`, { ...init, headers });
  const body = (await res.json()) as ClientSession | { error: ErrorEnvelope };
  if (!res.ok) throw new ApiError((body as { error: ErrorEnvelope }).error);
  const view = body as ClientSession;
  remember(view.session.id);
  return view;
}

const post = (path: string, body?: unknown) =>
  call(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

/** The human interface. Every call here is something a person clicked. */
export const api = {
  async open(): Promise<ClientSession> {
    if (sessionId) {
      try {
        return await call('/session');
      } catch {
        sessionId = null; // the server restarted; start clean rather than error
      }
    }
    return post('/session');
  },
  refresh: () => call('/session'),
  reset: () => post('/session/reset'),
  setSelection: (customerIds: string[]) => post('/selection', { customerIds }),
  delegate: (customerIds: string[], allowedFields: string[], ttlMs?: number) =>
    post('/mandate', { customerIds, allowedFields, ttlMs }),
  revoke: () => post('/mandate/revoke'),
  stage: (customerId: string, field: CustomerField, after: string) =>
    post('/changes', { customerId, field, after }),
  discard: (changeId: string) => call(`/changes/${changeId}`, { method: 'DELETE' }),
  validate: () => post('/changes/validate'),
  rebase: () => post('/changes/rebase'),
  /** Carries the revision the human was looking at. If the record moved between
   *  the last render and the click, apply refuses rather than committing over it. */
  apply: (expectedRevision: number) => post('/changes/apply', { expectedRevision }),
  simulateExternalUpdate: () => post('/simulate/external-update'),
};

/**
 * The agent path, reached only by the WebMCP tool implementations and the
 * simulated caller. It is a separate object for the same reason the server has
 * separate routes: so that "did a human do this, or a tool?" is answerable by
 * reading the call site.
 */
export const agentApi = {
  stage: (
    customerId: string,
    field: string,
    value: string,
    mandateVersion: number,
    changeVersion?: number,
  ) => post('/tools/stage', { customerId, field, value, mandateVersion, changeVersion }),
  validate: (mandateVersion: number) => post('/tools/validate', { mandateVersion }),
  rebase: (mandateVersion: number) => post('/tools/rebase', { mandateVersion }),
};
