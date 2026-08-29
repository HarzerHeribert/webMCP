import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * Which of two audiences the interface is currently addressing.
 *
 * Sorting the layer's panels by who they are *for* splits them cleanly, and the
 * split is uncomfortable: the capability inspector is the most important panel
 * in the product for a reviewer and the least important for a user, who would
 * never open it. The simulated caller is a test harness that exists only
 * because there is no model. The timeline is an audit log, not a workspace.
 *
 * So most of what the layer shows is **instrumentation for the argument**, not
 * the product. Presenting it as the product is what makes Mandate look like it
 * demands two-thirds of a screen forever, when the shipping form is a status
 * pill plus two moments — grant, and apply.
 *
 * `technical` is the default because a reviewer with three minutes needs the
 * mechanism visible; hiding the schema would hide the entire claim.
 *
 * `minimal` is the product. There is no panel: authority is a pill that cannot
 * be hidden, scope is the ring on the records themselves, pending work is the
 * value already rendered inline on the field it would change — and the two
 * moments that genuinely need a surface get a popover anchored to what they
 * concern. A middle form with one slimmer panel existed for a while and was
 * removed: it was still a permanent panel, which was the whole objection. Nothing about enforcement differs
 * between them: the mode changes which panels render and nothing else, and
 * `server/core/policy.ts` never learns which one is on.
 */
export type Mode = 'technical' | 'minimal';

const ModeContext = createContext<{ mode: Mode; setMode(m: Mode): void }>({
  mode: 'technical',
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('technical');
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
