import { useEffect, useRef, useState } from 'react';
import { useMode } from '../lib/mode';
import { ApprovalPopover } from './MinimalLayer';
import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';
import type { Resource } from '../../server/core/types';
import type { FieldSpec } from '../../server/core/domains';

/**
 * The host application's record list, and the place the product's central
 * distinction is made visible: **selection proposes, delegation grants**. A
 * selected row gets a cool rail and a checkbox. A delegated row gets the amber
 * authority ring and a scope chip. They are never the same treatment, and a row
 * can be one without the other — which is exactly the M2 gate the audience
 * needs to see.
 *
 * Every noun, label, column and status here comes from `schema.domain`
 * (`server/core/domains.ts`). Nothing in this file knows what a customer is,
 * which is the point: switch the host and the same list renders services.
 */

export function RecordTable() {
  const { session, schema } = useSession();
  const { run } = useStore();
  const [filter, setFilter] = useState<string>('all');
  const selected = new Set(session.selectedResourceIds);
  const mandate = session.mandate?.status === 'ACTIVE' ? session.mandate : null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void run(() => api.setSelection([...next]));
  };

  // A real CRM tells you what you are looking at before you read a row. These
  // are derived, never stored: the host has to behave like software somebody's
  // revenue team already uses, or the argument about layering onto it is being
  // made about a mock.
  // `arr` is a preformatted display string ("€184,000"), not a number — the
  // seed carries it the way the record would show it.
  const d = schema.domain;
  const editable = d.fields.filter((f) => !f.untrusted);
  const untrusted = d.fields.find((f) => f.untrusted);
  const statusOptions = d.fields.find((f) => f.key === d.statusField)?.options ?? [];

  const sum = d.sumField
    ? session.resources.reduce((n, r) => n + euros(r.values[d.sumField!]), 0)
    : null;
  const warning = session.resources.filter((r) =>
    d.warnStatuses.includes(r.values[d.statusField] ?? ''),
  ).length;
  const shown =
    filter === 'all'
      ? session.resources
      : session.resources.filter((r) => r.values[d.statusField] === filter);

  return (
    <section className="panel panel--fill">
      <div className="panel__head">
        <h2 className="panel__title">{d.collection}</h2>
        <span className="panel__count">{session.resources.length}</span>
        <div className="panel__actions">
          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
            {selected.size} selected
          </span>
          <button
            className="btn btn--quiet btn--sm"
            disabled={selected.size === 0}
            onClick={() => void run(() => api.setSelection([]))}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="crmbar">
        {sum !== null && (
          <div className="stat">
            <span className="stat__k">{d.sumLabel}</span>
            <span className="stat__v">{money(sum)}</span>
          </div>
        )}
        <div className="stat">
          <span className="stat__k">Needs attention</span>
          <span className={`stat__v${warning > 0 ? ' stat__v--warn' : ''}`}>{warning}</span>
        </div>
        <div className="stat">
          <span className="stat__k">{LABEL_OWNERS[d.id] ?? 'Owners'}</span>
          <span className="stat__v">
            {new Set(session.resources.map((r) => r.values[d.ownerField])).size}
          </span>
        </div>
        <div className="crmbar__filters" role="group" aria-label={`Filter by ${d.statusField}`}>
          {['all', ...statusOptions].map((s) => (
            <button
              key={s}
              className={`filt${filter === s ? ' filt--on' : ''}`}
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="panel__body panel__body--flush panel__body--scroll">
        <ul className="customers">
          {shown.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              selected={selected.has(resource.id)}
              delegatedFields={
                mandate?.resourceIds.includes(resource.id) ? mandate.allowedFields : null
              }
              fields={editable}
              untrusted={untrusted}
              headlineField={d.headlineField}
              ownerField={d.ownerField}
              statusField={d.statusField}
              statusOptions={statusOptions}
              onToggle={() => toggle(resource.id)}
            />
          ))}
        </ul>
      </div>

      <footer className="customers__legend">
        <span className="legend__item">
          <span className="legend__swatch legend__swatch--selected" /> Selected — proposes scope
        </span>
        <span className="legend__item">
          <span className="legend__swatch legend__swatch--delegated" /> Delegated — grants authority
        </span>
      </footer>
    </section>
  );
}

function ResourceRow({
  resource,
  selected,
  delegatedFields,
  fields,
  untrusted,
  headlineField,
  ownerField,
  statusField,
  statusOptions,
  onToggle,
}: {
  resource: Resource;
  selected: boolean;
  delegatedFields: readonly string[] | null;
  fields: readonly FieldSpec[];
  untrusted?: FieldSpec;
  headlineField: string;
  ownerField: string;
  statusField: string;
  statusOptions: readonly string[];
  onToggle(): void;
}) {
  const { session } = useSession();
  const { mode } = useMode();
  const row = useRef<HTMLLIElement | null>(null);
  // The approval opens from the change itself. It used to hang off the row
  // header, which on a full-width row put the control about fourteen hundred
  // pixels from the diff it was about — present, passing its test, and not
  // findable.
  const reviewAnchor = useRef<HTMLElement | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const staged = session.changes.filter(
    (c) => c.resourceId === resource.id && c.state !== 'APPLIED',
  );
  // One approval, one control. The popover reviews every staged change on the
  // record, so a chip on each staged field was the same act offered twice —
  // it anchors on the first staged diff and says how many it covers.
  const reviewKey = fields.find((spec) => staged.some((c) => c.field === spec.key))?.key;
  const anyStale = staged.some((c) => c.state === 'STALE');

  return (
    <li
      ref={row}
      className={[
        'customer',
        selected ? 'customer--selected' : '',
        delegatedFields ? 'customer--delegated' : '',
        mode === 'minimal' && staged.length > 0 ? 'customer--awaiting' : '',
      ].join(' ')}
    >
      <div className="customer__head">
        <label className="customer__pick">
          <input type="checkbox" checked={selected} onChange={onToggle} />
          <span className="sr-only">Select {resource.name}</span>
        </label>
        <span className={`avatar avatar--${hue(resource.values[ownerField] ?? '')}`} aria-hidden>
          {initials(resource.values[ownerField] ?? '')}
        </span>
        <div className="customer__ident">
          <span className="customer__name">{resource.name}</span>
          <span className="customer__segment">{resource.subtitle}</span>
        </div>
        <span className="customer__arr">{resource.values[headlineField]}</span>
        {delegatedFields && (
          <span className="chip chip--scope" title="This record is inside the active mandate">
            <span className="chip__dot" />
            delegated
          </span>
        )}
      </div>

      <dl className="fields">
        {fields.map((spec) => (
          <EditableField
            key={spec.key}
            resource={resource}
            spec={spec}
            delegated={Boolean(delegatedFields?.includes(spec.key))}
            pending={staged.find((c) => c.field === spec.key)?.after}
            stale={anyStale}
            reviewCount={staged.length}
            onReview={
              mode === 'minimal' && spec.key === reviewKey
                ? (el) => {
                    reviewAnchor.current = el;
                    setReviewing(true);
                  }
                : undefined
            }
          />
        ))}
        <div className="field field--readonly">
          <dt className="field__label">Health</dt>
          <dd className="field__value">
            {/* Filled from the record's position in the status field's own
                option list, so a new host gets a health indicator for free. */}
            <span
              className={`health health--${bars(resource.values[statusField] ?? '', statusOptions)}`}
            >
              <span className="health__bar" />
              <span className="health__bar" />
              <span className="health__bar" />
            </span>
          </dd>
        </div>
      </dl>

      {mode === 'minimal' && (
        <ApprovalPopover
          resourceId={resource.id}
          anchorRef={reviewAnchor}
          open={reviewing}
          onClose={() => setReviewing(false)}
        />
      )}

      {untrusted && (
        <p className="customer__notes" title="External content. Never an instruction to any tool.">
          <span className="customer__notes-tag">{untrusted.label.toLowerCase()} · untrusted</span>
          {resource.values[untrusted.key]}
        </p>
      )}
    </li>
  );
}

function EditableField({
  resource,
  spec,
  delegated,
  pending,
  stale,
  reviewCount = 0,
  onReview,
}: {
  resource: Resource;
  spec: FieldSpec;
  delegated: boolean;
  pending?: string;
  /** Record-level: any staged change on this record is stale, not just this field's. */
  stale?: boolean;
  reviewCount?: number;
  onReview?(anchor: HTMLElement): void;
}) {
  const { run } = useStore();
  const field = spec.key;
  const value = resource.values[field] ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) void run(() => api.stage(resource.id, field, draft));
  };

  return (
    <div className={`field${delegated ? ' field--delegated' : ''}`}>
      <dt className="field__label">
        {spec.label}
        {delegated && <span className="field__scope" aria-label="in delegated scope" />}
      </dt>
      <dd className="field__value">
        {editing ? (
          spec.options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              className="field__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
            >
              {spec.options.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              className="field__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(value);
                  setEditing(false);
                }
              }}
            />
          )
        ) : (
          <button
            className={`field__edit${pending !== undefined ? ' field__edit--staged' : ''}`}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            title="Edit as the human. A human needs no mandate."
          >
            {pending !== undefined ? (
              <span className="delta">
                <span className="delta__before">{value}</span>
                <span className="delta__arrow">→</span>
                <span className="delta__after">{pending}</span>
              </span>
            ) : (
              value
            )}
          </button>
        )}
        {pending !== undefined && onReview && !editing && (
          <button
            className={`review${stale ? ' review--stale' : ''}`}
            onClick={(e) => onReview(e.currentTarget)}
          >
            {stale ? 'Redo' : reviewCount > 1 ? `Review ${reviewCount} changes` : 'Review'}
          </button>
        )}
      </dd>
    </div>
  );
}

/** Presentation helpers. Derived from seeded data; nothing here is stored. */
const euros = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;

const money = (n: number) =>
  n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `€${Math.round(n / 1000)}k` : `€${n}`;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

/** Stable per-owner colour, so the same person is the same swatch every render
 *  — an avatar that changes colour is worse than no avatar. */
const hue = (name: string) =>
  ['a', 'b', 'c', 'd', 'e'][[...name].reduce((h, ch) => (h + ch.charCodeAt(0)) % 5, 0)];

/** The owner column is called something different in every host. */
const LABEL_OWNERS: Record<string, string> = { crm: 'Owners', deploy: 'On call' };

/**
 * How many of the three bars to fill, from where the record's status sits in
 * its own domain's option list. Ordered best-to-worst by convention in
 * `domains.ts`, so a new host inherits a health indicator without writing one.
 */
const bars = (value: string, options: readonly string[]): string => {
  const i = options.indexOf(value);
  if (i < 0) return 'unknown';
  const share = options.length <= 1 ? 1 : 1 - i / (options.length - 1);
  return share > 0.66 ? 'good' : share > 0.33 ? 'fair' : 'poor';
};
