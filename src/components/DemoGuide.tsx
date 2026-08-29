import { useState } from 'react';
import { useSession } from '../lib/store';
import '../styles/demo.css';

/**
 * The guide rail. It never asks what the judge already did — it reads the
 * session the way every other panel does, and names the beat that state
 * implies. Wander off script and it follows: there is no click it is
 * waiting for, only a shape of `session` it recognises.
 */

type Session = ReturnType<typeof useSession>['session'];

interface Step {
  n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  label: string;
  ask: string;
  /** Only true for the delegation step — the one place this rail may use
   *  `--authority`. */
  authority?: boolean;
}

const STEPS: Step[] = [
  {
    n: 1,
    label: 'Select',
    ask: 'Pick two customers in Relay CRM. Watch the capability inspector — nothing appears.',
  },
  {
    n: 2,
    label: 'Delegate',
    ask: 'Delegate status and nextAction. This is the act that creates authority.',
    authority: true,
  },
  {
    n: 3,
    label: 'Stage',
    ask: 'The tools now exist, shaped to that scope. Stage a change through the simulated caller.',
  },
  {
    n: 4,
    label: 'Refused',
    ask: 'Try a customer you selected but never delegated. The server refuses it.',
  },
  {
    n: 5,
    label: 'Conflict',
    ask: 'Hit Simulate external update, then Validate.',
  },
  {
    n: 6,
    label: 'Rebase',
    ask: 'Rebase. The intended value survives; the base moves.',
  },
  {
    n: 7,
    label: 'Apply',
    ask: 'Ask the agent to apply — there is no such tool. Then apply it yourself.',
  },
  {
    n: 8,
    label: 'Done',
    ask: 'Read the timeline. That is the whole argument in one column.',
  },
];

/** Derives the current beat from session state alone — never from a click
 *  count — so backing out of a step (revoke, discard) backs out the guide
 *  too. Checked most-advanced-first: a later condition, once true, wins
 *  over an earlier one that happens to still hold. */
function deriveStep(session: Session): Step['n'] {
  const mandate = session.mandate;
  const active = mandate?.status === 'ACTIVE';
  const changes = session.changes;
  const hasChanges = changes.length > 0;
  const anyApplied = changes.some((c) => c.state === 'APPLIED');
  const anyStale = changes.some((c) => c.state === 'STALE');
  const allValidated = hasChanges && changes.every((c) => c.state === 'VALIDATED');
  // A refusal already shown to the room is what separates "try it" (4) from
  // "now break it on purpose" (5) — both otherwise look like "≥1 change".
  const refused = session.timeline.some((e) => e.kind === 'TOOL_REFUSED');

  if (anyApplied) return 8;
  if (allValidated) return 7;
  if (anyStale) return 6;
  // Steps 3-5 are agent beats and need live authority. Revoking or letting the
  // mandate expire withdraws them, so the guide walks back to "delegate" rather
  // than pointing at a beat that can no longer be performed. Validate, rebase
  // and apply are human actions, so 6-8 above stand without a mandate.
  if (active && hasChanges && refused) return 5;
  if (active && hasChanges) return 4;
  if (active) return 3;
  if (session.selectedCustomerIds.length > 0) return 2;
  return 1;
}

const DISMISS_KEY = 'mandate.demoGuideDismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false; // private mode — the guide just stays available every load
  }
}

function writeDismissed(value: boolean) {
  try {
    if (value) localStorage.setItem(DISMISS_KEY, '1');
    else localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* private mode — the dismissal simply does not survive a reload */
  }
}

export function DemoGuide() {
  const { session } = useSession();
  const [dismissed, setDismissed] = useState(readDismissed);

  const n = deriveStep(session);
  const step = STEPS[n - 1];

  if (dismissed) {
    return (
      <div className="demo-guide demo-guide--collapsed">
        <button
          type="button"
          className="demo-guide__reopen"
          onClick={() => {
            writeDismissed(false);
            setDismissed(false);
          }}
        >
          Guide <span className="mono dim">{n}/8</span>
        </button>
      </div>
    );
  }

  return (
    <div className="demo-guide" role="note" aria-label="Guided demo">
      <ol className="demo-guide__rail" aria-hidden="true">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={
              'demo-guide__dot' +
              (s.n < n ? ' demo-guide__dot--done' : '') +
              (s.n === n ? ' demo-guide__dot--current' : '')
            }
          />
        ))}
      </ol>

      <span className={'chip demo-guide__badge' + (step.authority ? ' chip--scope' : '')}>
        <span className="chip__dot" />
        {step.label}
      </span>
      <span className="demo-guide__step mono dim">{n}/8</span>

      <p className="demo-guide__copy">{step.ask}</p>

      <button
        type="button"
        className="btn btn--quiet btn--sm demo-guide__dismiss"
        onClick={() => {
          writeDismissed(true);
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
