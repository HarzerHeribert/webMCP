import '../styles/webmcp.css';
import type { ToolDescriptor } from '../../server/core/capabilities';
import { useSession } from '../lib/store';
import { useWebMcp } from '../webmcp/provider';

/**
 * The capability inspector — `docs/15_DESIGN_SYSTEM.md`: "Inspector mirrors
 * registered name, description, inputs, and availability."
 *
 * Every row comes straight from `useSession().capabilities`, the exact array
 * `WebMcpProvider` filters and registers, so this panel cannot silently drift
 * from what the provider actually built (M3). The "confirmed live" badge on
 * each registered tool cross-checks that same list against the provider's own
 * `toolNames` — the names actually handed to a browser — so the claim is
 * checkable, not just asserted.
 */
export function Inspector() {
  const { capabilities, neverRegistered } = useSession();
  const webmcp = useWebMcp();

  const registered = capabilities.filter((d) => d.availability === 'registered');
  const withheld = capabilities.filter((d) => d.availability === 'withheld');
  const liveNames = webmcp.status === 'registered' ? webmcp.toolNames : undefined;

  return (
    <section className="panel panel--fill webmcp-inspector-panel">
      <div className="panel__head">
        <span className="panel__title">Capability inspector</span>
        <span className="panel__count">{registered.length} registered</span>
        <div className="panel__actions">
          <span className={`chip ${webmcp.status === 'registered' ? 'chip--ok' : 'chip--settled'}`}>
            <span className="chip__dot" />
            WebMCP {webmcp.status}
          </span>
        </div>
      </div>
      <div className="panel__body panel__body--scroll webmcp-inspector-body">
        {webmcp.status === 'unavailable' && (
          <div className="callout callout--warn webmcp-callout">
            <div className="callout__body">
              <span className="callout__title">WEBMCP_UNAVAILABLE</span>
              This browser has no <code>navigator.modelContext</code>, so nothing is
              registered with a page-level agent. The schedule below is still the real
              compiled surface — use the simulated caller to exercise it by hand.
            </div>
          </div>
        )}

        <ToolGroup
          title="Registered"
          tools={registered}
          emptyLabel="No tool is registered."
          badgeFor={(tool) =>
            // Amber marks delegated authority. A mutating tool's registration
            // *is* that authority; the two read-only tools are registered
            // whether or not any mandate exists, so amber would misstate them.
            tool.readOnly
              ? { className: 'chip--ok', text: 'registered' }
              : { className: 'chip--scope', text: 'registered — authorized' }
          }
          liveNames={liveNames}
        />

        <ToolGroup
          title="Withheld"
          tools={withheld}
          emptyLabel="Nothing is withheld."
          badgeFor={() => ({ className: 'chip--settled', text: 'withheld' })}
        />

        <details className="webmcp-group webmcp-absent-fold">
          <summary className="webmcp-absent-fold__summary">
            <span className="webmcp-group__title">
              Never registered <span className="panel__count">{neverRegistered.length}</span>
            </span>
            <span className="dim webmcp-absent-fold__hint">structurally absent, at any mandate</span>
          </summary>
          <p className="panel__note webmcp-note">
            No code path registers these. That there is no apply, delete,
            mandate-administration, or raw-data tool is a claim this demo makes out loud.
          </p>
          <ul className="webmcp-absent">
            {neverRegistered.map((t) => (
              <li key={t.name} className="webmcp-absent__row">
                <span className="mono webmcp-absent__name">{t.name}</span>
                <span className="dim webmcp-absent__reason">{t.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

function ToolGroup({
  title,
  tools,
  emptyLabel,
  badgeFor,
  liveNames,
}: {
  title: string;
  tools: ToolDescriptor[];
  emptyLabel: string;
  badgeFor: (tool: ToolDescriptor) => { className: string; text: string };
  liveNames?: string[];
}) {
  return (
    <div className="webmcp-group">
      <h3 className="webmcp-group__title">
        {title} <span className="panel__count">{tools.length}</span>
      </h3>
      {tools.length === 0 ? (
        <p className="empty">{emptyLabel}</p>
      ) : (
        <ul className="webmcp-tools">
          {tools.map((tool) => {
            const isLive = liveNames?.includes(tool.name);
            const badge = badgeFor(tool);
            return (
              <li key={tool.name} className="webmcp-tool">
                <div className="webmcp-tool__head">
                  <span className="mono webmcp-tool__name">{tool.name}</span>
                  <span className={`chip ${badge.className}`}>
                    <span className="chip__dot" />
                    {badge.text}
                  </span>
                  {liveNames && (
                    <span className={`chip ${isLive ? 'chip--ok' : 'chip--danger'}`}>
                      <span className="chip__dot" />
                      {isLive ? 'confirmed live' : 'not live'}
                    </span>
                  )}
                  {tool.readOnly && (
                    <span className="chip chip--settled">
                      <span className="chip__dot" />
                      read-only
                    </span>
                  )}
                </div>
                <p className="webmcp-tool__desc">{tool.description}</p>
                <p className="dim webmcp-tool__reason">{tool.availabilityReason}</p>
                <details className="webmcp-tool__schema-toggle">
                  <summary>input schema</summary>
                  <pre className="mono webmcp-tool__schema">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
