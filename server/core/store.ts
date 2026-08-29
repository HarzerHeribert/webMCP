import type { Session } from './types.ts';

/**
 * The storage port. Everything above it is pure domain logic, so the deployment
 * target stays a late decision (`capability-map` M8) rather than a rewrite.
 *
 * Async by contract even though the demo adapter is synchronous — a D1 or
 * Durable Object adapter is not, and discovering that at M8 would mean touching
 * every call site.
 */
export interface SessionStore {
  get(id: string): Promise<Session | undefined>;
  put(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
}

/** In-memory adapter. Sessions are anonymous, seeded and disposable, so process
 *  lifetime is the correct durability for the demo. */
export class MemorySessionStore implements SessionStore {
  #sessions = new Map<string, Session>();

  async get(id: string): Promise<Session | undefined> {
    return this.#sessions.get(id);
  }

  async put(session: Session): Promise<void> {
    this.#sessions.set(session.id, session);
  }

  async delete(id: string): Promise<void> {
    this.#sessions.delete(id);
  }
}
