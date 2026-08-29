import { useEffect, useRef, useState } from 'react';
import { useMode } from '../lib/mode';
import { RowApproval } from './MinimalLayer';
import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';
import type { Customer, CustomerField } from '../../server/core/types';

/**
 * Relay CRM's customer list, and the place the product's central distinction is
 * made visible: **selection proposes, delegation grants**. A selected row gets a
 * cool rail and a checkbox. A delegated row gets the amber authority ring and a
 * scope chip. They are never the same treatment, and a row can be one without
 * the other — which is exactly the M2 gate the audience needs to see.
 */

const EDITABLE: CustomerField[] = ['status', 'nextAction', 'owner', 'renewalDate'];
const LABEL: Record<CustomerField, string> = {
  status: 'Status',
  nextAction: 'Next action',
  owner: 'Owner',
  renewalDate: 'Renewal',
  arr: 'ARR',
  notes: 'Notes',
};

export function CustomerTable() {
  const { session, schema } = useSession();
  const { run } = useStore();
  const [filter, setFilter] = useState<string>('all');
  const selected = new Set(session.selectedCustomerIds);
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
  const pipeline = session.customers.reduce((sum, c) => sum + euros(c.arr), 0);
  const atRisk = session.customers.filter((c) => c.status === 'At risk').length;
  const shown = filter === 'all' ? session.customers : session.customers.filter((c) => c.status === filter);

  return (
    <section className="panel panel--fill">
      <div className="panel__head">
        <h2 className="panel__title">Accounts</h2>
        <span className="panel__count">{session.customers.length}</span>
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
        <div className="stat">
          <span className="stat__k">Pipeline</span>
          <span className="stat__v">{money(pipeline)}</span>
        </div>
        <div className="stat">
          <span className="stat__k">At risk</span>
          <span className={`stat__v${atRisk > 0 ? ' stat__v--warn' : ''}`}>{atRisk}</span>
        </div>
        <div className="stat">
          <span className="stat__k">Owners</span>
          <span className="stat__v">{new Set(session.customers.map((c) => c.owner)).size}</span>
        </div>
        <div className="crmbar__filters" role="group" aria-label="Filter accounts by status">
          {['all', ...schema.statuses].map((s) => (
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
          {shown.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              selected={selected.has(customer.id)}
              delegatedFields={
                mandate?.customerIds.includes(customer.id) ? mandate.allowedFields : null
              }
              statuses={schema.statuses}
              onToggle={() => toggle(customer.id)}
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

function CustomerRow({
  customer,
  selected,
  delegatedFields,
  statuses,
  onToggle,
}: {
  customer: Customer;
  selected: boolean;
  delegatedFields: readonly string[] | null;
  statuses: readonly string[];
  onToggle(): void;
}) {
  const { session } = useSession();
  const { mode } = useMode();
  const row = useRef<HTMLLIElement | null>(null);
  const staged = session.changes.filter(
    (c) => c.customerId === customer.id && c.state !== 'APPLIED',
  );

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
          <span className="sr-only">Select {customer.name}</span>
        </label>
        <span className={`avatar avatar--${hue(customer.owner)}`} aria-hidden>
          {initials(customer.owner)}
        </span>
        <div className="customer__ident">
          <span className="customer__name">{customer.name}</span>
          <span className="customer__segment">{customer.segment}</span>
        </div>
        <span className="customer__arr" title="Annual recurring revenue">{customer.arr}</span>
        {delegatedFields && (
          <span className="chip chip--scope" title="This customer is inside the active mandate">
            <span className="chip__dot" />
            delegated
          </span>
        )}
        {mode === 'minimal' && <RowApproval customerId={customer.id} />}
      </div>

      <dl className="fields">
        {EDITABLE.map((field) => (
          <EditableField
            key={field}
            customer={customer}
            field={field}
            statuses={statuses}
            delegated={Boolean(delegatedFields?.includes(field))}
            pending={staged.find((c) => c.field === field)?.after}
          />
        ))}
        <div className="field field--readonly">
          <dt className="field__label">{LABEL.arr}</dt>
          <dd className="field__value mono">{customer.arr}</dd>
        </div>
        <div className="field field--readonly">
          <dt className="field__label">Health</dt>
          <dd className="field__value">
            <span className={`health health--${slug(customer.status)}`}>
              <span className="health__bar" />
              <span className="health__bar" />
              <span className="health__bar" />
            </span>
          </dd>
        </div>
      </dl>

      <p className="customer__notes" title="External content. Never an instruction to any tool.">
        <span className="customer__notes-tag">notes · untrusted</span>
        {customer.notes}
      </p>
    </li>
  );
}

function EditableField({
  customer,
  field,
  statuses,
  delegated,
  pending,
}: {
  customer: Customer;
  field: CustomerField;
  statuses: readonly string[];
  delegated: boolean;
  pending?: string;
}) {
  const { run } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(customer[field]));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== String(customer[field])) void run(() => api.stage(customer.id, field, draft));
  };

  const value = String(customer[field]);

  return (
    <div className={`field${delegated ? ' field--delegated' : ''}`}>
      <dt className="field__label">
        {LABEL[field]}
        {delegated && <span className="field__scope" aria-label="in delegated scope" />}
      </dt>
      <dd className="field__value">
        {editing ? (
          field === 'status' ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              className="field__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
            >
              {statuses.map((s) => (
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

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');
