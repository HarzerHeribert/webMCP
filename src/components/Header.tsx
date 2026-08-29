import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';
import { useWebMcp } from '../webmcp/provider';

/** The instrument row. Everything here is something the demo asks the audience
 *  to watch change: the revision, the mandate version, and whether the page's
 *  tool surface is live. */
export function Header() {
  const { session } = useSession();
  const { run, revisionPulse } = useStore();
  const webmcp = useWebMcp();

  const mandate = session.mandate;
  const authority =
    mandate?.status === 'ACTIVE'
      ? { label: 'Delegated', tone: 'chip--scope' as const }
      : { label: 'No authority', tone: 'chip--settled' as const };

  return (
    <header className="header">
      <div className="brand">
        <span className="brand__mark">Mandate Compiler</span>
        <span className="brand__host">
          A human&apos;s delegation, compiled into a live WebMCP tool contract
        </span>
      </div>

      <span className={`chip ${authority.tone}`}>
        <span className="chip__dot" />
        {authority.label}
      </span>

      <div className="header__meta">
        <Readout label="session" value={session.id} />
        <Readout label="revision" value={`r${session.revision}`} pulse={revisionPulse} />
        <Readout
          label="mandate ver."
          value={mandate ? `v${mandate.version}` : '—'}
        />
        <Readout
          label="webmcp"
          value={webmcp.status === 'registered' ? `${webmcp.toolNames.length} tools` : webmcp.statusLabel}
        />
        <div className="header__instruments">
          <button
            className="btn btn--sm"
            title="Deterministically simulate another user writing to this session. Advances the revision behind any staged work."
            onClick={() => void run(() => api.simulateExternalUpdate())}
          >
            Simulate external update
          </button>
          <button className="btn btn--quiet btn--sm" onClick={() => void run(() => api.reset())}>
            Reset demo
          </button>
        </div>
      </div>
    </header>
  );
}

function Readout({ label, value, pulse }: { label: string; value: string; pulse?: number }) {
  return (
    <div className="readout">
      <span className="readout__label">{label}</span>
      <span key={pulse} className={`readout__value${pulse ? ' readout__value--tick' : ''}`}>
        {value}
      </span>
    </div>
  );
}
