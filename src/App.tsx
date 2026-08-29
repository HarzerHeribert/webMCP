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
          <div className="column column--scroll">
            <CustomerTable />
          </div>
          <div className="column column--scroll">
            <AuthorityPanel />
            <Inspector />
            <AgentConsole />
          </div>
          <div className="column column--scroll">
            <ConflictPanel />
            <StagedChanges />
            <Timeline />
          </div>
        </main>
      </div>
    </WebMcpProvider>
  );
}
