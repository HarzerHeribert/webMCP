import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';
import { AuthorityPanel } from './AuthorityPanel';
import { Popover } from './Popover';

/**
 * Mandate with no panel at all.
 *
 * What has to be permanently visible turns out to be one thing: **live
 * authority**, which this product will not hide under any circumstances. Scope
 * is already legible without a panel — the delegated rows carry the amber ring —
 * and pending work is already legible, because `CustomerTable` renders the
 * staged value inline on the field it would change.
 *
 * That leaves a pill, and two moments that each have somewhere to be anchored:
 * granting belongs to the selection, approving belongs to the record. Neither
 * needs to exist between those moments, so neither does.
 */
export function MinimalLayer() {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLButtonElement | null>(null);

  const mandate = session.mandate?.status === 'ACTIVE' ? session.mandate : null;
  const selected = session.selectedCustomerIds.length;
  const pending = session.changes.filter((c) => c.state !== 'APPLIED').length;

  const label = mandate
    ? `active · v${mandate.version}`
    : selected > 0
      ? `${selected} selected`
      : 'not in use';

  return (
    <>
      <button
        ref={pill}
        className={`pill${mandate ? ' pill--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Mandate — delegated authority"
      >
        <span className="pill__dot" aria-hidden />
        <span className="pill__name">Mandate</span>
        <span className="pill__state">{label}</span>
        {pending > 0 && <span className="pill__count">{pending}</span>}
      </button>

      <Popover anchorRef={pill} open={open} onClose={() => setOpen(false)} label="Delegated authority" side="top">
        <AuthorityPanel />
      </Popover>
    </>
  );
}

/**
 * The approval, where the thing being approved is.
 *
 * Anchored to the record, so the row it would change is on screen and uncovered
 * while the decision is made — which a modal cannot promise and a sidebar only
 * manages by permanently spending the space.
 */
export function RowApproval({ customerId }: { customerId: string }) {
  const { session } = useSession();
  const { run, lastError } = useStore();
  const [open, setOpen] = useState(false);
  // Anchored to the control, not to the record: the row spans the workbench, so
  // anchoring to it puts the card wherever the row happens to end.
  const btn = useRef<HTMLButtonElement | null>(null);

  const mine = session.changes.filter((c) => c.customerId === customerId && c.state !== 'APPLIED');
  if (mine.length === 0) return null;

  const stale = mine.some((c) => c.state === 'STALE');
  const byAgent = mine.some((c) => c.touchedBy.includes('agent'));

  return (
    <>
      <button
        ref={btn}
        className={`review${stale ? ' review--stale' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {mine.length} change{mine.length === 1 ? '' : 's'} to review
      </button>

      <Popover anchorRef={btn} open={open} onClose={() => setOpen(false)} label="Review staged changes" side="top">
        <div className="approve">
          <p className="approve__lead">
            {byAgent ? 'The agent staged this' : 'You staged this'}
            {mine.length > 1 ? ` and ${mine.length - 1} more` : ''}.
          </p>
          <ul className="approve__list">
            {mine.map((c) => (
              <li key={c.id} className="approve__row">
                <span className="approve__field">{FIELD_LABEL[c.field] ?? c.field}</span>
                <span className="delta">
                  <span className="delta__before">{c.before}</span>
                  <span className="delta__arrow">→</span>
                  <span className="delta__after">{c.after}</span>
                </span>
              </li>
            ))}
          </ul>
          {stale && (
            <p className="approve__warn">
              The record changed underneath this. Applying is blocked until it is redone.
            </p>
          )}
          {/* With no panel there is nowhere else for a refusal to land, and a
              refusal that goes unseen is worse than the panel ever was. */}
          {lastError && !stale && (
            <p className="approve__warn">
              <span className="approve__code">{lastError.code}</span>
              {lastError.message}
            </p>
          )}
          <div className="approve__actions">
            <button
              className="btn btn--quiet btn--sm"
              onClick={() => void run(async () => {
                for (const c of mine) await api.discard(c.id);
                return api.refresh();
              })}
            >
              Discard
            </button>
            <button
              className="btn btn--primary btn--sm"
              disabled={stale}
              onClick={() =>
                void run(async () => {
                  const checked = await api.validate();
                  const blocked = checked.session.changes.some(
                    (c) => c.state !== 'APPLIED' && c.state !== 'VALIDATED',
                  );
                  if (blocked) return checked;
                  const done = await api.apply(session.revision);
                  setOpen(false);
                  return done;
                })
              }
            >
              Apply
            </button>
          </div>
          <p className="approve__foot">Applying checks these against the record first.</p>
        </div>
      </Popover>
    </>
  );
}

const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  nextAction: 'Next action',
  owner: 'Owner',
  renewalDate: 'Renewal date',
  arr: 'ARR',
  notes: 'Notes',
};
