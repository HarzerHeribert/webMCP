import { test, expect } from '@playwright/test';
import { panelByTitle, readout } from './helpers.ts';

/**
 * The human flow that exists today: select → delegate → the scope chips read
 * back exactly what was delegated → stage a human edit → validate → apply →
 * the customer row shows the new value and the revision advanced → reset
 * returns to the seed. Plus the one agent-path negative case that belongs at
 * this layer: a selected-but-not-delegated customer is refused server-side.
 *
 * Out of scope for this round, by instruction: the capability inspector, the
 * simulated caller, and the timeline. Their selectors don't exist yet — three
 * other files are being written in parallel. A later packet covers them.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(panelByTitle(page, 'Relay CRM · Customers').getByRole('heading', { name: 'Relay CRM · Customers' })).toBeVisible();
});

test('select, delegate, stage a human edit, validate, apply, then reset returns to the seed', async ({ page }) => {
  const customers = panelByTitle(page, 'Relay CRM · Customers');
  const authority = panelByTitle(page, 'Authority');
  const staged = panelByTitle(page, 'Staged changes');

  const atlasRow = customers.getByRole('listitem').filter({ hasText: 'Atlas Freight' });

  // ── select: proposes scope, grants nothing ──────────────────────────────
  const atlasCheckbox = atlasRow.getByRole('checkbox', { name: 'Select Atlas Freight' });
  await atlasCheckbox.click();
  await expect(atlasCheckbox).toBeChecked();

  // ── delegate ─────────────────────────────────────────────────────────────
  await authority.getByRole('button', { name: /^Delegate \d+ fields? on \d+ customers?$/ }).click();
  await expect(authority.getByText(/^active · v1$/)).toBeVisible();

  // ── the scope chips read back exactly what was delegated ───────────────
  await expect(authority.getByText('Atlas Freight', { exact: true })).toBeVisible();
  await expect(authority.getByText('status', { exact: true })).toBeVisible();
  await expect(authority.getByText('nextAction', { exact: true })).toBeVisible();
  // owner was never delegated: it must not appear as a scope chip.
  await expect(authority.getByText('owner', { exact: true })).toHaveCount(0);

  // ── stage a human edit — a human needs no mandate, so edit a field that
  //    was never delegated (owner), to make that point unambiguous ────────
  expect(await readout(page, 'revision')).toBe('r1');
  await atlasRow.getByRole('button', { name: 'Ravi Menon' }).click();
  const ownerInput = atlasRow.getByRole('textbox');
  await ownerInput.fill('Jordan Ellis');
  await ownerInput.press('Enter');
  await expect(atlasRow.getByText('Jordan Ellis')).toBeVisible(); // shows as a pending delta

  // ── validate ─────────────────────────────────────────────────────────────
  await staged.getByRole('button', { name: 'Validate' }).click();
  await expect(staged.getByText('validated', { exact: true })).toBeVisible();

  // ── apply ────────────────────────────────────────────────────────────────
  await staged.getByRole('button', { name: /^Apply \d+ changes?$/ }).click();

  // ── the customer row shows the new value and the revision advanced ─────
  await expect(atlasRow.getByRole('button', { name: 'Jordan Ellis' })).toBeVisible();
  await expect.poll(() => readout(page, 'revision')).toBe('r2');

  // ── reset returns to the seed ───────────────────────────────────────────
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(atlasRow.getByRole('button', { name: 'Ravi Menon' })).toBeVisible();
  await expect.poll(() => readout(page, 'revision')).toBe('r1');
  await expect(authority.getByText('none granted', { exact: true })).toBeVisible();
});

test('a customer that is selected but not delegated is refused on the agent path', async ({ page }) => {
  const customers = panelByTitle(page, 'Relay CRM · Customers');
  const authority = panelByTitle(page, 'Authority');

  const atlasRow = customers.getByRole('listitem').filter({ hasText: 'Atlas Freight' });
  const kestrelRow = customers.getByRole('listitem').filter({ hasText: 'Kestrel Analytics' });

  // Delegate Atlas Freight only.
  const atlasCheckbox = atlasRow.getByRole('checkbox', { name: 'Select Atlas Freight' });
  await atlasCheckbox.click();
  await expect(atlasCheckbox).toBeChecked();
  await authority.getByRole('button', { name: /^Delegate \d+ fields? on \d+ customers?$/ }).click();
  await expect(authority.getByText(/^active · v1$/)).toBeVisible();

  // Selection is independent of delegation: select Kestrel too. It is now
  // selected — proposed — but was never part of the mandate that was granted.
  const kestrelCheckbox = kestrelRow.getByRole('checkbox', { name: 'Select Kestrel Analytics' });
  await kestrelCheckbox.click();
  await expect(kestrelCheckbox).toBeChecked();
  await expect(kestrelRow.getByText('delegated', { exact: true })).toHaveCount(0);

  const sessionId = await readout(page, 'session');
  const mandateVersion = Number((await readout(page, 'mandate ver.')).replace(/^v/, ''));
  expect(mandateVersion).toBe(1);

  const res = await page.request.post('/api/tools/stage', {
    headers: { 'x-mandate-session': sessionId, 'content-type': 'application/json' },
    data: { customerId: 'c-kestrel', field: 'status', value: 'Active', mandateVersion },
  });

  expect(res.ok()).toBe(false);
  const body = await res.json();
  expect(body.error.code).toBe('OUT_OF_SCOPE');

  // Confirm the server refused it, not just the transport: Kestrel's status
  // is unchanged in the workspace.
  await expect(kestrelRow.getByText('Prospect', { exact: true })).toBeVisible();
});
