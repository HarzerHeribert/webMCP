import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';
import { useWebMcp } from '../webmcp/provider';
import { useMode } from '../lib/mode';

/** The instrument row. The readouts — revision, mandate version, whether the
 *  page's tool surface is live — are what a reviewer watches change, so they
 *  render only in the technical view; the product form's header carries plain
 *  words only. */
/**
 * The audience switch. Two labels, because the honest answer to "why does this
 * take up so much room?" is that most of it is instrumentation for a reviewer,
 * and the product underneath is small. Saying that is weaker than showing it.
 *
 * It changes which panels render. It changes nothing the server does.
 */
/**
 * Which host application the layer is installed into.
 *
 * This is the whole genericity claim, made pressable. Switching rewrites the
 * records, the field names, the filter options, the compiled tool schema and
 * even the mutating tool's *name* — and touches nothing in `policy.ts`,
 * `service.ts` or `capabilities.ts`, because none of them ever knew what a
 * customer was.
 */
function HostSwitch() {
  const { schema, session } = useSession();
  const { run } = useStore();
  return (
    <div className="modeswitch modeswitch--host" role="group" aria-label="Host application">
      {schema.hosts.map((h) => (
        <button
          key={h.id}
          className={`modeswitch__opt${session.domainId === h.id ? ' modeswitch__opt--on' : ''}`}
          aria-pressed={session.domainId === h.id}
          onClick={() => void run(() => api.switchHost(h.id))}
          title={`Install the same layer into ${h.product}. Resets the session.`}
        >
          {h.product}
        </button>
      ))}
    </div>
  );
}

function ModeSwitch() {
  const { mode, setMode } = useMode();
  return (
    <div className="modeswitch" role="group" aria-label="Who the interface is showing">
      {(['minimal', 'technical'] as const).map((m) => (
        <button
          key={m}
          className={`modeswitch__opt${mode === m ? ' modeswitch__opt--on' : ''}`}
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          title={
            m === 'minimal'
              ? 'The product: a pill that cannot be hidden, and a popover at each moment that needs one.'
              : 'Everything a reviewer needs: the compiled tool contract, a caller, the audit.'
          }
        >
          {m === 'minimal' ? 'Product' : 'Technical'}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { session } = useSession();
  const { run, revisionPulse } = useStore();
  const webmcp = useWebMcp();
  const { mode } = useMode();

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
        {/* The readouts are instrumentation — the audience of the product form
            never needs a session id or a revision counter, so they render only
            for the reviewer who asked for the technical view. */}
        {mode === 'technical' && (
          <>
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
          </>
        )}
        <HostSwitch />
        <ModeSwitch />
        <div className="header__instruments">
          {mode === 'technical' && (
            <button
              className="btn btn--sm"
              title="Deterministically simulate another user writing to this session. Advances the revision behind any staged work."
              onClick={() => void run(() => api.simulateExternalUpdate())}
            >
              Simulate external update
            </button>
          )}
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
