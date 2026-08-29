import type { SessionStore } from './store.ts';
import type { Session } from './types.ts';

/**
 * Upstash Redis over its REST API — no SDK, because one `fetch` is the whole
 * integration and a dependency here would be larger than the code it replaces.
 *
 * Sessions are anonymous and disposable, so they carry a TTL and clean
 * themselves up. This exists because Vercel functions are stateless (D-011) and
 * the product's central claim — that revoking authority actually removes it —
 * requires the server to be the one holding the state.
 */
export class RedisSessionStore implements SessionStore {
  #url: string;
  #token: string;
  #ttlSeconds: number;

  constructor(url: string, token: string, ttlSeconds = 3600) {
    this.#url = url.replace(/\/$/, '');
    this.#token = token;
    this.#ttlSeconds = ttlSeconds;
  }

  static fromEnv(env: Record<string, string | undefined>): RedisSessionStore | null {
    const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
    return url && token ? new RedisSessionStore(url, token) : null;
  }

  async #command(...parts: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.#url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(parts.map(String)),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`redis: ${body.error}`);
    return body.result;
  }

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
}
