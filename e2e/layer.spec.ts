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
    await page.getByRole('button', { name: 'Open the Mandate capability layer' }).click();

    await expect(
      page.getByRole('heading', { name: 'ChatGPT has not exposed site tools to this page.' }),
    ).toBeVisible();
    await expect(page.getByText('Enable site tools')).toBeVisible();
    // The Chrome remedy is useless here and must not be the instruction given.
    await expect(page.getByText('enable-webmcp-testing')).toBeHidden();

    // The demo is still reachable, which is the whole point of the gate.
    await page.getByRole('button', { name: 'Run the demo with the simulated caller' }).click();
    await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeVisible();
  });
});

test.describe('the ChatGPT mobile app is told the truth: there is nothing to turn on', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ChatGPT/1.2026.8 Mobile/15E148',
  });

  test('it names the desktop app rather than a setting that does not exist', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open the Mandate capability layer' }).click();

    await expect(
      page.getByRole('heading', { name: "ChatGPT's site tools are desktop-only." }),
    ).toBeVisible();
    await expect(page.getByText('Enable site tools')).toBeHidden();
    await page.getByRole('button', { name: 'Run the demo with the simulated caller' }).click();
    await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeVisible();
  });
});

/**
 * `docs/12_DECISIONS.md` is unchanged by the mode switch, and that is the point
 * worth testing: user mode removes panels and nothing else. What the server
 * enforces, and what the page registers, are identical either way.
 */
test('user mode drops the instrumentation without touching what is enforced', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await customerRow(page, 'Northwind Logistics').locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();

  // Technical mode: the reviewer's instruments are present.
  await expect(page.getByText('Capability inspector', { exact: true })).toBeVisible();
  await expect(page.getByText('Simulated caller', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'User', exact: true }).click();

  // User mode: gone, along with the guide that narrates them.
  await expect(page.getByText('Capability inspector', { exact: true })).toBeHidden();
  await expect(page.getByText('Simulated caller', { exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeHidden();

  // What a person needs is still there, and live authority is still declared —
  // the rule that bounds every other piece of hiding in this interface.
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeVisible();
  await expect(page.getByText('active · v1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Staged changes', exact: true })).toBeVisible();
  await expect(customerRow(page, 'Northwind Logistics')).toHaveClass(/customer--delegated/);

  // And the switch is a view, not a permission: back again, nothing was lost.
  await page.getByRole('button', { name: 'Technical', exact: true }).click();
  await expect(page.getByText('Capability inspector', { exact: true })).toBeVisible();
  await expect(page.getByText('active · v1')).toBeVisible();
});

/**
 * An approval that reads `nextAction · base r1 mandate v1 · draft` is a database
 * row. The person deciding whether to commit somebody else's edit needs a
 * sentence; the revision and mandate provenance are what make the *audit*
 * legible and belong with the rest of the instrumentation.
 */
test('an approval reads as a sentence in user mode, not as a record', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await customerRow(page, 'Northwind Logistics').locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();
  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-northwind',
    field: 'nextAction',
    value: 'Book the exec sync',
    mandateVersion: '1',
  });

  const staged = panelByTitle(page, 'Staged changes');
  await expect(staged.getByText('base r1')).toBeVisible();
  await expect(staged.getByText('nextAction', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'User', exact: true }).click();

  await expect(staged.getByText('Next action', { exact: true })).toBeVisible();
  await expect(staged.getByText('the agent staged this')).toBeVisible();
  await expect(staged.getByText('base r1')).toBeHidden();
  await expect(staged.getByText('mandate v1')).toBeHidden();
  await expect(staged.getByText('nextAction', { exact: true })).toBeHidden();

  // Validation is a step in the mechanism, not a decision: one button.
  await expect(staged.getByRole('button', { name: 'Validate', exact: true })).toBeHidden();

  // The one state that must stop somebody has to say what it means — and
  // pressing Apply is what surfaces it, since there is nothing else to press.
  await page.getByRole('button', { name: 'Simulate external update' }).click();
  await staged.getByRole('button', { name: /^Apply / }).click();
  await expect(staged.getByText(/the record moved on/)).toBeVisible();
  await expect(page.getByText(/APPLIED THIS SESSION/i)).toBeHidden();
});

test('in user mode one button checks and commits, and says so', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await customerRow(page, 'Northwind Logistics').locator('.customer__pick input').click();
  await page.getByRole('button', { name: /^Delegate/ }).click();
  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-northwind',
    field: 'status',
    value: 'Active',
    mandateVersion: '1',
  });
  await page.getByRole('button', { name: 'User', exact: true }).click();

  const staged = panelByTitle(page, 'Staged changes');
  await expect(staged.getByText('Applying checks these against the record first.')).toBeVisible();
  await staged.getByRole('button', { name: /^Apply / }).click();

  // One press, no prior Validate, and the value is in the CRM.
  await expect(staged.getByText('applied', { exact: true })).toBeVisible();
  await expect(customerRow(page, 'Northwind Logistics').getByText('Active')).toBeVisible();
});
