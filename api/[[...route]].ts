import { handle } from 'hono/vercel';
import { Hono } from 'hono';
import { createApp } from '../server/app.ts';
import { MemorySessionStore } from '../server/core/store.ts';
import { RedisSessionStore } from '../server/core/redis-store.ts';

/**
 * The Vercel entry (D-011). One function serves every `/api/*` route; the static
 * client is served from the same origin by the platform, so a page-registered
 * tool still calls exactly the URL a human click does.
 *
 * Without Redis credentials this falls back to process memory, which is correct
 * locally and wrong in production — the warning says so out loud rather than
 * letting a demo quietly lose sessions between invocations.
 */
const store = RedisSessionStore.fromEnv(process.env);
if (!store) {
  console.warn(
    '[mandate] no Upstash credentials — using process memory. Sessions will not survive between invocations.',
  );
}

const app = new Hono().route('/api', createApp(store ?? new MemorySessionStore()));

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);
