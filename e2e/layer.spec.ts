import { test, expect } from '@playwright/test';
import { customerRow, openMandateLayer, panelByTitle, runSimulatedCaller } from './helpers';

/**
 * The layer is not part of the host, and the interface says so by being able to
 * remove it. `docs/12_DECISIONS.md` D-002: Relay CRM is the host; Mandate is the
 * product. Shut the product and the host is still a CRM.
 *
 * The rule that bounds the hiding is the important one: live authority can never
 * be concealed. A closed rail over an active mandate still names its version.
 */

test('the instrument starts closed, and Relay CRM works without it', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.workbench');
  // The app opens as the product; this test is about the instrument behind it.
  await page.getByRole('button', { name: 'Technical', exact: true }).click();

  const rail = page.getByRole('button', { name: 'Open the Mandate capability layer' });
  await expect(rail).toBeVisible();

  // Nothing Mandate contributes is on screen.
  await expect(page.getByText('Capability inspector', { exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Staged changes', exact: true })).toBeHidden();

  // The host is fully usable on its own.
  await expect(panelByTitle(page, 'Accounts').getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(customerRow(page, 'Northwind Logistics')).toBeVisible();
});

test('without WebMCP the demo still runs, and says so without stopping anybody', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.workbench');

  // Said once, on screen, for the whole session — and never in the way.
  const banner = page.getByRole('status');
  await expect(banner.getByText('WEBMCP_UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(banner).toContainText('no tool is registered with a real agent');

  // Nothing was blocked: the product is usable with no override to take.
  await customerRow(page, 'Atlas Freight').locator('.customer__pick input').click();
  await page.getByRole('button', { name: 'Mandate — delegated authority' }).click();
  await expect(page.getByRole('dialog', { name: 'Delegated authority' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delegate/ })).toBeEnabled();

  // The remedy differs by host, so it is behind a disclosure rather than shouted.
  await expect(banner.getByRole('heading', { name: 'This browser has no WebMCP.' })).toBeHidden();
  await banner.getByRole('button', { name: 'Why, and how to fix it' }).click();
  await expect(banner.getByRole('heading', { name: 'This browser has no WebMCP.' })).toBeVisible();
  await expect(banner).toContainText('enable-webmcp-testing');
});

test('a closed layer still declares live authority — it cannot be hidden', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await customerRow(page, 'Atlas Freight').locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();
  await expect(page.getByText('active · v1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Close the Mandate capability layer' }).click();

  const rail = page.getByRole('button', { name: 'Open the Mandate capability layer' });
  await expect(rail).toBeVisible();
  // The mandate is still live, and the rail says so rather than going quiet.
  await expect(rail).toContainText('active · v1');
  // And the delegated record still carries its scope marking in the host.
  await expect(customerRow(page, 'Atlas Freight')).toHaveClass(/customer--delegated/);
});

test('the guide walks back when authority is withdrawn, instead of naming a beat you cannot perform', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await customerRow(page, 'Atlas Freight').locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();
  await expect(page.getByText('active · v1', { exact: true })).toBeVisible();

  // Stage something so the guide is past the delegation beat.
  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-atlas', field: 'status', value: 'At risk', mandateVersion: '1',
  });
  await expect(page.locator('.change')).toHaveCount(1);
  const guide = page.locator('.demo-guide');
  await expect(guide).not.toContainText('1/8');

  await page.getByRole('button', { name: 'Revoke now' }).click();
  await expect(page.getByText(/Mandate v\d+ was revoked/)).toBeVisible();

  // The agent beats need live authority. With none, the guide must point back
  // at delegation rather than at a step that can no longer be performed.
  await expect(guide).toContainText('2/8');
  await expect(guide).toContainText(/Delegate/i);
});

/**
 * The gate is what a judge sees when WebMCP is missing, and the challenge names
 * the ChatGPT desktop app's built-in browser as a place to test. Site tools are
 * absent from the mobile app entirely and switchable off on the desktop one, so
 * "relaunch Chrome with a flag" is advice a reader inside ChatGPT cannot act on.
 */
test.describe('inside the ChatGPT app, the gate gives advice that works there', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ChatGPT/1.2026.8 Electron/33',
  });

  test('the desktop app is told about site tools, not about a Chrome flag', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.workbench');
    await page.getByRole('status').getByRole('button', { name: 'Why, and how to fix it' }).click();

    await expect(
      page.getByRole('heading', { name: 'ChatGPT has not exposed site tools to this page.' }),
    ).toBeVisible();
    await expect(page.getByText('Enable site tools')).toBeVisible();
    // The Chrome remedy is useless here and must not be the instruction given.
    await expect(page.getByText('enable-webmcp-testing')).toBeHidden();
  });
});

test.describe('the ChatGPT mobile app is told the truth: there is nothing to turn on', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ChatGPT/1.2026.8 Mobile/15E148',
  });

  test('it names the desktop app rather than a setting that does not exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.workbench');
    await page.getByRole('status').getByRole('button', { name: 'Why, and how to fix it' }).click();

    await expect(
      page.getByRole('heading', { name: "ChatGPT's site tools are desktop-only." }),
    ).toBeVisible();
    await expect(page.getByText('Enable site tools')).toBeHidden();
  });
});

/**
 * The product form has no panel at all. What survives the removal is the rule
 * that bounds every other piece of hiding in this interface: live authority is
 * never invisible.
 */
test('the product form has no panel, and still cannot hide live authority', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await customerRow(page, 'Northwind Logistics').locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();

  await expect(page.getByText('Capability inspector', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Product', exact: true }).click();

  // Every panel is gone, including the layer itself.
  await expect(page.locator('.layer')).toHaveCount(0);
  await expect(page.getByText('Capability inspector', { exact: true })).toBeHidden();
  await expect(page.getByText('Simulated caller', { exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Staged changes', exact: true })).toBeHidden();

  // What is left states the live mandate, and the record still carries its ring.
  const pill = page.getByRole('button', { name: 'Mandate — delegated authority' });
  await expect(pill).toBeVisible();
  await expect(pill).toContainText('active · v1');
  await expect(customerRow(page, 'Northwind Logistics')).toHaveClass(/customer--delegated/);

  // The grant is reachable without a panel, anchored to the pill.
  await pill.click();
  await expect(page.getByRole('dialog', { name: 'Delegated authority' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke now' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Delegated authority' })).toBeHidden();
});

/**
 * The approval is anchored to the record it would change, so the row stays on
 * screen and uncovered while the decision is made — which is the argument for a
 * popover over both a modal and a permanent panel.
 */
test('the approval appears on the record, reads as a sentence, and commits in one press', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  const row = customerRow(page, 'Northwind Logistics');
  await row.locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();
  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-northwind',
    field: 'nextAction',
    value: 'Book the exec sync',
    mandateVersion: '1',
  });

  await page.getByRole('button', { name: 'Product', exact: true }).click();

  // The control sits on the change itself, not at the far end of the row.
  const field = row.locator('.field').filter({ hasText: 'Next action' });
  const review = field.getByRole('button', { name: 'Review', exact: true });
  await expect(review).toBeVisible();
  await review.click();

  const pop = page.getByRole('dialog', { name: 'Review staged changes' });
  await expect(pop).toContainText('The agent staged this');
  await expect(pop).toContainText('Next action');
  // The audit's provenance is not what an approver needs.
  await expect(pop).not.toContainText('base r');
  await expect(pop).not.toContainText('mandate v');

  await pop.getByRole('button', { name: 'Apply', exact: true }).click();

  // The popover put itself away, the record carries the value, and there is
  // nothing left to review — one press, no separate validate step.
  await expect(row.getByRole('button', { name: 'Review', exact: true })).toBeHidden();
  await expect(pop).toBeHidden();
  await expect(row.locator('.fields').getByText('Book the exec sync')).toBeVisible();
});

/** The record moving underneath is the one moment the check was worth showing. */
test('a stale approval refuses to commit and says why', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  const row = customerRow(page, 'Northwind Logistics');
  await row.locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();
  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-northwind',
    field: 'status',
    value: 'Active',
    mandateVersion: '1',
  });
  await page.getByRole('button', { name: 'Simulate external update' }).click();
  await page.getByRole('button', { name: 'Product', exact: true }).click();

  // Nothing is stale yet: staleness is what validation *discovers*, so the
  // control still offers a review and the discovery happens on pressing Apply.
  const field = row.locator('.field').filter({ hasText: 'Status' });
  await field.getByRole('button', { name: 'Review', exact: true }).click();
  const pop = page.getByRole('dialog', { name: 'Review staged changes' });
  await pop.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(pop.getByText(/record changed underneath|blocked/i)).toBeVisible();

  // And now it asks to be redone rather than reviewed again.
  await page.keyboard.press('Escape');
  await expect(field.getByRole('button', { name: 'Redo', exact: true })).toBeVisible();
});

