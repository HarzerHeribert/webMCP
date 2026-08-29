import { test, expect } from '@playwright/test';
import { customerRow, editFieldAsHuman, panelByTitle, readout, runSimulatedCaller, openMandateLayer } from './helpers';

/**
 * The shared workspace: a human edit and an agent edit landing on the same
 * field, an external write moving the ground under staged work, and the one
 * irreversible act — apply — that only a human can perform.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await expect(panelByTitle(page, 'Accounts').getByRole('heading', { name: 'Accounts' })).toBeVisible();
});

test('a human edit on a field the agent already staged co-edits the same change, marked with both provenance', async ({ page }) => {
  const authority = panelByTitle(page, 'Authority');
  const staged = panelByTitle(page, 'Staged changes');
  const atlasRow = customerRow(page, 'Atlas Freight');

  // Delegate `status` on Atlas, and have the agent stage it.
  await atlasRow.getByRole('checkbox', { name: 'Select Atlas Freight' }).click();
  await authority.getByRole('button', { name: 'nextAction', exact: true }).click();
  await authority.getByRole('button', { name: /^Delegate \d+ fields? on \d+ customers?$/ }).click();
  await expect(authority.getByText(/^active · v1$/)).toBeVisible();

  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-atlas',
    field: 'status',
    value: 'Active',
    mandateVersion: '1',
  });
  await expect(staged.locator('.change')).toHaveCount(1);
  await expect(staged.getByText('agent', { exact: true })).toBeVisible();

  // The human now edits the same field, in Relay CRM, to a different value.
  await editFieldAsHuman(atlasRow, 'Status', 'At risk');

  // Still exactly one staged change — it did not fork — and it is now
  // marked co-edited, carrying both the human and the agent's mark.
  await expect(staged.locator('.change')).toHaveCount(1);
  const change = staged.locator('.change').first();
  await expect(change.getByText('co-edited', { exact: true })).toBeVisible();
  await expect(change.locator('svg.prov--human')).toBeVisible();
  await expect(change.locator('svg.prov--agent')).toBeVisible();
  // the human's value is the one that survived
  await expect(change.getByText('At risk', { exact: true })).toBeVisible();
});

test('an external update conflicts staged work; rebase preserves the intended value and moves the baseline forward', async ({ page }) => {
  const staged = panelByTitle(page, 'Staged changes');
  const conflict = panelByTitle(page, 'Conflict & recovery');
  const meridianRow = customerRow(page, 'Meridian Health');

  // Stage a human edit on the exact field the demo instrument's external
  // update touches (Meridian Health's owner), so rebase's before/after can
  // be checked against a real value change, not just an unchanged one.
  await editFieldAsHuman(meridianRow, 'Owner', 'New Owner');
  await expect(staged.getByText('Dana Whitfield', { exact: true })).toBeVisible();

  // The demo instrument's trigger lives outside the conflict panel proper —
  // `ConflictPanel.tsx` only renders the "Conflict & recovery" section once
  // `lastError` is set, but the sim-strip with this button is always there.
  await page.getByRole('button', { name: 'Simulate external update' }).click();

  await staged.getByRole('button', { name: 'Validate' }).click();
  await expect(conflict.getByText('Revision conflict', { exact: true })).toBeVisible();
  await expect(staged.getByText('stale', { exact: true })).toBeVisible();

  await conflict.getByRole('button', { name: 'Rebase staged changes' }).click();

  // The intended `after` value survives the rebase unchanged...
  const change = staged.locator('.change').first();
  await expect(change.getByText('New Owner', { exact: true })).toBeVisible();
  // ...and the `before` has moved to the value the external update set,
  // because rebase re-reads the current record rather than replaying blind.
  await expect(change.getByText('Ravi Menon', { exact: true })).toBeVisible();
  await expect(change.getByText('Dana Whitfield', { exact: true })).toHaveCount(0);
  await expect(staged.getByText('draft', { exact: true })).toBeVisible();
});

test('applying a validated change updates the customer record, advances the revision, and can no longer be discarded', async ({ page }) => {
  const staged = panelByTitle(page, 'Staged changes');
  const meridianRow = customerRow(page, 'Meridian Health');

  expect(await readout(page, 'revision')).toBe('r1');
  await editFieldAsHuman(meridianRow, 'Owner', 'New Owner');

  await staged.getByRole('button', { name: 'Validate' }).click();
  await expect(staged.getByText('validated', { exact: true })).toBeVisible();

  await staged.getByRole('button', { name: /^Apply \d+ changes?$/ }).click();

  // The customer row shows the new value...
  await expect(meridianRow.getByRole('button', { name: 'New Owner' })).toBeVisible();
  // ...the header revision advanced...
  await expect.poll(() => readout(page, 'revision')).toBe('r2');
  // ...an APPLIED timeline row appears...
  await expect(panelByTitle(page, 'Timeline').getByText('applied', { exact: true }).first()).toBeVisible();
  // ...and the applied change can no longer be discarded.
  const appliedChange = staged.locator('.change--applied').first();
  await expect(appliedChange).toBeVisible();
  await expect(appliedChange.getByRole('button', { name: 'Discard' })).toHaveCount(0);
});
