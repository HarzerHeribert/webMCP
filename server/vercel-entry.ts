import { Hono } from 'hono';
import { createApp, notFoundJson } from './app';
import { redisQuota, unlimited } from './core/quota';
import { MemorySessionStore } from './core/store';
import { RedisSessionStore } from './core/redis-store';
import { RedisSocketStore } from './core/redis-socket-store';

/**
 * The Vercel entry (D-011). **`scripts/build-api.mjs` bundles this file into
 * `api/index.js`, which is what actually deploys** — see that script for why.
 * `vercel.json` rewrites every `/api/*` request here,
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
// Two shapes of binding exist and the platform picks one. Upstash's REST pair
// is the nicer fit for a lambda — nothing to connect or pool — but what is
// actually bound here is `REDIS_URL`, so the socket adapter is what runs.
// node-redis is not an option: it cannot survive bundling.
const store = RedisSessionStore.fromEnv(process.env) ?? RedisSocketStore.fromEnv(process.env);
if (store) {
  console.log(`[mandate] session store: ${store.constructor.name}`);
}
if (!store) {
  // Names only, never values: enough to tell from a log line whether the store
  // binding actually reached the function, without putting a token in a log.
  const seen = Object.keys(process.env)
    .filter((k) => /REDIS|KV_|UPSTASH/i.test(k))
    .sort();
  console.warn(
    '[mandate] no Upstash credentials (KV_REST_API_URL / UPSTASH_REDIS_REST_URL). ' +
      'Falling back to process memory: sessions will not survive between invocations. ' +
      `Store-shaped env keys present: ${seen.length ? seen.join(', ') : 'none'}. ` +
      'Bind REDIS_URL, or the UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN pair.',
  );
}

// The budget only exists when there is a shared store to count in. On process
// memory there is nothing to protect and nothing to coordinate.
const quota = store ? redisQuota(store) : unlimited;

const app = new Hono()
  .route('/api', createApp(store ?? new MemorySessionStore(), quota))
  .notFound(notFoundJson);

/**
 * Named method exports, not a default export.
 *
 * Vercel's Node runtime reads `export default` as the Node `(req, res)`
 * signature and *ignores the return value* — a handler that returns a `Response`
 * there simply never answers, and every request hangs to the 300-second
 * timeout. Named HTTP methods select the Web signature explicitly.
 */
const fetchHandler = (request: Request): Response | Promise<Response> => app.fetch(request);

export const GET = fetchHandler;
export const POST = fetchHandler;
export const DELETE = fetchHandler;
export const PATCH = fetchHandler;
export const PUT = fetchHandler;

// Deliberately no `export default`: Vercel prefers it when present, reads it as
// the Node `(req, res)` signature, and ignores the returned Response — which is
// what made every request hang to the 300-second timeout even after the named
// exports were added. Tests import `POST` and friends, same as the platform.
