/**
 * The only module in the application allowed to touch `navigator.modelContext`.
 * Everything else — the provider, the inspector, the simulated caller — goes
 * through this file's exports.
 *
 * Chrome's WebMCP surface (`docs/05_WEBMCP_CONTRACT.md`) is a page-scoped API,
 * behind a flag, that may simply not exist in a given browser. Nothing here
 * assumes it does: every export feature-detects, never throws past its own
 * boundary, and always hands back a cleanup function that is safe to call even
 * when there was nothing to clean up.
 */

/** The small interface the provider registers, and the same shape a no-op
 *  registration (API absent) is happy to be handed. */
export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

type ToolHandle = (() => void) | { remove?: () => void } | void;

interface ModelContextApi {
  /** The shape most write-ups describe. Chrome 152 does not have it. */
  provideContext?(context: { tools: ModelContextTool[] }): void;
  /** What Chrome 152 actually has. Returns a promise; ignores a repeat name. */
  registerTool?(tool: ModelContextTool): ToolHandle | Promise<void>;
  getTools?(): unknown;
  executeTool?(tool: unknown, args: string): unknown;
}

declare global {
  interface Navigator {
    modelContext?: ModelContextApi;
  }
  interface Document {
    modelContext?: ModelContextApi;
  }
}

/**
 * Where the host might have put it.
 *
 * The specification says `navigator.modelContext`, and this looked only there —
 * which is how a run inside ChatGPT's in-app browser reported "no WebMCP" while
 * that browser was reaching for `document.modelContext`. An embedder is free to
 * hang the object somewhere else, and a page that checks one location cannot
 * tell "absent" from "somewhere I did not look".
 */
const LOCATIONS: { label: string; read: () => unknown }[] = [
  { label: 'navigator.modelContext', read: () => globalThis.navigator?.modelContext },
  { label: 'window.modelContext', read: () => (globalThis as Record<string, unknown>).modelContext },
  { label: 'document.modelContext', read: () => globalThis.document?.modelContext },
];

function findApi(): { api: ModelContextApi; where: string } | undefined {
  for (const location of LOCATIONS) {
    try {
      const found = location.read();
      if (found && typeof found === 'object') {
        return { api: found as ModelContextApi, where: location.label };
      }
    } catch {
      /* a cross-origin or throwing accessor is simply not it */
    }
  }
  return undefined;
}

function getApi(): ModelContextApi | undefined {
  return findApi()?.api;
}

/** What the page can actually see, for detection and for saying so out loud. */
export interface WebMcpProbe {
  /** A model-context object was found in some form, somewhere. */
  present: boolean;
  /** Which location it came from, for the same diagnostic reason as `methods`. */
  where: string | null;
  /** Method names found on it — reported so an unfamiliar shape is diagnosable
   *  rather than silently indistinguishable from an absent API. */
  methods: string[];
  /** One of the registration methods this adapter knows how to drive. */
  usable: boolean;
  /**
   * Whether a registration can be withdrawn again.
   *
   * False on Chrome 152, which offers `registerTool` and nothing to undo it —
   * no unregister, no clear, and a repeat name is ignored rather than replacing
   * the entry. The interface must not imply a withdrawal it cannot perform.
   * Enforcement is unaffected: a stale tool's calls are still refused by the
   * server. See `docs/20_WEBMCP_FIELD_NOTES.md`.
   */
  canUnregister: boolean;
}

/** Feature detection, and nothing more. Never throws. */
export function probeWebMcp(): WebMcpProbe {
  const found = findApi();
  if (!found) return { present: false, where: null, methods: [], usable: false, canUnregister: false };
  const { api, where } = found;
  let methods: string[] = [];
  try {
    const own = Object.getOwnPropertyNames(api);
    const proto = Object.getPrototypeOf(api) as object | null;
    const inherited = proto && proto !== Object.prototype ? Object.getOwnPropertyNames(proto) : [];
    methods = [...new Set([...own, ...inherited])]
      .filter((k) => k !== 'constructor')
      .filter((k) => {
        try {
          return typeof (api as unknown as Record<string, unknown>)[k] === 'function';
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    /* an exotic proxy: presence still counts */
  }
  const canProvide = typeof api.provideContext === 'function';
  const usable = canProvide || typeof api.registerTool === 'function';
  return { present: true, where, methods, usable, canUnregister: canProvide };
}

/** Kept for callers that only need the yes/no. */
export function isWebMcpAvailable(): boolean {
  return probeWebMcp().usable;
}

const noop = () => {};

/**
 * Registers `tools` with the browser's WebMCP surface, preferring
 * `provideContext` — which replaces the whole tool set atomically, the shape
 * this app wants, since a narrowed mandate must never leave a stale tool live
 * (MCP-001) — and falling back to per-tool `registerTool` otherwise.
 *
 * Returns a cleanup function. Call it before the next registration and on
 * unmount; pass an `AbortSignal` to also clean up automatically on abort.
 * Always safe to call — including when the API turned out to be absent or
 * only partially implemented, in which case this is a no-op from the start.
 */
export function registerWebMcpTools(tools: WebMcpTool[], signal?: AbortSignal): () => void {
  const api = getApi();
  if (!api || signal?.aborted) return noop;

  let cleanup = noop;
  try {
    if (typeof api.provideContext === 'function') {
      api.provideContext({ tools });
      cleanup = () => {
        try {
          api.provideContext?.({ tools: [] });
        } catch {
          /* best-effort teardown */
        }
      };
    } else if (typeof api.registerTool === 'function') {
      // Chrome 152 returns a promise here and offers nothing to undo the
      // registration; other browsers may return a handle. Keep whatever comes
      // back and call it only if it looks like one — an unhandled rejection
      // from a promise would otherwise take the page down.
      const handles = tools.map((tool) => {
        try {
          const h = api.registerTool!(tool);
          if (h && typeof (h as Promise<void>).then === 'function') {
            (h as Promise<void>).catch(() => {});
            return undefined;
          }
          return h;
        } catch {
          return undefined;
        }
      });
      cleanup = () => {
        for (const handle of handles) {
          try {
            if (typeof handle === 'function') handle();
            else if (handle && typeof (handle as { remove?: () => void }).remove === 'function') {
              (handle as { remove: () => void }).remove();
            }
          } catch {
            /* best-effort teardown */
          }
        }
      };
    }
  } catch {
    return noop;
  }

  if (!signal) return cleanup;

  let disposed = false;
  const onAbort = () => {
    if (disposed) return;
    disposed = true;
    cleanup();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return () => {
    signal.removeEventListener('abort', onAbort);
    onAbort();
  };
}
