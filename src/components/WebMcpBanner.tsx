import { useState } from 'react';
import { GateReason } from './MandateLayer';
import { useWebMcp } from '../webmcp/provider';

/**
 * WebMCP is missing, said once, loudly, without stopping anybody.
 *
 * This used to be a gate: the layer refused to present itself and made the
 * visitor take a labelled override before the demo would run. That was honest
 * and it was wrong. A judge in the ChatGPT mobile app, or in any browser
 * without the flag, cannot satisfy the dependency — so the gate charged them a
 * click and a decision to reach a demo that was always going to run the same
 * implementations anyway.
 *
 * The honesty was never in the blocking. It is in saying plainly that nothing
 * is registered with a real agent, which a banner does better than a wall: it
 * stays on screen for the whole session instead of being dismissed and
 * forgotten. What is behind the disclosure is the part that differs by host —
 * Chrome wants a flag, ChatGPT wants site tools, and the mobile app has none.
 */
export function WebMcpBanner() {
  const webmcp = useWebMcp();
  const [why, setWhy] = useState(false);

  // `idle` is "not asked yet". Flashing this before the adapter has looked
  // would tell a browser that *does* have WebMCP that it does not.
  if (webmcp.status !== 'unavailable') return null;

  return (
    <div className={`wmbanner${why ? ' wmbanner--open' : ''}`} role="status">
      <div className="wmbanner__line">
        <span className="wmbanner__code">WEBMCP_UNAVAILABLE</span>
        <span className="wmbanner__text">
          <strong>You are watching a simulated demo.</strong> This browser has no WebMCP, so
          no tool is registered with a real agent — the built-in simulated caller drives the
          same tool implementations, and the server enforces the same mandate on every call.
          In a WebMCP host, a real agent drives this same page.
        </span>
        <button
          className="wmbanner__why"
          aria-expanded={why}
          onClick={() => setWhy((w) => !w)}
        >
          {why ? 'Hide details' : 'Run it with a real agent'}
        </button>
      </div>
      {why && (
        <div className="wmbanner__detail">
          <GateReason probe={webmcp.probe} />
        </div>
      )}
    </div>
  );
}
