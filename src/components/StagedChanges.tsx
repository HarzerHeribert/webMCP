import { api } from '../lib/api.ts';
import { useSession, useStore } from '../lib/store.tsx';
import type { Change } from '../../server/core/types.ts';

/**
 * The shared workspace. A human edit and an agent edit land in the same list, in
 * the same shape, and a change touched by both says so — that is FR-005 made
 * visible rather than asserted.
 *
 * Apply lives in its own bar, separated by a rule, with its own surface. It is
 * the one irreversible act in the product, and it should never look like the
 * button next to it.
 */

const STATE_CHIP: Record<Change['state'], { cls: string; label: string }> = {
  DRAFT: { cls: 'chip--settled', label: 'draft' },
  VALIDATED: { cls: 'chip--ok', label: 'validated' },
  STALE: { cls: 'chip--warn', label: 'stale' },
  APPLIED: { cls: 'chip--settled', label: 'applied' },
};

export function StagedChanges() {
  const { session } = useSession();
  const { run } = useStore();

  const pending = session.changes.filter((c) => c.state !== 'APPLIED');
  const applied = session.changes.filter((c) => c.state === 'APPLIED');
  const allValidated = pending.length > 0 && pending.every((c) => c.state === 'VALIDATED');
  const anyStale = pending.some((c) => c.state === 'STALE');

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">Staged changes</h2>
        <span className="panel__count">{pending.length}</span>
        <div className="panel__actions">
          <button
            className="btn btn--sm"
            disabled={pending.length === 0}
            onClick={() => void run(() => api.validate())}
          >
            Validate
          </button>
        </div>
      </div>

      <div className="panel__body panel__body--flush panel__body--scroll">
        {pending.length === 0 && applied.length === 0 ? (
          <div className="empty">
            <span className="empty__lead">Nothing staged</span>
            Edit a field in Relay CRM, or delegate a scope and let an agent stage
            a change. Both land here, in the same list.
          </div>
        ) : (
          <ul className="changes">
            {pending.map((c) => (
              <ChangeRow key={c.id} change={c} />
            ))}
            {applied.length > 0 && (
              <li className="changes__divider">
                <span>applied this session</span>
              </li>
            )}
            {applied.map((c) => (
              <ChangeRow key={c.id} change={c} />
            ))}
          </ul>
        )}
      </div>

      <div className={`commit${allValidated ? ' commit--ready' : ''}${anyStale ? ' commit--blocked' : ''}`}>
        <div className="commit__copy">
          <span className="commit__title">
            Apply is a human action
            {allValidated && <span className="chip chip--ok commit__ready">ready</span>}
          </span>
          <span className="commit__sub">
            {anyStale
              ? 'Stale work must be rebased before it can be applied.'
              : pending.length === 0
                ? 'Nothing to commit.'
                : allValidated
                  ? `${pending.length} validated change${pending.length === 1 ? '' : 's'} ready to commit.`
                  : 'Validate the staged changes first.'}
          </span>
        </div>
        <button
          className="btn btn--primary"
          disabled={!allValidated}
          onClick={() => void run(() => api.apply(session.revision))}
        >
          Apply {pending.length > 0 ? pending.length : ''} change{pending.length === 1 ? '' : 's'}
        </button>
      </div>
    </section>
  );
}

function ChangeRow({ change }: { change: Change }) {
  const { session } = useSession();
  const { run } = useStore();
  const customer = session.customers.find((c) => c.id === change.customerId);
  const state = STATE_CHIP[change.state];
  const both = change.touchedBy.length > 1;

  return (
    <li className={`change change--${change.state.toLowerCase()}`}>
      <div className="change__top">
        <span className="change__target">
          {customer?.name}
          <span className="change__field mono">{change.field}</span>
        </span>
        <span className={`chip ${state.cls}`}>
          <span className="chip__dot" />
          {state.label}
        </span>
      </div>

      <div className={`delta${change.state === 'APPLIED' ? ' delta--applied' : ''}`}>
        <span className="delta__before">{change.before}</span>
        <span className="delta__arrow">→</span>
        <span className="delta__after">{change.after}</span>
      </div>

      <div className="change__meta">
        {both ? (
          <span className="chip chip--sm" title="Human and agent have both edited this change">
            <Provenance actor="human" />
            <Provenance actor="agent" />
            co-edited
          </span>
        ) : (
          <span className={`chip chip--${change.touchedBy[0]}`}>
            <Provenance actor={change.touchedBy[0]} />
            {change.touchedBy[0] === 'human' ? 'human' : 'agent'}
          </span>
        )}
        <span className="dim mono">base r{change.baseRevision}</span>
        {change.mandateVersion !== null && (
          <span className="dim mono">mandate v{change.mandateVersion}</span>
        )}
        {change.state !== 'APPLIED' && (
          <button
            className="btn btn--quiet btn--sm change__discard"
            onClick={() => void run(() => api.discard(change.id))}
          >
            Discard
          </button>
        )}
      </div>

      {change.validationMessage && (
        <p className="change__message">{change.validationMessage}</p>
      )}
    </li>
  );
}

/** Human and agent get different marks, not different shades of one mark:
 *  `docs/15` asks for distinct labels and icons, and colour alone would fail an
 *  audience watching a recording. */
function Provenance({ actor }: { actor: 'human' | 'agent' }) {
  return actor === 'human' ? (
    <svg className="prov prov--human" viewBox="0 0 10 10" aria-hidden width="10" height="10">
      <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  ) : (
    <svg className="prov prov--agent" viewBox="0 0 10 10" aria-hidden width="10" height="10">
      <rect x="1.5" y="1.5" width="7" height="7" rx="3.5" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeDasharray="2.6 1.9" />
    </svg>
  );
}
