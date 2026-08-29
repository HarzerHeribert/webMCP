import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';
import type { ErrorEnvelope } from '../lib/api.ts';
import '../styles/timeline.css';

/**
 * The validation and recovery panel, plus the external-update simulator.
 *
 * The conflict content renders only when `lastError` is set — an empty state
 * here would be dead space above the staged-changes panel. The simulator
 * trigger is a separate, always-visible strip: a presenter needs to be able
 * to fire it mid-flow, before a conflict exists, to make one happen.
 */

const CODE_LABEL: Record<string, string> = {
  NO_ACTIVE_MANDATE: 'No active mandate',
  MANDATE_EXPIRED: 'Mandate expired',
  POLICY_CHANGED: 'Policy changed',
  OUT_OF_SCOPE: 'Out of scope',
  REVISION_CONFLICT: 'Revision conflict',
  CHANGE_VERSION_CONFLICT: 'Change version conflict',
  VALIDATION_FAILED: 'Validation failed',
  HUMAN_CONFIRMATION_REQUIRED: 'Confirmation required',
  WEBMCP_UNAVAILABLE: 'WebMCP unavailable',
  NOT_FOUND: 'Not found',
  BAD_REQUEST: 'Bad request',
};

// A conflict is warn (something shifted under the work); a refusal-shaped
// code — the mandate never covered this, or never existed — is danger.
const WARN_CODES = new Set([
  'REVISION_CONFLICT',
  'CHANGE_VERSION_CONFLICT',
  'POLICY_CHANGED',
  'VALIDATION_FAILED',
]);

export function ConflictPanel() {
  const { lastError, run } = useStore();

  // The external-update instrument now lives in the header (`Header.tsx`): a
  // presenter needs it reachable in every state, and a panel that renders
  // nothing most of the time is the wrong home for a control that is always
  // available. This panel is purely the refusal and its recovery.
  if (!lastError) return null;
  return <ConflictContent error={lastError} onRebase={() => void run(() => api.rebase())} />;
}

function ConflictContent({ error, onRebase }: { error: ErrorEnvelope; onRebase: () => void }) {
  const severity = WARN_CODES.has(error.code) ? 'warn' : 'danger';
  const label = CODE_LABEL[error.code] ?? error.code;
  const showRebase = error.code === 'REVISION_CONFLICT';

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Conflict &amp; recovery</h2>
      </div>
      <div className="panel__body">
        <div className={`callout callout--${severity}`}>
          <div className="callout__body">
            <span className="callout__title">{label}</span>
            <p>{error.message}</p>
            <div className="cp-recovery">
              <span className="cp-recovery__label dim">
                {error.recoverable ? 'Recovery' : 'No automatic recovery'}
              </span>
              {showRebase ? (
                <button className="btn btn--sm" onClick={onRebase}>
                  Rebase staged changes
                </button>
              ) : (
                <>
                  {error.recovery && <p>{error.recovery}</p>}
                  <p className="dim">No automatic action here — this is a human decision.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
