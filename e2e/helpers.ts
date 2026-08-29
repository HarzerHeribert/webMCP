import type { Page } from '@playwright/test';

/**
 * The `Header` component renders a row of `.readout` divs, each a pair of
 * spans: `readout__label` then `readout__value` (see `src/components/Header.tsx`).
 * There is no `data-testid` to hook (components are not ours to edit), so this
 * reads the value back by locating its exact-text label and walking to its
 * sibling — visible text is the hook.
 */
export async function readout(page: Page, label: string): Promise<string> {
  const labelEl = page.getByText(label, { exact: true });
  const parent = labelEl.locator('xpath=..');
  const value = parent.locator('span').last();
  return (await value.innerText()).trim();
}

/** Scope a locator to the panel whose `<h2>` title matches exactly, so a
 *  customer or timeline entry that happens to share text with another panel
 *  can't be picked up by accident. */
export function panelByTitle(page: Page, title: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}
