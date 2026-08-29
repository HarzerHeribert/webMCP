import { AuthorityPanel } from './components/AuthorityPanel.tsx';
import { CustomerTable } from './components/CustomerTable.tsx';
import { Header } from './components/Header.tsx';
import { StagedChanges } from './components/StagedChanges.tsx';
import { ConflictPanel } from './components/ConflictPanel.tsx';
import { Inspector } from './components/Inspector.tsx';
import { Timeline } from './components/Timeline.tsx';
import { AgentConsole } from './components/AgentConsole.tsx';
import { DemoGuide } from './components/DemoGuide.tsx';
import { MandateLayer } from './components/MandateLayer.tsx';
import { useStore } from './lib/store.tsx';
import { WebMcpProvider } from './webmcp/provider.tsx';

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
export function App() {
  const { view, loading } = useStore();

  if (loading || !view) {
    return (
      <div className="app">
        <div className="boot">Opening a session…</div>
      </div>
    );
  }

  return (
    <WebMcpProvider>
      <div className="app">
        <Header />
        <DemoGuide />
        <main className="workbench">
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
        </main>
      </div>
    </WebMcpProvider>
  );
}
