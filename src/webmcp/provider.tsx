import { createContext, useContext, type ReactNode } from 'react';
import type { ToolDescriptor } from '../../server/core/capabilities.ts';

/**
 * CONTRACT — owned by the `webmcp` worker. This stub exists so the shell
 * compiles before that worker lands; the worker replaces this file wholesale.
 *
 * The only module in the application permitted to touch `navigator.modelContext`
 * is `src/webmcp/adapter.ts`. Everything else consumes this hook.
 */

export interface WebMcpState {
  /** `registered` once tools are live; `unavailable` when the browser has no
   *  WebMCP API, which must still leave a fully usable human interface. */
  status: 'idle' | 'registered' | 'unavailable';
  statusLabel: string;
  /** The names actually passed to the browser, so the inspector can prove it
   *  mirrors reality rather than re-deriving it. */
  toolNames: string[];
  /** The compiled descriptors the registration was built from. */
  descriptors: ToolDescriptor[];
}

const fallback: WebMcpState = {
  status: 'idle',
  statusLabel: 'starting',
  toolNames: [],
  descriptors: [],
};

const Ctx = createContext<WebMcpState>(fallback);

export function WebMcpProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={fallback}>{children}</Ctx.Provider>;
}

export function useWebMcp(): WebMcpState {
  return useContext(Ctx);
}
