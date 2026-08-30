import type { ReactNode } from 'react';
import { BorderBeam } from 'border-beam';

/**
 * The design rule in `src/styles/tokens.css` — **authority is the only thing
 * that glows** — rendered literally.
 *
 * Until now that rule was carried by a reserved colour: amber appears when a
 * human has delegated something, and nowhere else. Colour states the rule but
 * cannot make it felt, because a static swatch reads the same whether the
 * authority is live or was live a minute ago. A beam can only be one or the
 * other. Live authority breathes; the instant a mandate is revoked or expires
 * the light goes out, and that is the single most important state change in the
 * product.
 *
 * So this component exists to be the *only* caller of `BorderBeam` in the tree,
 * and it hard-codes the palette rather than exposing it. Every knob that could
 * turn the beam into decoration is spent here and spent once:
 *
 * - `colorVariant="sunset"` is the warm family — the amber of `--authority-fill`,
 *   not a colour a beam happened to be shipped with.
 * - `staticColors` with `hueRange={0}` kills the hue-shift animation. A beam
 *   that cycles through hues is ambience; this one is a state readout, and it
 *   must never drift into blue, which this palette has already spent on
 *   ordinary interaction.
 * - `saturation` is pulled below 1. The `sunset` family spans orange *through
 *   red*, and red is `--danger` in this palette — on the authority panel it sat
 *   inches from the red "Revoke now" button and read as a warning. Desaturating
 *   collapses that span into the single warm gold the token file reserves.
 *
 * - `theme="dark"` because every surface this wraps is dark. The layer, the
 *   popover and the pill all rescope the palette to the instrument's dark
 *   ground (`src/styles/app.css`, "different stuff"), and amber reads far
 *   louder there than it ever did on the host's white.
 *
 * `active` is the mandate's liveness and nothing else. Do not wrap anything in
 * this that is merely important.
 *
 * The effect itself is the `border-beam` package (MIT, © 2026 Jakub Antalik),
 * taken as a dependency rather than vendored, so its licence ships with it.
 */
export function AuthorityGlow({
  active,
  children,
  /** `inner` stays inside the element's own edge — for a panel in a scrolling
   *  column, where an outward bloom would be clipped into a smear. `outside`
   *  blooms past the edge, for something floating over the host. */
  bloom = 'inner',
  className,
  strength = 1,
}: {
  active: boolean;
  children: ReactNode;
  bloom?: 'inner' | 'outside';
  className?: string;
  strength?: number;
}) {
  return (
    <BorderBeam
      size={bloom === 'inner' ? 'pulse-inner' : 'pulse-outside'}
      colorVariant="sunset"
      theme="dark"
      staticColors
      hueRange={0}
      saturation={0.7}
      active={active}
      strength={strength}
      className={className ? `authority-glow ${className}` : 'authority-glow'}
    >
      {children}
    </BorderBeam>
  );
}
