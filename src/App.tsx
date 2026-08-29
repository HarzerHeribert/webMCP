import { AuthorityPanel } from './components/AuthorityPanel.tsx';
import { CustomerTable } from './components/CustomerTable.tsx';
import { Header } from './components/Header.tsx';
import { StagedChanges } from './components/StagedChanges.tsx';
import { ConflictPanel } from './components/ConflictPanel.tsx';
import { Inspector } from './components/Inspector.tsx';
import { Timeline } from './components/Timeline.tsx';
import { AgentConsole } from './components/AgentConsole.tsx';
import { useStore } from './lib/store.tsx';
import { WebMcpProvider } from './webmcp/provider.tsx';

/**
 * One workbench, three columns, left to right in the order authority actually
 * flows: the human picks in Relay CRM, the middle column holds the shared work
 * and the one human-only commit, and the right column shows what that authority
 * published and everything it has caused.
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
        <main className="workbench">
          <div className="column column--scroll">
            <CustomerTable />
          </div>
          <div className="column column--scroll">
            <ConflictPanel />
            <StagedChanges />
          </div>
          <div className="column column--scroll">
            <AuthorityPanel />
            <Inspector />
            <AgentConsole />
            <Timeline />
          </div>
        </main>
      </div>
    </WebMcpProvider>
  );
}
