import { Hono } from 'hono';
import { createApp, notFoundJson } from '../server/app';
import { MemorySessionStore } from '../server/core/store';
import { RedisSessionStore } from '../server/core/redis-store';

/**
 * The Vercel entry (D-011). `vercel.json` rewrites every `/api/*` request here,
 * so one function serves the whole service and the static client is served from
 * the same origin by the platform — a page-registered tool still calls exactly
 * the URL a human click does.
 *
 * The handler is a plain web-standard `Request -> Response`, which the Node
 * runtime accepts directly. No framework adapter sits in between, because there
 * is nothing for one to adapt.
 *
 * Without Redis credentials this falls back to process memory, which is correct
 * locally and wrong here — the warning says so out loud rather than letting a
 * demo quietly lose sessions between invocations.
 */
const store = RedisSessionStore.fromEnv(process.env);
if (!store) {
  console.warn(
    '[mandate] no Upstash credentials (KV_REST_API_URL / UPSTASH_REDIS_REST_URL). ' +
      'Falling back to process memory: sessions will not survive between invocations.',
  );
}

const app = new Hono()
  .route('/api', createApp(store ?? new MemorySessionStore()))
  .notFound(notFoundJson);

export default function handler(request: Request): Response | Promise<Response> {
  return app.fetch(request);
}
