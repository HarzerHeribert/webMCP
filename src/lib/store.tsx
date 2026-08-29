import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api, type ClientSession, type ErrorEnvelope } from './api.ts';

/**
 * One store, one truth. Every mutation returns the whole server view, and the
 * client never derives authority locally — if the panel says a mandate is
 * active, it is because the server said so on the last round trip.
 *
 * The `lastError` field is deliberately session-wide rather than per-component:
 * an OUT_OF_SCOPE refusal is a thing that happened to the session, and the demo
 * needs it visible next to the authority that refused it.
 */

interface StoreValue {
  view: ClientSession | null;
  loading: boolean;
  lastError: ErrorEnvelope | null;
  /** Bumped whenever the server revision changes, so readouts can flash. */
  revisionPulse: number;
  clearError(): void;
  run<T = ClientSession>(fn: () => Promise<T>): Promise<T | null>;
  refresh(): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<ErrorEnvelope | null>(null);
  const [revisionPulse, setRevisionPulse] = useState(0);
  const lastRevision = useRef<number>(0);

  const absorb = useCallback((next: unknown) => {
    if (!next || typeof next !== 'object' || !('session' in next)) return;
    const v = next as ClientSession;
    if (v.session.revision !== lastRevision.current) {
      lastRevision.current = v.session.revision;
      setRevisionPulse((n) => n + 1);
    }
    setView(v);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setLastError(null);
      try {
        const result = await fn();
        absorb(result);
        return result;
      } catch (e) {
        if (e instanceof ApiError) {
          setLastError(e.envelope);
          // A refusal is still an event the server recorded; pull the timeline
          // so the audience sees the refusal land where it belongs.
          try {
            absorb(await api.refresh());
          } catch {
            /* the refusal was the interesting part */
          }
          return null;
        }
        throw e;
      }
    },
    [absorb],
  );

  const refresh = useCallback(async () => {
    try {
      absorb(await api.refresh());
    } catch {
      /* transient */
    }
  }, [absorb]);

  useEffect(() => {
    void (async () => {
      try {
        absorb(await api.open());
      } finally {
        setLoading(false);
      }
    })();
  }, [absorb]);

  // A mandate expires by the clock. Without this poll the interface would keep
  // claiming authority that the server has already let lapse.
  useEffect(() => {
    if (!view?.session.mandate || view.session.mandate.status !== 'ACTIVE') return;
    const id = setInterval(() => void refresh(), 1000);
    return () => clearInterval(id);
  }, [view?.session.mandate?.status, view?.session.mandate?.version, refresh, view?.session.mandate]);

  const value = useMemo<StoreValue>(
    () => ({ view, loading, lastError, revisionPulse, clearError: () => setLastError(null), run, refresh }),
    [view, loading, lastError, revisionPulse, run, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/** The server view, once it exists. Panels render only inside `<Workbench>`,
 *  which does not mount until the session has loaded. */
export function useSession(): ClientSession {
  const { view } = useStore();
  if (!view) throw new Error('useSession before the session loaded');
  return view;
}
