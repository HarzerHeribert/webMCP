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
  provideContext?(context: { tools: ModelContextTool[] }): void;
  registerTool?(tool: ModelContextTool): ToolHandle;
}

declare global {
  interface Navigator {
    modelContext?: ModelContextApi;
  }
}

function getApi(): ModelContextApi | undefined {
  if (typeof navigator === 'undefined') return undefined;
  try {
    return navigator.modelContext ?? undefined;
  } catch {
    return undefined;
  }
}

/** Feature detection, and nothing more. Never throws. */
export function isWebMcpAvailable(): boolean {
  const api = getApi();
  return !!api && (typeof api.provideContext === 'function' || typeof api.registerTool === 'function');
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
      const handles = tools.map((tool) => {
        try {
          return api.registerTool!(tool);
        } catch {
          return undefined;
        }
      });
      cleanup = () => {
        for (const handle of handles) {
          try {
            if (typeof handle === 'function') handle();
            else if (handle && typeof handle.remove === 'function') handle.remove();
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
