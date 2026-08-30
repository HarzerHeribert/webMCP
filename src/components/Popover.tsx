import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * A panel that exists only while it is being used, anchored to the thing it is
 * about.
 *
 * The sidebar's problem was never its width — it was that it was permanent.
 * Authority is episodic: a person grants once and approves occasionally, and
 * between those moments there is nothing for a panel to say. So the two moments
 * get a surface anchored to what they concern (the record, the pill) and the
 * rest of the time the interface is the host, plus a pill that cannot be hidden.
 *
 * Deliberately not a modal: it does not cover the records the decision is about,
 * and the host stays usable underneath — `docs/12_DECISIONS.md` D-002 is a claim
 * that has to survive contact with the product's own chrome.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  label,
  side = 'top',
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose(): void;
  label: string;
  side?: 'top' | 'left';
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const a = anchorRef.current;
    const c = card.current;
    if (!a || !c) return;
    const r = a.getBoundingClientRect();
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    const gap = 10;
    const pad = 12;

    let left = side === 'left' ? r.left - w - gap : r.right - w;
    let top = side === 'left' ? r.top : r.top - h - gap;

    // Flip rather than overflow: a popover that has left the viewport is worse
    // than one on the other side of its anchor.
    if (top < pad) top = side === 'left' ? pad : r.bottom + gap;
    if (left < pad) left = side === 'left' ? r.right + gap : pad;
    left = Math.min(left, window.innerWidth - w - pad);
    top = Math.min(top, window.innerHeight - h - pad);
    setPos({ left, top });
  }, [anchorRef, side]);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (card.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const reflow = () => place();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, onClose, place, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={card}
      className="pop"
      role="dialog"
      aria-label={label}
      /* Placement happens in a layout effect after the first paint, so the
         card renders once at opacity 0 with no position. An entrance
         animation hung on mount would burn its first frames there; this marks
         the frame the card actually has somewhere to be. */
      data-placed={pos ? '' : undefined}
      style={pos ? { left: pos.left, top: pos.top } : { opacity: 0, left: 0, top: 0 }}
    >
      {children}
    </div>
  );
}
