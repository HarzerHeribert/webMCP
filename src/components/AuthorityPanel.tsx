import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';

/**
 * The delegation surface. This panel is the product; everything else is the
 * host demo around it.
 *
 * Three things are deliberate here. The composer refuses to act on the
 * selection alone — the human must name the fields, because "the records I
 * happened to click" is not an intent. The active panel states the scope as
 * exact chips rather than a summary, because a scope the human cannot read back
 * is not one they can be said to have granted. And revoke is always one click
 * away, never behind a menu.
 */

const TTLS = [
  { label: '2 min', ms: 2 * 60_000 },
  { label: '10 min', ms: 10 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
];

export function AuthorityPanel() {
  const { session } = useSession();
  const mandate = session.mandate;
  const active = mandate?.status === 'ACTIVE' ? mandate : null;

  return (
    <section className={`panel${active ? ' panel--authority' : ''}`}>
      <div className="panel__head">
        <h2 className="panel__title">Authority</h2>
        {active ? (
          <span className="chip chip--scope">
            <span className="chip__dot" />
            active · v{active.version}
          </span>
        ) : (
          <span className="chip chip--settled">
            <span className="chip__dot" />
            {mandate ? mandate.status.toLowerCase() : 'none granted'}
          </span>
        )}
      </div>

      <div className="panel__body">
        {active ? (
          <ActiveMandate />
        ) : (
          <>
            {mandate && <MandateEnded />}
            <Composer key={`${session.domainId}:${session.mandateVersion}`} />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * A mandate ending is an event, not the absence of one. Without this the panel
 * would simply revert to the composer and the most important thing that just
 * happened — the authority is gone and the tools went with it — would be the one
 * thing the interface did not say.
 */
function MandateEnded() {
  const { session } = useSession();
  const mandate = session.mandate!;
  const revoked = mandate.endedReason === 'REVOKED';
  return (
    <div className={`ended ended--${revoked ? 'revoked' : 'expired'}`}>
      <span className="ended__head">
        <span className="chip chip--settled">
          <span className="chip__dot" />
          {revoked ? 'revoked' : 'expired'}
        </span>
        Mandate v{mandate.version} {revoked ? 'was revoked' : 'expired'}
      </span>
      <p className="ended__body">
        Its tools are withdrawn, and the server now refuses any call made against
        it. Staged work is untouched — removing authority does not discard the
        human's draft.
      </p>
    </div>
  );
}

function Composer() {
  const { session, schema } = useSession();
  const { run } = useStore();
  // Default to the first two the host allows, whatever they are called.
  const [fields, setFields] = useState<string[]>(() => schema.delegatableFields.slice(0, 2));
  const [ttl, setTtl] = useState(TTLS[1].ms);
  const undelegatable = schema.fields.filter((f) => f.undelegatable);

  const selected = session.selectedResourceIds;
  const ready = selected.length > 0 && fields.length > 0;

  return (
    <div className="composer">
      <p className="panel__note">
        Selecting {schema.domain.collection.toLowerCase()} proposes a scope. It grants nothing. Delegation is a
        separate, explicit act — and it is what makes tools appear.
      </p>

      <div className="composer__step">
        <span className="composer__legend">1 · {schema.domain.collection}, from your selection</span>
        {selected.length === 0 ? (
          <p className="composer__blank">
            Select {schema.domain.collection.toLowerCase()} in {schema.domain.product} to propose a scope.
          </p>
        ) : (
          <div className="chip-row">
            {selected.map((id) => (
              <span key={id} className="chip">
                {session.resources.find((c) => c.id === id)?.name ?? id}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="composer__step">
        <span className="composer__legend">2 · Fields you are delegating</span>
        <div className="chip-row">
          {schema.delegatableFields.map((field) => {
            const on = fields.includes(field);
            return (
              <button
                key={field}
                className={`chip chip--field${on ? ' chip--scope' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  setFields((f) => (on ? f.filter((x) => x !== field) : [...f, field]))
                }
              >
                {on && <span className="chip__dot" />}
                {field}
              </button>
            );
          })}
        </div>
        <p className="composer__hint">
          {undelegatable.map((f, i) => (
            <span key={f.key}>
              {i > 0 && (i === undelegatable.length - 1 ? ' and ' : ', ')}
              <code>{f.key}</code>
            </span>
          ))}{' '}
          {undelegatable.length === 1 ? 'is' : 'are'} absent by design: they can never be
          delegated at all.
        </p>
      </div>

      <div className="composer__step">
        <span className="composer__legend">3 · How long</span>
        <div className="chip-row">
          {TTLS.map((t) => (
            <button
              key={t.ms}
              className={`chip${ttl === t.ms ? ' chip--scope' : ''}`}
              aria-pressed={ttl === t.ms}
              onClick={() => setTtl(t.ms)}
            >
              {ttl === t.ms && <span className="chip__dot" />}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn btn--authority btn--block"
        disabled={!ready}
        onClick={() => void run(() => api.delegate(selected, fields, ttl))}
      >
        Delegate {fields.length} field{fields.length === 1 ? '' : 's'} on{' '}
        {selected.length} {schema.domain.noun}{selected.length === 1 ? '' : 's'}
      </button>
    </div>
  );
}

function ActiveMandate() {
  const { session, schema } = useSession();
  const { run } = useStore();
  const mandate = session.mandate!;
  const remaining = useCountdown(mandate.expiresAt);
  const [narrowing, setNarrowing] = useState(false);

  return (
    <div className="mandate">
      <div className="mandate__scope">
        <span className="composer__legend">{schema.domain.collection}</span>
        <div className="chip-row">
          {mandate.resourceIds.map((id) => (
            <span key={id} className="chip chip--scope">
              <span className="chip__dot" />
              {session.resources.find((c) => c.id === id)?.name ?? id}
            </span>
          ))}
        </div>
      </div>
      <div className="mandate__scope">
        <span className="composer__legend">Fields</span>
        <div className="chip-row">
          {mandate.allowedFields.map((f) => (
            <span key={f} className="chip chip--scope chip--field">
              <span className="chip__dot" />
              {f}
            </span>
          ))}
        </div>
      </div>

      <div className="mandate__meter">
        <div className="meter">
          <div
            className="meter__fill"
            style={{ width: `${Math.max(0, Math.min(100, remaining.fraction * 100))}%` }}
          />
        </div>
        <span className="mandate__expiry mono">
          expires in {remaining.label}
        </span>
      </div>

      <p className="panel__note">
        The page has registered tools shaped by exactly this scope. The server
        checks it again on every call — the schema is a courtesy, not a lock.
      </p>

      <div className="mandate__actions">
        <button className="btn btn--sm" onClick={() => setNarrowing((n) => !n)}>
          {narrowing ? 'Cancel' : 'Narrow scope'}
        </button>
        <button
          className="btn btn--danger btn--sm"
          onClick={() => void run(() => api.revoke())}
        >
          Revoke now
        </button>
      </div>

      {narrowing && <NarrowForm onDone={() => setNarrowing(false)} />}
    </div>
  );
}

function NarrowForm({ onDone }: { onDone(): void }) {
  const { session, schema } = useSession();
  const { run } = useStore();
  const mandate = session.mandate!;
  const [resourceIds, setResourceIds] = useState<string[]>(mandate.resourceIds);
  const [fields, setFields] = useState<string[]>([...mandate.allowedFields]);

  return (
    <div className="narrow">
      <p className="composer__hint">
        Narrowing publishes a new mandate version. Any call already in flight
        against the old version is refused with <code>POLICY_CHANGED</code>.
      </p>
      <div className="chip-row">
        {mandate.resourceIds.map((id) => {
          const on = resourceIds.includes(id);
          return (
            <button
              key={id}
              className={`chip${on ? ' chip--scope' : ''}`}
              aria-pressed={on}
              onClick={() => setResourceIds((c) => (on ? c.filter((x) => x !== id) : [...c, id]))}
            >
              {on && <span className="chip__dot" />}
              {session.resources.find((c) => c.id === id)?.name ?? id}
            </button>
          );
        })}
      </div>
      <div className="chip-row">
        {schema.delegatableFields.map((f) => {
          const on = fields.includes(f);
          return (
            <button
              key={f}
              className={`chip chip--field${on ? ' chip--scope' : ''}`}
              aria-pressed={on}
              onClick={() => setFields((x) => (on ? x.filter((y) => y !== f) : [...x, f]))}
            >
              {on && <span className="chip__dot" />}
              {f}
            </button>
          );
        })}
      </div>
      <button
        className="btn btn--authority btn--block btn--sm"
        disabled={resourceIds.length === 0 || fields.length === 0}
        onClick={async () => {
          await run(() => api.delegate(resourceIds, fields, mandate.expiresAt - Date.now()));
          onDone();
        }}
      >
        Publish narrowed mandate
      </button>
    </div>
  );
}

function useCountdown(expiresAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // One tick a second. The meter's width is a CSS transition, so it stays
    // smooth without re-rendering the panel four times a second.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, expiresAt - now);
  const total = 10 * 60_000;
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  return { label: `${mm}:${String(ss).padStart(2, '0')}`, fraction: left / total };
}
