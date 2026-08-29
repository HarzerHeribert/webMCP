import { test, expect } from '@playwright/test';
import { customerRow, openMandateLayer, panelByTitle } from './helpers';

/**
 * The layer is not part of the host, and the interface says so by being able to
 * remove it. `docs/12_DECISIONS.md` D-002: Relay CRM is the host; Mandate is the
 * product. Shut the product and the host is still a CRM.
 *
 * The rule that bounds the hiding is the important one: live authority can never
 * be concealed. A closed rail over an active mandate still names its version.
 */

test('the layer starts closed, and Relay CRM works without it', async ({ page }) => {
  await page.goto('/');

  const rail = page.getByRole('button', { name: 'Open the Mandate capability layer' });
  await expect(rail).toBeVisible();
  // No WebMCP in this browser, so the rail says what is missing rather than
  // offering a capability surface that could not exist.
  await expect(rail).toContainText('WebMCP required');

  // Nothing Mandate contributes is on screen.
  await expect(page.getByText('Capability inspector', { exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Staged changes', exact: true })).toBeHidden();

  // The host is fully usable on its own.
  await expect(panelByTitle(page, 'Accounts').getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(customerRow(page, 'Northwind Logistics')).toBeVisible();
});

test('without WebMCP the layer will not reveal itself, and says why', async ({ page }) => {
  await page.goto('/');
  // Selecting normally opens the layer. With no WebMCP it must not: there is no
  // capability surface to reveal.
  await customerRow(page, 'Atlas Freight').locator('.customer__pick input').click();
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Open the Mandate capability layer' }).click();
  await expect(page.getByRole('heading', { name: 'This browser has no WebMCP.' })).toBeVisible();
  await expect(page.getByText('WEBMCP_UNAVAILABLE', { exact: true })).toBeVisible();
  // Still nothing claiming to be live.
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeHidden();

  // The override is explicit, and only then does the surface appear.
  await page.getByRole('button', { name: 'Run the demo with the simulated caller' }).click();
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeVisible();
  await expect(page.getByText('WebMCP capability layer', { exact: true })).toBeVisible();
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
