import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSession, useStore } from '../lib/store';
import { detectHost } from '../webmcp/host';
import type { WebMcpProbe } from '../webmcp/adapter';
import { useWebMcp } from '../webmcp/provider';

/**
 * The layer, what gates it, and the fact that it can be closed.
 *
 * Mandate is a **WebMCP** capability layer installed into a host application.
 * Two consequences the interface has to honour:
 *
 * 1. **Without WebMCP there is nothing for it to be.** In a browser with no
 *    `document.modelContext` the layer does not present itself as live — it
 *    explains what is missing and why *in terms of the host it is actually
 *    running in* (see `GateReason`), and offers the simulated caller as a
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
  // Stacked on a narrow viewport the layer opens *below* the account list, so
  // opening it looks like nothing happened until you scroll. Bring it into view.
  const panel = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    wasOpen.current = open;
  }, [open]);

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
      <section ref={panel} className="layer layer--gated" aria-label="Mandate requires WebMCP">
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
          <GateReason probe={webmcp.probe} />
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
    <section ref={panel} className="layer" aria-label="Mandate, the WebMCP capability layer">
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

/**
 * Why the layer will not claim to be live, said in terms the reader can act on.
 *
 * The gate is the screen a judge sees when something is wrong, so it is the one
 * place in the product where vague copy costs the most. WebMCP is reached two
 * ways and the remedy differs completely: in Chrome it is a flag the visitor
 * turns on; in the ChatGPT desktop app it is a shipped feature called *site
 * tools*, gated on the app version, a permission, and the model — and it does
 * not exist in the mobile app at all. `detectHost` only chooses which of those
 * to lead with; the probe, not the user agent, decides what is live.
 */
function GateReason({ probe }: { probe: WebMcpProbe }) {
  // A model-context object that is present but unusable is the most specific
  // thing we know, and it outranks any guess about the host.
  if (probe.present) {
    return (
      <>
        <h2 className="gate__title">
          This browser exposes WebMCP in a shape this page cannot use.
        </h2>
        <p className="gate__body">
          Mandate compiles a human&apos;s delegation into WebMCP tools that the page
          registers. A model-context object is here at <code>{probe.where}</code>, but it
          offers no <code>registerTool</code>
          {probe.methods.length > 0 && (
            <> — what it does offer is <code>{probe.methods.join(', ')}</code></>
          )}
          . Rather than guess at an unfamiliar shape, the layer does not claim to be live.
        </p>
      </>
    );
  }

  const host = detectHost();

  if (host === 'chatgpt-mobile') {
    return (
      <>
        <h2 className="gate__title">ChatGPT&apos;s site tools are desktop-only.</h2>
        <p className="gate__body">
          Mandate compiles a human&apos;s delegation into WebMCP tools that the page
          registers. WebMCP reaches a page here as <strong>site tools</strong>, and today
          that is the built-in browser in the <strong>ChatGPT desktop app</strong> — not
          the mobile app. Nothing was found at <code>document.modelContext</code>, so
          there is nothing to register into and the layer does not claim to be live.
        </p>
        <p className="gate__body">
          Open this page in the ChatGPT desktop app to see the real registration path, or
          run the demo here with the built-in simulated caller, which invokes the same
          tool implementations a browser would, with arguments you type.
        </p>
      </>
    );
  }

  if (host === 'chatgpt-desktop') {
    return (
      <>
        <h2 className="gate__title">
          ChatGPT has not exposed site tools to this page.
        </h2>
        <p className="gate__body">
          Mandate compiles a human&apos;s delegation into WebMCP tools that the page
          registers. WebMCP arrives here as <strong>site tools</strong>, and nothing was
          found at <code>document.modelContext</code> — so it is switched off, or this
          app predates it. Three things turn it on:
        </p>
        <ul className="gate__list">
          <li>update the ChatGPT desktop app to the latest version;</li>
          <li>
            enable <strong>Settings › Browser › Permissions › Enable site tools</strong>;
          </li>
          <li>
            use <strong>GPT-5.6 Sol</strong> or <strong>Terra</strong> — site tools are
            disabled on Luna.
          </li>
        </ul>
        <p className="gate__body">
          When it is on, an arrow appears in the address bar and this panel goes live by
          itself. Until then, run the demo with the built-in simulated caller, which
          invokes the same tool implementations a browser would.
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="gate__title">This browser has no WebMCP.</h2>
      <p className="gate__body">
        Mandate compiles a human&apos;s delegation into WebMCP tools that the page
        registers. Nothing was found at <code>document.modelContext</code>,{' '}
        <code>navigator.modelContext</code> or <code>window.modelContext</code>, so there
        is nothing to register into and the layer does not claim to be live.
      </p>
      <p className="gate__body">
        To see the real registration path, either turn on{' '}
        <code>chrome://flags/#enable-webmcp-testing</code> in Chrome — equivalently,
        launch it with <code>--enable-features=WebMCP</code>, which is what this repo
        measured — and reload, or open this page in the{' '}
        <strong>ChatGPT desktop app&apos;s</strong> built-in browser, which supports
        WebMCP out of the box. The API only appears on a secure origin.
      </p>
      <p className="gate__body">
        Or run the demo here with the built-in simulated caller, which invokes the same
        tool implementations a browser would, with arguments you type.
      </p>
    </>
  );
}
