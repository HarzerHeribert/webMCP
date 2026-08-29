import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { CounterStore } from './quota';
import type { Session } from './types';

/**
 * A `SessionStore` over a `redis://` (or `rediss://`) URL, speaking RESP on a
 * socket, using nothing but Node builtins.
 *
 * WHY THIS IS HAND-WRITTEN
 * ------------------------
 * The platform binds `REDIS_URL`, not Upstash's REST pair, so the REST adapter
 * cannot be used. The obvious client — node-redis — **cannot be bundled**: once
 * inlined by esbuild it throws at import, verified by running the bundle in a
 * directory with no `node_modules`. Since the whole function ships as one
 * bundled file, a client that survives bundling is a hard requirement, and the
 * subset of RESP this needs is six commands.
 *
 * This is deliberately small and deliberately not a general Redis client: it
 * pipelines nothing, subscribes to nothing, and reconnects by throwing so the
 * next request starts a fresh connection. For a demo issuing a couple of GETs
 * and SETs per request, that is the right amount of machinery.
 */

type Reply = string | number | null;

export class RedisSocketStore implements CounterStore {
  #url: URL;
  #ttlSeconds: number;
  #socket: Socket | null = null;
  /** Serialises commands: RESP replies arrive in request order, so two
   *  in-flight commands on one socket would interleave their parsers. */
  #chain: Promise<unknown> = Promise.resolve();

  constructor(url: string, ttlSeconds = 1800) {
    this.#url = new URL(url);
    this.#ttlSeconds = ttlSeconds;
  }

  static fromEnv(env: Record<string, string | undefined>): RedisSocketStore | null {
    const url = env.REDIS_URL ?? env.KV_URL ?? env.STORAGE_REDIS_URL;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!/^rediss?:$/.test(parsed.protocol)) return null;
      return new RedisSocketStore(url);
    } catch {
      return null;
    }
  }

  // ── connection ───────────────────────────────────────────────────────────

  async #connected(): Promise<Socket> {
    if (this.#socket && !this.#socket.destroyed) return this.#socket;

    const secure = this.#url.protocol === 'rediss:';
    const port = Number(this.#url.port || (secure ? 6380 : 6379));
    const host = this.#url.hostname;

    const socket: Socket = await new Promise((resolve, reject) => {
      const s = secure
        ? tlsConnect({ host, port, servername: host }, () => resolve(s))
        : netConnect({ host, port }, () => resolve(s));
      s.once('error', reject);
      s.setTimeout(10_000, () => s.destroy(new Error('redis: socket timeout')));
    });
    // Past connect, an error must not be an unhandled event that kills the
    // process; the next command will see the destroyed socket and reconnect.
    socket.on('error', () => socket.destroy());
    this.#socket = socket;

    const password = decodeURIComponent(this.#url.password || '');
    const username = decodeURIComponent(this.#url.username || '');
    if (password) {
      await this.#send(socket, username ? ['AUTH', username, password] : ['AUTH', password]);
    }
    return socket;
  }

  /** Write one command and read exactly one reply. */
  #send(socket: Socket, args: (string | number)[]): Promise<Reply> {
    const encoded =
      `*${args.length}\r\n` +
      args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${String(a)}\r\n`).join('');

    return new Promise<Reply>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };
      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        const parsed = parseReply(buffer);
        if (parsed === undefined) return; // keep reading
        cleanup();
        if (parsed.error) reject(new Error(`redis: ${parsed.error}`));
        else resolve(parsed.value);
      };
      const onError = (e: Error) => {
        cleanup();
        reject(e);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('redis: connection closed'));
      };
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.write(encoded);
    });
  }

  #command(...args: (string | number)[]): Promise<Reply> {
    const run = async (): Promise<Reply> => {
      try {
        return await this.#send(await this.#connected(), args);
      } catch (e) {
        this.#socket?.destroy();
        this.#socket = null;
        throw e;
      }
    };
    const next = this.#chain.then(run, run);
    // Keep the chain alive regardless of this command's outcome.
    this.#chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  // ── SessionStore ─────────────────────────────────────────────────────────

  #key(id: string): string {
    return `mandate:${id}`;
  }

  async get(id: string): Promise<Session | undefined> {
    const raw = await this.#command('GET', this.#key(id));
    return typeof raw === 'string' ? (JSON.parse(raw) as Session) : undefined;
  }

  async put(session: Session): Promise<void> {
    await this.#command('SET', this.#key(session.id), JSON.stringify(session), 'EX', this.#ttlSeconds);
  }

  async delete(id: string): Promise<void> {
    await this.#command('DEL', this.#key(id));
  }

  // ── CounterStore, for the quota ──────────────────────────────────────────

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const n = Number(await this.#command('INCR', key));
    if (n === 1) await this.#command('EXPIRE', key, ttlSeconds);
    return n;
  }

  async count(key: string): Promise<number> {
    const raw = await this.#command('GET', key);
    return typeof raw === 'string' ? Number(raw) || 0 : 0;
  }

  /** Tests and shutdown; a lambda never needs it. */
  close(): void {
    this.#socket?.destroy();
    this.#socket = null;
  }
}

/**
 * Parse one RESP reply. Returns `undefined` when the buffer holds only part of
 * a reply, so the caller keeps reading. Exported for its own tests: the parser
 * is the part of this file most likely to be wrong.
 */
export function parseReply(buf: Buffer): { value: Reply; error?: string } | undefined {
  const end = buf.indexOf('\r\n');
  if (end === -1) return undefined;
  const kind = buf[0];
  const head = buf.subarray(1, end).toString();

  switch (kind) {
    case 0x2b: // '+' simple string
      return { value: head };
    case 0x2d: // '-' error
      return { value: null, error: head };
    case 0x3a: // ':' integer
      return { value: Number(head) };
    case 0x24: {
      // '$' bulk string
      const len = Number(head);
      if (len === -1) return { value: null };
      const start = end + 2;
      if (buf.length < start + len + 2) return undefined;
      return { value: buf.subarray(start, start + len).toString() };
    }
    default:
      // Arrays and the RESP3 types are unused here; treating one as a protocol
      // error is better than silently returning something wrong.
      return { value: null, error: `unsupported reply type ${String.fromCharCode(kind)}` };
  }
}
