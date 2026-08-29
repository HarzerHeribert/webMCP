import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ToolDescriptor } from '../../server/core/capabilities';
import { useSession, useStore } from '../lib/store';
import { probeWebMcp, registerWebMcpTools } from './adapter';
import type { WebMcpProbe, WebMcpTool } from './adapter';
import { createToolImplementations } from './tools';
import type { ToolImplementations, ToolResult } from './tools';

export type { ToolResult } from './tools';

/**
 * CONTRACT — `Header.tsx` reads `status`, `statusLabel`, `toolNames`, and
 * `descriptors` only; those four fields are load-bearing and keep their shape.
 * `invoke` is new: it is what lets `AgentConsole` call the exact function this
 * provider would hand a real browser, whether or not one is actually
 * listening (MCP-001's "only when the API is available" governs the browser
 * registration below, not this in-process call path).
 */
export interface WebMcpState {
  /** `registered` once the compiled, in-scope tool set has been handed to a
   *  real `navigator.modelContext`; `unavailable` when the browser has no
   *  WebMCP API at all, which must still leave a fully usable interface. */
  status: 'idle' | 'registered' | 'unavailable';
  statusLabel: string;
  /** The names actually passed to the browser. Empty whenever `status` is not
   *  `registered` — nothing was actually handed to a browser to be live. */
  toolNames: string[];
  /** The compiled descriptors currently marked `registered` by
   *  `compileCapabilities` — exactly the entries from
   *  `useSession().capabilities` the inspector must mirror (M3), and exactly
   *  the tool set this provider registers whenever a browser exists to
   *  register it with. */
  descriptors: ToolDescriptor[];
  /** What the page could actually see on `navigator.modelContext`. Reported so
   *  an unfamiliar shape is diagnosable instead of being indistinguishable from
   *  no API at all — which is what a judge in an unfamiliar browser hits. */
  probe: WebMcpProbe;
  /** Runs a tool's real implementation directly — the same function a live
   *  WebMCP call would run — so the simulated caller is not a fake. Refuses
   *  anything not currently in `descriptors`. */
  invoke(name: string, input: Record<string, unknown>): Promise<ToolResult>;
}

const noProbe: WebMcpProbe = { present: false, where: null, methods: [], usable: false, canUnregister: false };

const idleInvoke: WebMcpState['invoke'] = async () => ({
  ok: false,
  error: { code: 'BAD_REQUEST', message: 'WebMCP provider not mounted.', recoverable: false },
});

const fallback: WebMcpState = {
  status: 'idle',
  statusLabel: 'starting',
  toolNames: [],
  descriptors: [],
  probe: noProbe,
  invoke: idleInvoke,
};

const Ctx = createContext<WebMcpState>(fallback);

export function WebMcpProvider({ children }: { children: ReactNode }) {
  const view = useSession();
  const { refresh } = useStore();

  // Tool implementations always read the *latest* session through this ref,
  // not the one closed over when they were built — a read tool must answer
  // with current data even between re-registrations.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const toolImpls: ToolImplementations = useMemo(
    () => createToolImplementations({ getSession: () => viewRef.current, refresh }),
    [refresh],
  );

  const mandate = view.session.mandate;
  // Every content change to a mandate (a fresh grant, a narrowing, a revoke)
  // bumps `version` or flips `status`; nothing else changes what the compiler
  // marks `registered`. Keying re-registration off this pair — rather than
  // the `capabilities` array's identity, which is a new reference on every
  // poll — is what keeps a healthy mandate from being torn down and rebuilt
  // every second while nothing has actually changed.
  const signature = `${mandate?.version ?? 0}:${mandate?.status ?? 'NONE'}`;

  // Keyed on mandate identity (`signature`), not the `capabilities` array's
  // identity, which is a fresh reference on every poll — see the comment
  // above `signature`.
  const registered = useMemo(() => view.capabilities.filter((d) => d.availability === 'registered'), [signature]);

  const [state, setState] = useState<Omit<WebMcpState, 'invoke'>>({
    status: 'idle',
    statusLabel: 'starting',
    toolNames: [],
    descriptors: [],
  probe: noProbe,
  });

  // MCP-001: register through the one adapter, only when the API is
  // available, and tear the previous registration down first — a stale tool
  // surviving a narrowing is exactly the failure this effect exists to
  // prevent, since it re-runs (cleanup, then re-register) every time
  // `registered` changes identity.
  // A host can inject `navigator.modelContext` after first paint. Detecting
  // once and settling on "unavailable" would then be permanently wrong, and
  // indistinguishable — to the user — from a browser that truly has no WebMCP.
  // Re-probe for a few seconds, then stop.
  const [probeTick, setProbeTick] = useState(0);
  useEffect(() => {
    if (probeWebMcp().present) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      if (probeWebMcp().present || ticks >= 16) {
        clearInterval(id);
        setProbeTick((n) => n + 1);
      } else {
        setProbeTick((n) => n + 1);
      }
    }, 300);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tools: WebMcpTool[] = registered.map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema,
      execute: (input: Record<string, unknown>) => {
        const impl = toolImpls[d.name as keyof ToolImplementations];
        return impl
          ? impl(input)
          : Promise.resolve({
              ok: false,
              error: { code: 'BAD_REQUEST', message: `No implementation for "${d.name}".`, recoverable: false },
            } satisfies ToolResult);
      },
    }));

    const probe = probeWebMcp();
    const available = probe.usable;
    const cleanup = available ? registerWebMcpTools(tools) : () => {};

    setState({
      status: available ? 'registered' : 'unavailable',
      statusLabel: available
        ? `${tools.length} tool${tools.length === 1 ? '' : 's'} registered`
        : probe.present
          ? 'present, but this page cannot register with it'
          : 'unavailable',
      toolNames: available ? tools.map((t) => t.name) : [],
      descriptors: registered,
      probe,
    });

    return cleanup;
  }, [registered, toolImpls, probeTick]);

  // The simulated caller's entry point. Deliberately checked against the
  // compiled `registered` set rather than `toolNames`, so it keeps working
  // when the browser has no WebMCP API at all — that is the whole point of a
  // harness that can demonstrate the surface without one.
  const invoke = useCallback(
    async (name: string, input: Record<string, unknown>): Promise<ToolResult> => {
      if (!registered.some((d) => d.name === name)) {
        return {
          ok: false,
          error: {
            code: 'BAD_REQUEST',
            message: `"${name}" is not currently registered — it is not part of the live tool surface.`,
            recoverable: true,
          },
        };
      }
      const impl = toolImpls[name as keyof ToolImplementations];
      if (!impl) {
        return {
          ok: false,
          error: { code: 'BAD_REQUEST', message: `No implementation for "${name}".`, recoverable: false },
        };
      }
      return impl(input);
    },
    [registered, toolImpls],
  );

  const value = useMemo<WebMcpState>(() => ({ ...state, invoke }), [state, invoke]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWebMcp(): WebMcpState {
  return useContext(Ctx);
}
