import { Hono, type Context } from 'hono';
import { compileCapabilities, NEVER_REGISTERED } from './core/capabilities';
import { MandateError } from './core/errors';
import { MandateService } from './core/service';
import { MemorySessionStore, type SessionStore } from './core/store';
import type { Session } from './core/types';
import { CUSTOMER_FIELDS, CUSTOMER_STATUSES, DELEGATABLE_FIELDS } from './core/types';

/**
 * One service, two callers. `docs/16`: the human interface and the tool path
 * call the same routes; nothing here is reachable only by an agent, and the one
 * route an agent must never reach (`/apply`) has no agent-path counterpart.
 *
 * The session id travels in a header rather than a cookie so the isolation is
 * explicit and testable, and so a forged id is an ordinary request to reject
 * rather than an ambient credential.
 */

export const SESSION_HEADER = 'x-mandate-session';

export interface ClientSession {
  session: Session;
  capabilities: ReturnType<typeof compileCapabilities>;
  neverRegistered: typeof NEVER_REGISTERED;
  schema: {
    customerFields: typeof CUSTOMER_FIELDS;
    delegatableFields: typeof DELEGATABLE_FIELDS;
    statuses: typeof CUSTOMER_STATUSES;
  };
}

function view(session: Session): ClientSession {
  return {
    session,
    capabilities: compileCapabilities(session),
    neverRegistered: NEVER_REGISTERED,
    schema: {
      customerFields: CUSTOMER_FIELDS,
      delegatableFields: DELEGATABLE_FIELDS,
      statuses: CUSTOMER_STATUSES,
    },
  };
}

/**
 * An unknown route is still an API answer. Hono's default 404 is plain text,
 * which breaks the envelope `docs/16_API_AND_ERROR_MODEL.md` promises — and the
 * most important 404 this service returns is `/tools/apply`, where a caller
 * deserves to be told in the same shape as every other refusal.
 *
 * Exported because a sub-app's `notFound` does not propagate through Hono's
 * `.route()` mount: the Vercel entry mounts this service and has to set it too.
 */
export const notFoundJson = (c: Context) =>
  c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'No such route.',
        recoverable: false,
        recovery: 'Read mandate_get_capabilities for the tools that exist.',
      },
    },
    404,
  );

export function createApp(store: SessionStore = new MemorySessionStore()) {
  const service = new MandateService(store);
  const app = new Hono();

  app.notFound(notFoundJson);

  app.onError((err, c) => {
    if (err instanceof MandateError) {
      return c.json({ error: err.envelope }, err.httpStatus as 400);
    }
    // Never leak internals to the client (`docs/10`).
    console.error('[mandate] unhandled', err);
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'The request could not be completed.', recoverable: false } },
      500,
    );
  });

  const sid = (c: { req: { header(name: string): string | undefined } }) => {
    const id = c.req.header(SESSION_HEADER);
    if (!id) throw new MandateError({ code: 'BAD_REQUEST', message: 'Missing session.', recoverable: false }, 400);
    return id;
  };

  app.post('/session', async (c) => c.json(view(await service.createSession())));
  app.get('/session', async (c) => c.json(view(await service.read(sid(c)))));
  app.post('/session/reset', async (c) => c.json(view(await service.reset(sid(c)))));

  app.post('/selection', async (c) => {
    const { customerIds } = await c.req.json<{ customerIds: string[] }>();
    return c.json(view(await service.setSelection(sid(c), customerIds ?? [])));
  });

  app.post('/mandate', async (c) => {
    const body = await c.req.json<{ customerIds: string[]; allowedFields: string[]; ttlMs?: number }>();
    return c.json(view(await service.createMandate(sid(c), body)));
  });
  app.post('/mandate/revoke', async (c) => c.json(view(await service.revokeMandate(sid(c)))));

  // ── human path ───────────────────────────────────────────────────────────
  app.post('/changes', async (c) => {
    const body = await c.req.json<{ customerId: string; field: never; after: string }>();
    const { session } = await service.stageAsHuman(sid(c), body);
    return c.json(view(session));
  });
  app.delete('/changes/:id', async (c) =>
    c.json(view(await service.discardChange(sid(c), c.req.param('id')))),
  );
  app.post('/changes/validate', async (c) =>
    c.json(view(await service.validate(sid(c), { actor: 'human' }))),
  );
  app.post('/changes/rebase', async (c) =>
    c.json(view(await service.rebase(sid(c), { actor: 'human' }))),
  );

  /** Human-only, by construction. There is no `/tools/apply`, and the service
   *  exposes no method this route could share with the agent path. */
  app.post('/changes/apply', async (c) => {
    const body = await c.req
      .json<{ expectedRevision?: number }>()
      .catch((): { expectedRevision?: number } => ({}));
    return c.json(view(await service.applyAsHuman(sid(c), body.expectedRevision)));
  });

  app.post('/simulate/external-update', async (c) =>
    c.json(view(await service.simulateExternalUpdate(sid(c)))),
  );

  // ── agent path: exactly the registered tools, nothing more ───────────────
  app.post('/tools/stage', async (c) => {
    const body = await c.req.json<{
      customerId: string;
      field: never;
      value: string;
      mandateVersion: number;
      changeVersion?: number;
    }>();
    const { session } = await service.stageAsAgent(sid(c), {
      customerId: body.customerId,
      field: body.field,
      after: body.value,
      mandateVersion: body.mandateVersion,
      changeVersion: body.changeVersion,
    });
    return c.json(view(session));
  });
  app.post('/tools/validate', async (c) => {
    const { mandateVersion } = await c.req.json<{ mandateVersion: number }>();
    return c.json(view(await service.validate(sid(c), { actor: 'agent', mandateVersion })));
  });
  app.post('/tools/rebase', async (c) => {
    const { mandateVersion } = await c.req.json<{ mandateVersion: number }>();
    return c.json(view(await service.rebase(sid(c), { actor: 'agent', mandateVersion })));
  });

  return app;
}
