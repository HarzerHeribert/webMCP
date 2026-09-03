import { useRef, useState, type RefObject } from 'react';
import { Liquid } from 'liquid-gooey';
import { api } from '../lib/api';
import { useSession, useStore } from '../lib/store';
import { AuthorityPanel } from './AuthorityPanel';
import { AuthorityGlow } from './AuthorityGlow';
import { Popover } from './Popover';

/**
 * Mandate with no panel at all.
 *
 * What has to be permanently visible turns out to be one thing: **live
 * authority**, which this product will not hide under any circumstances. Scope
 * is already legible without a panel — the delegated rows carry the amber ring —
 * and pending work is already legible, because the record table renders the
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
  const selected = session.selectedResourceIds.length;
  const pending = session.changes.filter((c) => c.state !== 'APPLIED').length;

  const label = mandate
    ? `active · v${mandate.version}`
    : selected > 0
      ? `${selected} selected`
      : 'not in use';

  return (
    /* The pill and its popover are one liquid body, not two surfaces that
       happen to sit near each other. `liquid-gooey` paints a single merged
       silhouette behind both — so opening does not summon a panel, it opens
       the pill — and it does that on a filtered SVG layer *behind* the real
       DOM, which is why the panel's text stays pixel-crisp and its shadow
       survives the merge.
       The root has to be given a box of its own, because both children are
       `position: fixed` and so contribute nothing to a normal element's box:
       the group has to be told how big the world is, or the filter region
       collapses to nothing. How big is a performance decision, and it is made
       in `src/styles/app.css` — see `.mandate-liquid`. */
    <Liquid
      className="mandate-liquid"
      /* `position` alone, and only because the group hard-codes
         `position: relative` as an inline style that no class can outrank.
         Everything else about the box is in the stylesheet, next to the
         numbers it is derived from. */
      style={{ position: 'fixed' }}
      blur={7}
      contrast={22}
      fill="#1b222d"
      /* One layer, and it must stay one. A shadow with no spread and no `inset`
         is the only kind this library hands to CSS `drop-shadow`, which is the
         GPU path; anything else joins the SVG filter chain as extra passes.
         The rim light on this body was tried here first, as
         `inset 0 1px 0 rgba(255,255,255,.11)`, and it cost 80ms of the frame
         the popover opens — a worse stall than the viewport-sized filter this
         pass was fixing. It lives in `src/styles/app.css` now, as an ordinary
         inset box-shadow on the real card and the real pill. Measure before
         adding a second layer here. */
      shadow="0 14px 44px rgba(0, 0, 0, .46)"
    >
      {/* In product mode this pill is the only surface Mandate owns, so it is
          also the only thing on the screen permitted to glow — and it does so
          exactly while the mandate is live. The halo blooms outward here
          because the pill floats over the host and nothing crops it. */}
      {/* The dock is the outer element on purpose: `BorderBeam` sets
          `position: relative` on its own container from an injected stylesheet
          that loads after ours, so a fixed position put on the beam itself is
          silently overridden and the pill drops into the document flow. */}
      {/* `radius` is stated rather than measured: the liquid reads the
          border-radius off the element it is given, and that element is the
          dock, which is square. The blob has to be the pill. */}
      <Liquid.Item observe radius={999}>
        <div className="pill-dock">
          <AuthorityGlow active={!!mandate} bloom="outside">
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
          </AuthorityGlow>
        </div>
      </Liquid.Item>

      {/* `observe`, deliberately not `morph.shape`. The shape springs start
          from the blob's initial state, which for an item mounted at full size
          is a zero-rect at the group's origin — the liquid launched from the
          top-left of the viewport and flew across the page to meet the card,
          content blurred illegible the whole way. Plain observe tracks the
          rendered rect, so the growth is the CSS extrusion below and the goo's
          only job is the neck into the pill, which is the part worth having. */}
      {/* Mounted with the popover, not around it: the item binds its blob to
          `firstElementChild` in a layout effect that bails when there is no
          child and never rebinds, and a closed `Popover` renders nothing. Held
          open across the toggle, the liquid would stay a 0×0 rect forever. */}
      {open && (
        <Liquid.Item observe>
          <Popover anchorRef={pill} open onClose={() => setOpen(false)} label="Delegated authority" side="top">
            <AuthorityPanel glow={false} />
            <CommitDock onDone={() => setOpen(false)} />
          </Popover>
        </Liquid.Item>
      )}
    </Liquid>
  );
}

/**
 * Commit, moved to the authority that permitted it.
 *
 * It used to live in the approval popover anchored to the record, which put the
 * one irreversible act on every row carrying staged work — several doors into
 * the same decision, each of them one click from whatever was on screen. Here
 * there is one, behind a deliberate press on the pill, beside the mandate whose
 * scope decided what could be staged in the first place.
 *
 * This is not a control. A browser-driving agent presses it exactly as easily
 * as a person does, and `docs/18_LIMITATIONS.md` says so plainly: a page cannot
 * tell a synthesised click from a human one. What moving it buys is coherence —
 * the product now says in one place where it thinks the decision belongs.
 */
function CommitDock({ onDone }: { onDone(): void }) {
  const { session } = useSession();
  const { run } = useStore();

  const pending = session.changes.filter((c) => c.state !== 'APPLIED');
  const stale = pending.some((c) => c.state === 'STALE');
  const ready = pending.length > 0 && !stale;

  return (
    <div
      className={`commit-dock${ready ? ' commit-dock--ready' : ''}${stale ? ' commit-dock--blocked' : ''}`}
    >
      <div className="commit-dock__copy">
        <span className="commit-dock__title">Apply is a human action</span>
        <span className="commit-dock__sub">
          {stale
            ? 'Stale work must be redone first.'
            : pending.length === 0
              ? 'Nothing staged to commit.'
              : `${pending.length} change${pending.length === 1 ? '' : 's'} staged.`}
        </span>
      </div>
      <button
        className="btn btn--primary btn--sm commit-dock__go"
        disabled={!ready}
        onClick={() =>
          void run(async () => {
            const checked = await api.validate();
            const blocked = checked.session.changes.some(
              (c) => c.state !== 'APPLIED' && c.state !== 'VALIDATED',
            );
            if (blocked) return checked;
            const done = await api.apply(session.revision);
            onDone();
            return done;
          })
        }
      >
        Apply{pending.length > 0 ? ` ${pending.length}` : ''}
      </button>
    </div>
  );
}

/**
 * The approval, where the thing being approved is.
 *
 * Anchored to the record, so the row it would change is on screen and uncovered
 * while the decision is made — which a modal cannot promise and a sidebar only
 * manages by permanently spending the space.
 */
export function ApprovalPopover({
  resourceId,
  anchorRef,
  open,
  onClose,
}: {
  resourceId: string;
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose(): void;
}) {
  const { session } = useSession();
  const { run, lastError } = useStore();

  const mine = session.changes.filter((c) => c.resourceId === resourceId && c.state !== 'APPLIED');
  if (mine.length === 0) return null;

  const stale = mine.some((c) => c.state === 'STALE');
  const byAgent = mine.some((c) => c.touchedBy.includes('agent'));

  return (
    <>
      <Popover anchorRef={anchorRef} open={open} onClose={onClose} label="Review staged changes" side="top">
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
          </div>
          {/* Review is anchored to the record; commit is not. The one
              irreversible act does not get an entry point on every row that
              happens to have staged work — it has exactly one, at the pill. */}
          <p className="approve__foot">
            Reviewing here. Commit at the <span className="approve__where">Mandate</span> pill.
          </p>
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
