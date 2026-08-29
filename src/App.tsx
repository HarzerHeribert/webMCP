import type { ReactNode } from 'react';
import { AuthorityPanel } from './components/AuthorityPanel';
import { CustomerTable } from './components/CustomerTable';
import { Header } from './components/Header';
import { StagedChanges } from './components/StagedChanges';
import { ConflictPanel } from './components/ConflictPanel';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { AgentConsole } from './components/AgentConsole';
import { DemoGuide } from './components/DemoGuide';
import { MandateLayer } from './components/MandateLayer';
import { MinimalLayer } from './components/MinimalLayer';
import { ModeProvider, useMode } from './lib/mode';
import { useStore } from './lib/store';
import { WebMcpProvider } from './webmcp/provider';

/**
 * Two regions, and the seam between them is the whole point.
 *
 * **Left is the host.** Relay CRM is somebody else's CRM: its own wordmark, its
 * own chrome, its own record list. Mandate did not build it and does not own it.
 *
 * **Right is the product**, and it can be closed. Everything Mandate
 * contributes lives inside one bounded, labelled pane — the delegation surface,
 * the tool contract it compiles, a way to exercise that contract, the shared
 * staged work, and the audit of all of it. Shut it and Relay CRM is an ordinary
 * CRM again, which is the clearest possible statement of
 * `docs/12_DECISIONS.md` D-002: the host is not the product.
 *
 * Inside the layer the order is the order the story runs: the authority and the
 * tool surface it compiles into, then the work that surface produced, ending in
 * the one human-only commit and the record of everything that led to it. The
 * simulated caller sits directly above the staged changes it produces, so
 * running a tool and watching the result land are one glance apart.
 */
/** In `minimal` there is no layer element in the workbench at all — the host
 *  gets the whole width, and Mandate is a pill plus whatever popover is open. */
function Layer() {
  const { mode } = useMode();
  if (mode === 'minimal') return <MinimalLayer />;
  return (
    <MandateLayer>
      <div className="layer__grid">
        <div className="column column--fit">
          <AuthorityPanel />
          <Inspector />
        </div>
        <div className="column column--fit">
          <ConflictPanel />
          <AgentConsole />
          <StagedChanges />
        </div>
      </div>
      <Timeline />
    </MandateLayer>
  );
}

/** The guide narrates the reviewer's path through the instrument, so in the
 *  product form it would be pointing at panels that are not on screen. */
function Guide() {
  const { mode } = useMode();
  return mode === 'technical' ? <DemoGuide /> : null;
}

/** With no layer element in the workbench, the host gets the whole width. */
function Workbench({ children }: { children: ReactNode }) {
  const { mode } = useMode();
  return (
    <main className={`workbench${mode === 'minimal' ? ' workbench--minimal' : ''}`}>{children}</main>
  );
}

export function App() {
  const { view, loading, bootError, retryBoot } = useStore();

  if (!view) {
    return (
      <div className="app">
        <div className="boot">
          {loading ? (
            <span className="boot__msg">Opening a session…</span>
          ) : (
            <div className="boot__fail">
              <span className="chip chip--danger">
                <span className="chip__dot" />
                cannot reach the service
              </span>
              <h1 className="boot__title">Relay CRM could not open a session.</h1>
              <p className="boot__body">
                The application service did not answer. Nothing is lost — sessions are
                seeded on demand, so a retry starts a fresh one.
              </p>
              {bootError && <p className="boot__detail mono">{bootError}</p>}
              <button className="btn btn--primary" onClick={retryBoot}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <WebMcpProvider>
      <ModeProvider>
      <div className="app">
        <Header />
        <Guide />
        <Workbench>
          <section className="host" aria-label="Relay CRM, the host application">
            <header className="host__chrome">
              <span className="host__mark" aria-hidden>
                R
              </span>
              <span className="host__name">Relay CRM</span>
              <span className="host__note">The host application. Mandate did not build this.</span>
            </header>
            <div className="column column--fit">
              <CustomerTable />
            </div>
          </section>

          <Layer />
        </Workbench>
      </div>
      </ModeProvider>
    </WebMcpProvider>
  );
}
