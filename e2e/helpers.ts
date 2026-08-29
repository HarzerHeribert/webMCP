import type { Locator, Page } from '@playwright/test';

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

/**
 * The capability inspector and the simulated caller render their panel title
 * as a `<span class="panel__title">`, not an `<h2>` (see `Inspector.tsx`,
 * `AgentConsole.tsx`) — `panelByTitle`'s heading-role filter matches neither.
 * This is the equivalent scope-by-exact-text for those two panels.
 */
export function panelByLabel(page: Page, title: string) {
  return page.locator('section').filter({ has: page.getByText(title, { exact: true }) });
}

/** The `<li class="webmcp-tool">` row for one named tool inside the
 *  inspector's Registered or Withheld group — scoped so a tool name that is a
 *  substring of another (there are none today, but this stays exact) can't be
 *  picked up by accident. */
export function toolRow(panel: Locator, name: string) {
  return panel.locator('li.webmcp-tool').filter({ has: panel.page().getByText(name, { exact: true }) });
}

/**
 * Reads back a registered tool's rendered `inputSchema` as parsed JSON. The
 * schema lives inside a native `<details>` the inspector starts closed;
 * setting `.open = true` directly (rather than clicking the `<summary>`,
 * which would *toggle* an already-open one shut on a second read) is
 * idempotent regardless of prior state, so this is safe to call more than
 * once against the same row across re-renders.
 */
export async function readToolSchema(row: Locator): Promise<Record<string, unknown>> {
  const details = row.locator('details');
  await details.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const text = await details.locator('pre').textContent();
  return JSON.parse(text ?? '{}');
}

/**
 * Drives the simulated caller exactly as a presenter would: pick the tool,
 * type each argument into the field whose label names it, press Run. Returns
 * the result panel so the caller can assert on it.
 */
export async function runSimulatedCaller(
  page: Page,
  toolName: string,
  args: Record<string, string>,
): Promise<Locator> {
  const caller = panelByLabel(page, 'Simulated caller');
  await caller.getByRole('button', { name: toolName, exact: true }).click();
  const form = caller.locator('form.webmcp-console__form');
  for (const [key, value] of Object.entries(args)) {
    await form.locator('label.webmcp-console__field').filter({ hasText: key }).locator('input').fill(value);
  }
  await form.getByRole('button', { name: `Run ${toolName}` }).click();
  const result = caller.locator('.webmcp-console__result');
  await result.waitFor();
  return result;
}

/** The customer row in Relay CRM's list, scoped by the customer's exact
 *  name so "Northwind" doesn't also match "Northwind Logistics Europe" or
 *  the like. */
export function customerRow(page: Page, name: string) {
  return panelByTitle(page, 'Relay CRM · Customers')
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });
}

/** Edits one field of a customer row as a human: opens the inline editor,
 *  commits the value, and waits for the commit round-trip. `status` renders
 *  as a `<select>`; every other editable field renders as a text `<input>`. */
export async function editFieldAsHuman(row: Locator, fieldLabel: string, value: string): Promise<void> {
  const field = row.locator('.field').filter({ has: row.page().getByText(fieldLabel, { exact: true }) });
  await field.locator('button.field__edit').click();
  const select = field.locator('select');
  if (await select.count()) {
    await select.selectOption(value);
    await select.blur();
  } else {
    const input = field.locator('input.field__input');
    await input.fill(value);
    await input.press('Enter');
  }
}
