import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession, useStore } from '../lib/store';
import { useWebMcp } from '../webmcp/provider';

/**
 * The layer, what gates it, and the fact that it can be closed.
 *
 * Mandate is a **WebMCP** capability layer installed into a host application.
 * Two consequences the interface has to honour:
 *
 * 1. **Without WebMCP there is nothing for it to be.** In a browser with no
 *    `navigator.modelContext` the layer does not present itself as live — it
 *    explains what is missing and why, and offers the simulated caller as a
 *    deliberate, labelled override. Hiding the dependency would overstate the
 *    product; hiding the demo behind a browser flag would make it unjudgeable.
 * 2. **It is not part of the host.** Shut it and Relay CRM carries on being an
 *    ordinary CRM, which is the clearest statement of `docs/12_DECISIONS.md`
 *    D-002 available to a picture.
 *
 * One rule bounds the hiding: **live authority is never invisible.** With a
 * mandate active the closed rail is amber and names the version, because an
 * interface that could conceal a granted, unexpired scope would be lying about
 * the only thing this product asks to be trusted on.
 */
export function MandateLayer({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { lastError } = useStore();
  const webmcp = useWebMcp();
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(false);

  const mandate = session.mandate;
  const active = mandate?.status === 'ACTIVE' ? mandate : null;
  const selected = session.selectedCustomerIds.length;
  const staged = session.changes.filter((c) => c.state !== 'APPLIED').length;

  // `idle` is "not asked yet", not "absent" — gating on it would flash the
  // unavailable state on every load before the adapter has looked.
  const gated = webmcp.status === 'unavailable' && !override;

  // Only rising edges open it, so closing it stays closed. Gated, nothing
  // auto-opens: there is no capability surface to reveal.
  const prev = useRef({ selected: 0, active: false, staged: 0, error: false });
  useEffect(() => {
    const now = { selected, active: Boolean(active), staged, error: Boolean(lastError) };
    const rose =
      (now.selected > 0 && prev.current.selected === 0) ||
      (now.active && !prev.current.active) ||
      (now.staged > 0 && prev.current.staged === 0) ||
      (now.error && !prev.current.error);
    prev.current = now;
    if (rose && !gated) setOpen(true);
  }, [selected, active, staged, lastError, gated]);

  if (!open) {
    return (
      <button
        className={`layer-rail${active ? ' layer-rail--active' : ''}${gated ? ' layer-rail--gated' : ''}`}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label="Open the Mandate capability layer"
      >
        <span className="layer-rail__dot" aria-hidden />
        <span className="layer-rail__label">Mandate</span>
        <span className="layer-rail__status">
          {active
            ? `active · v${active.version}`
            : gated
              ? 'WebMCP required'
              : selected > 0
                ? `${selected} selected`
                : 'not in use'}
        </span>
      </button>
    );
  }

  if (gated) {
    return (
      <section className="layer layer--gated" aria-label="Mandate requires WebMCP">
        <header className="layer__chrome">
          <span className="layer__name">Mandate</span>
          <span className="layer__kind layer__kind--muted">WebMCP capability layer</span>
          <button
            className="btn btn--quiet btn--sm layer__close"
            onClick={() => setOpen(false)}
            aria-label="Close the Mandate capability layer"
          >
            Close
          </button>
        </header>

        <div className="gate">
          <span className="chip chip--warn gate__code">
            <span className="chip__dot" />
            WEBMCP_UNAVAILABLE
          </span>
          <h2 className="gate__title">This browser has no WebMCP.</h2>
          <p className="gate__body">
            Mandate compiles a human&apos;s delegation into WebMCP tools that the page
            registers. With no <code>navigator.modelContext</code> there is nothing to
            register into, so the layer does not claim to be live.
          </p>
          <p className="gate__body">
            Enable <code>#web-machine-learning-model-context</code> in{' '}
            <code>chrome://flags</code> and reload to see the real registration path — or
            run the demo here with the built-in simulated caller, which invokes the same
            tool implementations a browser would, with arguments you type.
          </p>
          <button className="btn btn--primary gate__go" onClick={() => setOverride(true)}>
            Run the demo with the simulated caller
          </button>
          <p className="gate__foot">
            Nothing else changes: the server enforces the same mandate on every call
            either way.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="layer" aria-label="Mandate, the WebMCP capability layer">
      <header className="layer__chrome">
        <span className="layer__name">Mandate</span>
        <span className="layer__kind">WebMCP capability layer</span>
        <span className="layer__note">
          Installed into Relay CRM. Not part of it — the same layer would run on any web app.
        </span>
        <button
          className="btn btn--quiet btn--sm layer__close"
          onClick={() => setOpen(false)}
          aria-expanded
          aria-label="Close the Mandate capability layer"
          title={
            active
              ? 'Close the layer. The mandate stays active and the rail keeps saying so.'
              : 'Close the layer. Relay CRM carries on without it.'
          }
        >
          Close
        </button>
      </header>
      {children}
    </section>
  );
}
