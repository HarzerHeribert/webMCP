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
  const selected = new Set(session.selectedCustomerIds);
  const mandate = session.mandate?.status === 'ACTIVE' ? session.mandate : null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void run(() => api.setSelection([...next]));
  };

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

      <div className="panel__body panel__body--flush panel__body--scroll">
        <ul className="customers">
          {session.customers.map((customer) => (
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
        <div className="customer__ident">
          <span className="customer__name">{customer.name}</span>
          <span className="customer__segment">{customer.segment}</span>
        </div>
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
