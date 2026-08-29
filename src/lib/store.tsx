import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api, type ClientSession, type ErrorEnvelope } from './api';

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
  /** Set when the very first session could not be opened at all — a dead API,
   *  not a refusal. Distinct from `lastError`, which is a refusal the server
   *  chose to make. */
  bootError: string | null;
  retryBoot(): void;
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
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [revisionPulse, setRevisionPulse] = useState(0);
  const lastRevision = useRef<number>(0);

  // A cheap signature of everything the interface renders. The expiry poll
  // returns an identical payload most of the time, and replacing state anyway
  // re-rendered the entire workbench several times a second — which is what
  // "the UI feels unresponsive" actually was.
  const signature = (v: ClientSession) =>
    [
      v.session.revision,
      v.session.mandateVersion,
      v.session.mandate?.status ?? '-',
      v.session.selectedCustomerIds.join(','),
      v.session.changes.length,
      v.session.changes.map((c) => `${c.id}:${c.version}:${c.state}`).join(','),
      v.session.timeline.length,
      v.capabilities.map((d) => d.availability).join(','),
    ].join('|');

  const lastSignature = useRef<string>('');

  const absorb = useCallback((next: unknown) => {
    if (!next || typeof next !== 'object' || !('session' in next)) return;
    const v = next as ClientSession;
    if (v.session.revision !== lastRevision.current) {
      lastRevision.current = v.session.revision;
      setRevisionPulse((n) => n + 1);
    }
    const sig = signature(v);
    if (sig === lastSignature.current) return;
    lastSignature.current = sig;
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

  // A failed boot must say so. Swallowing it left the page on "Opening a
  // session…" forever, which is what a dead API looked like from the outside:
  // no error, no retry, nothing to act on.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setBootError(null);
      try {
        const opened = await api.open();
        if (!cancelled) absorb(opened);
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [absorb, bootAttempt]);

  // A mandate expires by the clock. Without this poll the interface would keep
  // claiming authority that the server has already let lapse.
  useEffect(() => {
    if (!view?.session.mandate || view.session.mandate.status !== 'ACTIVE') return;
    // Expiry is a clock event, so this only has to be frequent enough that the
    // panel is not visibly stale. Every second was four network round trips per
    // countdown tick's worth of churn for no added truth.
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [view?.session.mandate?.status, view?.session.mandate?.version, refresh, view?.session.mandate]);

  const value = useMemo<StoreValue>(
    () => ({
      view,
      loading,
      bootError,
      retryBoot: () => setBootAttempt((n) => n + 1),
      lastError,
      revisionPulse,
      clearError: () => setLastError(null),
      run,
      refresh,
    }),
    [view, loading, bootError, lastError, revisionPulse, run, refresh],
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
