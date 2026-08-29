import { useMemo } from 'react';
import { useSession } from '../lib/store.tsx';
import type { TimelineEvent, TimelineKind } from '../../server/core/types.ts';
import '../styles/timeline.css';

/**
 * The provenance record. Newest-first, dense, and built to be scrolled on
 * camera: every delegation, tool call, refusal, conflict, rebase and human
 * apply reads as one legible sequence without the audience needing colour to
 * follow who did what.
 *
 * `kind` decides the accent (a second signal, always paired with the chip's
 * own text label); `actor` decides the provenance mark shape, which is the
 * *first* signal and works with the sound off.
 */

type Accent = 'authority' | 'warn' | 'danger' | 'ok' | 'settled' | 'agent';

// Mandate events may use amber; a conflict is warn; a refusal is danger; an
// apply/rebase is settled/ok. Everything else stays unaccented — it is the
// ordinary background rhythm of the session, not a state worth flagging.
const KIND_ACCENT: Partial<Record<TimelineKind, Accent>> = {
  MANDATE_CREATED: 'authority',
  MANDATE_NARROWED: 'authority',
  MANDATE_REVOKED: 'authority',
  MANDATE_EXPIRED: 'authority',
  TOOL_CALL: 'agent',
  TOOL_REFUSED: 'danger',
  VALIDATED: 'ok',
  CONFLICT: 'warn',
  REBASED: 'ok',
  APPLIED: 'settled',
};

const KIND_LABEL: Partial<Record<TimelineKind, string>> = {
  MANDATE_CREATED: 'delegated',
  MANDATE_NARROWED: 'narrowed',
  MANDATE_REVOKED: 'revoked',
  MANDATE_EXPIRED: 'expired',
  TOOL_CALL: 'tool call',
  TOOL_REFUSED: 'refused',
  VALIDATED: 'validated',
  CONFLICT: 'conflict',
  REBASED: 'rebased',
  APPLIED: 'applied',
  EXTERNAL_UPDATE: 'external',
};

function accentChipClass(accent: Accent | undefined): string {
  switch (accent) {
    case 'authority':
      return 'chip--scope';
    case 'warn':
      return 'chip--warn';
    case 'danger':
      return 'chip--danger';
    case 'ok':
      return 'chip--ok';
    case 'agent':
      return 'chip--agent';
    default:
      return 'chip--settled';
  }
}

/** Relative and quiet: seconds since session start, `m:ss`. An absolute clock
 *  would only compete with the story the sequence itself tells. */
function relTime(at: number, start: number): string {
  const totalSec = Math.max(0, Math.round((at - start) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Timeline() {
  const { session } = useSession();
  const events = useMemo(() => [...session.timeline].reverse(), [session.timeline]);

  return (
    <section className="panel panel--grow">
      <div className="panel__head">
        <h2 className="panel__title">Timeline</h2>
        <span className="panel__count">{session.timeline.length}</span>
      </div>

      <div className="panel__body panel__body--flush panel__body--scroll">
        {events.length === 0 ? (
          <div className="empty">
            <span className="empty__lead">No events yet</span>
            Every action in this session — human, agent and system — lands
            here, newest first.
          </div>
        ) : (
          <>
            <div className="tl-legend">
              <span className="tl-legend__item">
                <ProvenanceMark actor="human" /> human
              </span>
              <span className="tl-legend__item">
                <ProvenanceMark actor="agent" /> agent
              </span>
              <span className="tl-legend__item">
                <ProvenanceMark actor="system" /> system
              </span>
            </div>
            <ul className="tl-list">
              {events.map((event) => (
                <TimelineRow key={event.id} event={event} start={session.createdAt} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function TimelineRow({ event, start }: { event: TimelineEvent; start: number }) {
  const accent = KIND_ACCENT[event.kind];
  const label = KIND_LABEL[event.kind];

  return (
    <li className={`tl-row${accent ? ` tl-row--${accent}` : ''}`}>
      <span className="tl-time mono dim">{relTime(event.at, start)}</span>
      <span className="tl-mark">
        <ProvenanceMark actor={event.actor} />
      </span>
      <div className="tl-main">
        <div className="tl-line">
          <span className="tl-summary">{event.summary}</span>
          {label && (
            <span className={`chip ${accentChipClass(accent)}`}>
              <span className="chip__dot" />
              {label}
            </span>
          )}
        </div>

        {(event.tool || event.errorCode) && (
          <div className="tl-wire">
            {event.tool && <span className="chip chip--settled chip--field mono">{event.tool}</span>}
            {event.errorCode && (
              <span className="chip chip--danger chip--field mono">{event.errorCode}</span>
            )}
          </div>
        )}

        {event.detail && (
          <details className="tl-detail">
            <summary />
            <pre className="tl-detail-body mono">{event.detail}</pre>
          </details>
        )}
      </div>
    </li>
  );
}

/** Human/agent follow the mark convention from `StagedChanges` (filled square
 *  vs dashed circle). `system` gets a third shape of its own — a solid-stroke
 *  triangle — so all three read apart with no colour at all. */
function ProvenanceMark({ actor }: { actor: TimelineEvent['actor'] }) {
  if (actor === 'human') {
    return (
      <svg className="prov prov--human" viewBox="0 0 10 10" aria-hidden width="10" height="10">
        <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (actor === 'agent') {
    return (
      <svg className="prov prov--agent" viewBox="0 0 10 10" aria-hidden width="10" height="10">
        <rect
          x="1.5"
          y="1.5"
          width="7"
          height="7"
          rx="3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeDasharray="2.6 1.9"
        />
      </svg>
    );
  }
  return (
    <svg className="prov prov--system" viewBox="0 0 10 10" aria-hidden width="10" height="10">
      <path
        d="M5 1.3 L9 8.6 L1 8.6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
