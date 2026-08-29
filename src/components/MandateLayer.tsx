import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSession, useStore } from '../lib/store';
import { detectHost } from '../webmcp/host';
import type { WebMcpProbe } from '../webmcp/adapter';

/**
 * The layer, what gates it, and the fact that it can be closed.
 *
 * Mandate is a **WebMCP** capability layer installed into a host application.
 * Two consequences the interface has to honour:
 *
 * 1. **Without WebMCP nothing is registered with an agent**, and that is said
 *    plainly by `WebMcpBanner` — once, at the top, for the whole session, with
 *    the host-specific remedy behind a disclosure (`GateReason`, still here
 *    because this is where the copy lives). It used to be a gate that made the
 *    visitor take a labelled override first. That charged a click and a
 *    decision to somebody who often cannot satisfy the dependency at all, to
 *    reach a demo that was always going to run the same implementations. The
 *    honesty was never in the blocking.
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
  const [open, setOpen] = useState(false);

  const mandate = session.mandate;
  const active = mandate?.status === 'ACTIVE' ? mandate : null;
  const selected = session.selectedCustomerIds.length;
  const staged = session.changes.filter((c) => c.state !== 'APPLIED').length;

  // Only rising edges open it, so closing it stays closed.
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
    if (rose) setOpen(true);
  }, [selected, active, staged, lastError]);

  if (!open) {
    return (
      <button
        className={`layer-rail${active ? ' layer-rail--active' : ''}`}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label="Open the Mandate capability layer"
      >
        <span className="layer-rail__dot" aria-hidden />
        <span className="layer-rail__label">Mandate</span>
        <span className="layer-rail__status">
          {active
            ? `active · v${active.version}`
            : selected > 0
              ? `${selected} selected`
              : 'not in use'}
        </span>
      </button>
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
 * What is missing, said in terms the reader can act on.
 *
 * Rendered inside `WebMcpBanner`'s disclosure rather than as a gate, but the
 * copy is the part that matters and it is the one place in the product where
 * vagueness costs the most. WebMCP is reached two
 * ways and the remedy differs completely: in Chrome it is a flag the visitor
 * turns on; in the ChatGPT desktop app it is a shipped feature called *site
 * tools*, gated on the app version, a permission, and the model — and it does
 * not exist in the mobile app at all. `detectHost` only chooses which of those
 * to lead with; the probe, not the user agent, decides what is live.
 */
export function GateReason({ probe }: { probe: WebMcpProbe }) {
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
          . Rather than guess at an unfamiliar shape, nothing is registered with it.
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
          there is nothing to register into, and nothing is registered with an agent.
        </p>
        <p className="gate__body">
          Open this page in the ChatGPT desktop app to see the real registration path.
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
          When it is on, an arrow appears in the address bar and the tools register
          themselves.
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
        is nothing to register into, and nothing is registered with an agent.
      </p>
      <p className="gate__body">
        To see the real registration path, either turn on{' '}
        <code>chrome://flags/#enable-webmcp-testing</code> in Chrome — equivalently,
        launch it with <code>--enable-features=WebMCP</code>, which is what this repo
        measured — and reload, or open this page in the{' '}
        <strong>ChatGPT desktop app&apos;s</strong> built-in browser, which supports
        WebMCP out of the box. The API only appears on a secure origin.
      </p>
    </>
  );
}
