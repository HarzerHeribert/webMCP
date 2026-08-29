import { AuthorityPanel } from './components/AuthorityPanel.tsx';
import { CustomerTable } from './components/CustomerTable.tsx';
import { Header } from './components/Header.tsx';
import { StagedChanges } from './components/StagedChanges.tsx';
import { ConflictPanel } from './components/ConflictPanel.tsx';
import { Inspector } from './components/Inspector.tsx';
import { Timeline } from './components/Timeline.tsx';
import { AgentConsole } from './components/AgentConsole.tsx';
import { DemoGuide } from './components/DemoGuide.tsx';
import { useStore } from './lib/store.tsx';
import { WebMcpProvider } from './webmcp/provider.tsx';

/**
 * One workbench, three columns, left to right in the order the story runs:
 * what the authority applies to, the authority itself and the tool surface it
 * compiles into, and the work that surface produced — ending in the one
 * human-only commit and the record of everything that led to it.
 *
 * The simulated caller sits directly above the staged changes it produces, so
 * running a tool and watching the result land are one glance apart. Each column
 * is exactly the viewport's height; the panels that can grow without bound are
 * the ones that scroll, so nothing that matters ever leaves the screen.
 *
 * The timeline is a full-width rail beneath all three, because its rows are
 * sentences. In a 400px column every one of them wrapped; across the whole
 * workbench they read as a list of things that happened — which is what the
 * demo closes on.
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
          <div className="column column--fit">
            <CustomerTable />
          </div>
          <div className="column column--fit">
            <AuthorityPanel />
            <Inspector />
          </div>
          <div className="column column--fit">
            <ConflictPanel />
            <AgentConsole />
            <StagedChanges />
          </div>
        </main>
        <Timeline />
      </div>
    </WebMcpProvider>
  );
}
