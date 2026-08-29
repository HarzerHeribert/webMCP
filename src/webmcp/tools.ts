import { ApiError, agentApi, type ClientSession, type ErrorEnvelope } from '../lib/api.ts';

/**
 * The WebMCP tool implementations. Every mutating call goes through
 * `agentApi` — the same agent-path routes `server/app.ts` exposes, and
 * nothing else — so a refusal here is the exact refusal the real backend
 * would hand a real agent. The two read-only tools make no network call at
 * all: the workspace and the capability schedule are already the session view
 * the human's own screen is built from, so a tool call just reads it.
 *
 * `docs/06_SECURITY_MODEL.md`: a refused tool call is information the caller
 * deserves, not an exception to swallow — every implementation below returns
 * `{ ok: false, error }` with the server's own `ErrorEnvelope` on refusal, and
 * only re-throws for something that is not an `ApiError` at all (a genuine bug,
 * not a policy refusal).
 */

export interface ToolRuntime {
  /** The freshest known session view, read at call time rather than at
   *  registration time — a read tool must answer with current data even
   *  between re-registrations. */
  getSession(): ClientSession;
  /** Pulls the latest server-truth view after a mutation or a refusal, so the
   *  timeline and staged-changes panels reflect what the call did —
   *  including the `TOOL_REFUSED` entry the server logs before it throws. */
  refresh(): Promise<void>;
}

export interface ToolSuccess<T = unknown> {
  ok: true;
  data: T;
}
export interface ToolFailure {
  ok: false;
  error: ErrorEnvelope;
}
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

const ok = <T,>(data: T): ToolSuccess<T> => ({ ok: true, data });
const fail = (error: ErrorEnvelope): ToolFailure => ({ ok: false, error });
const badRequest = (message: string): ToolFailure =>
  fail({ code: 'BAD_REQUEST', message, recoverable: true });

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' ? v : undefined;
}
function num(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export type ToolName =
  | 'mandate_get_workspace'
  | 'mandate_get_capabilities'
  | 'mandate_stage_customer_update'
  | 'mandate_validate_changes'
  | 'mandate_rebase_changes';

export type ToolImplementations = Record<ToolName, (input: Record<string, unknown>) => Promise<ToolResult>>;

export function createToolImplementations(rt: ToolRuntime): ToolImplementations {
  return {
    async mandate_get_workspace() {
      const { session } = rt.getSession();
      return ok({
        revision: session.revision,
        customers: session.customers,
        selectedCustomerIds: session.selectedCustomerIds,
        changes: session.changes,
      });
    },

    async mandate_get_capabilities() {
      const view = rt.getSession();
      return ok({
        mandate: view.session.mandate,
        tools: view.capabilities.map(({ name, description, readOnly, availability, availabilityReason }) => ({
          name,
          description,
          readOnly,
          availability,
          availabilityReason,
        })),
        neverRegistered: view.neverRegistered,
      });
    },

    async mandate_stage_customer_update(input) {
      const customerId = str(input, 'customerId');
      const field = str(input, 'field');
      const value = str(input, 'value');
      const mandateVersion = num(input, 'mandateVersion');
      if (!customerId || !field || value === undefined || mandateVersion === undefined) {
        return badRequest('customerId, field, value, and mandateVersion are all required.');
      }
      try {
        await agentApi.stage(customerId, field, value, mandateVersion);
        await rt.refresh();
        return ok({ staged: true, customerId, field, value });
      } catch (e) {
        await rt.refresh();
        if (e instanceof ApiError) return fail(e.envelope);
        throw e;
      }
    },

    async mandate_validate_changes(input) {
      const mandateVersion = num(input, 'mandateVersion');
      if (mandateVersion === undefined) return badRequest('mandateVersion is required.');
      try {
        // Use the mutation's own response, not a subsequent `getSession()` —
        // the latter is synced from a React ref that only catches up on the
        // next render, so a call chained immediately after this one (as the
        // simulated caller does) could otherwise read a render behind.
        const { session } = await agentApi.validate(mandateVersion);
        await rt.refresh();
        return ok({
          validated: session.changes.filter((c) => c.state === 'VALIDATED').length,
          stale: session.changes.filter((c) => c.state === 'STALE').length,
        });
      } catch (e) {
        await rt.refresh();
        if (e instanceof ApiError) return fail(e.envelope);
        throw e;
      }
    },

    async mandate_rebase_changes(input) {
      const mandateVersion = num(input, 'mandateVersion');
      if (mandateVersion === undefined) return badRequest('mandateVersion is required.');
      try {
        const { session } = await agentApi.rebase(mandateVersion);
        await rt.refresh();
        return ok({ rebased: session.changes.filter((c) => c.state === 'DRAFT').length });
      } catch (e) {
        await rt.refresh();
        if (e instanceof ApiError) return fail(e.envelope);
        throw e;
      }
    },
  };
}
