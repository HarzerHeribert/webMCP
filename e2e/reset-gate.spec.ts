import { test, expect } from '@playwright/test';
import {
  customerRow,
  editFieldAsHuman,
  panelByLabel,
  panelByTitle,
  readout,
  readToolSchema,
  runSimulatedCaller,
  toolRow, openMandateLayer } from './helpers.ts';

/**
 * THE GATE: reset must replay the whole demo, in one uninterrupted run, with
 * no manual repair. This test drives every beat of `docs/17_DEMO_SCRIPT.md` —
 * delegate, inspector narrows, the agent stages, a refusal, co-edit, external
 * conflict, rebase, apply, revoke — then presses Reset demo, and proves the
 * seed is fully back by immediately re-performing the opening beat (select,
 * delegate, watch the inspector narrow) with no reload and no other repair
 * step in between.
 */

test('reset replays the whole demo end to end, with no manual repair', async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  const customers = panelByTitle(page, 'Accounts');
  await expect(customers.getByRole('heading', { name: 'Accounts' })).toBeVisible();

  const authority = panelByTitle(page, 'Authority');
  const staged = panelByTitle(page, 'Staged changes');
  const conflict = panelByTitle(page, 'Conflict & recovery');
  const timeline = panelByTitle(page, 'Timeline');
  const inspector = panelByLabel(page, 'Capability inspector');
  const registeredGroup = inspector
    .locator('.webmcp-group')
    .filter({ has: page.getByRole('heading', { level: 3, name: /^Registered\s/ }) });

  const atlasRow = customerRow(page, 'Atlas Freight');
  const kestrelRow = customerRow(page, 'Kestrel Analytics');
  const meridianRow = customerRow(page, 'Meridian Health');

  // ── 1 · select, delegate, watch the inspector narrow ────────────────────
  await atlasRow.getByRole('checkbox', { name: 'Select Atlas Freight' }).click();
  await authority.getByRole('button', { name: 'nextAction', exact: true }).click(); // leave only `status`
  await authority.getByRole('button', { name: /^Delegate \d+ fields? on \d+ customers?$/ }).click();
  await expect(authority.getByText(/^active · v1$/)).toBeVisible();

  const stageRow = toolRow(registeredGroup, 'mandate_stage_customer_update');
  await expect(stageRow).toBeVisible();
  const schema = await readToolSchema(stageRow);
  const props = schema.properties as Record<string, { enum?: unknown[] }>;
  expect(props.customerId.enum).toEqual(['c-atlas']);
  expect(props.field.enum).toEqual(['status']);

  // ── 2 · the agent stages, and is refused out of scope ───────────────────
  await kestrelRow.getByRole('checkbox', { name: 'Select Kestrel Analytics' }).click();
  await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-atlas',
    field: 'status',
    value: 'Active',
    mandateVersion: '1',
  });
  await expect(staged.locator('.change')).toHaveCount(1);

  const refused = await runSimulatedCaller(page, 'mandate_stage_customer_update', {
    customerId: 'c-kestrel',
    field: 'status',
    value: 'Active',
    mandateVersion: '1',
  });
  await expect(refused.getByText('OUT_OF_SCOPE', { exact: true })).toBeVisible();
  await expect(timeline.locator('.tl-row').filter({ hasText: 'refused' })).toHaveCount(1);

  // ── 3 · co-edit: the human edits the same field the agent staged ────────
  await editFieldAsHuman(atlasRow, 'Status', 'At risk');
  await expect(staged.locator('.change')).toHaveCount(1);
  await expect(staged.getByText('co-edited', { exact: true })).toBeVisible();

  // ── 4 · conflict and rebase, on a second staged change ──────────────────
  await editFieldAsHuman(meridianRow, 'Owner', 'New Owner');
  await expect(staged.locator('.change')).toHaveCount(2);
  // The demo instrument's trigger lives outside the conflict panel proper —
  // it is always present, unlike the "Conflict & recovery" section, which
  // only renders once an error exists.
  await page.getByRole('button', { name: 'Simulate external update' }).click();
  await staged.getByRole('button', { name: 'Validate' }).click();
  await expect(conflict.getByText('Revision conflict', { exact: true })).toBeVisible();
  await conflict.getByRole('button', { name: 'Rebase staged changes' }).click();
  await expect(staged.getByText('draft', { exact: true }).first()).toBeVisible();

  // ── 5 · validate, then apply ─────────────────────────────────────────────
  await staged.getByRole('button', { name: 'Validate' }).click();
  await expect(staged.getByText('validated', { exact: true }).first()).toBeVisible();
  await staged.getByRole('button', { name: /^Apply \d+ changes?$/ }).click();
  // r1 (seed) → r2 (the simulated external update) → r3 (this apply).
  await expect.poll(() => readout(page, 'revision')).toBe('r3');
  await expect(meridianRow.getByRole('button', { name: 'New Owner' })).toBeVisible();

  // ── 6 · revoke ────────────────────────────────────────────────────────────
  await authority.getByRole('button', { name: 'Revoke now' }).click();
  // The status chip alone is ambiguous — the panel now carries one in its head
  // and one in the notice explaining what just ended. Assert the sentence, which
  // is the thing a person actually reads.
  await expect(authority.getByText(/Mandate v\d+ was revoked/)).toBeVisible();
  await expect(toolRow(inspector.locator('.webmcp-group').filter({ hasText: 'Withheld' }), 'mandate_stage_customer_update')).toBeVisible();

  // ── the gate: reset, with no manual repair ───────────────────────────────
  await page.getByRole('button', { name: 'Reset demo' }).click();

  // the seed is back
  await expect(atlasRow.getByRole('button', { name: 'Trial' })).toBeVisible();
  await expect(meridianRow.getByRole('button', { name: 'Dana Whitfield' })).toBeVisible();
  await expect.poll(() => readout(page, 'revision')).toBe('r1');
  // no mandate
  await expect(authority.getByText('none granted', { exact: true })).toBeVisible();
  await expect(registeredGroup.locator('li.webmcp-tool')).toHaveCount(2);
  // no staged changes
  await expect(staged.getByText('Nothing staged', { exact: true })).toBeVisible();
  // the timeline is empty but for the reset
  await expect(timeline.locator('.tl-list > li')).toHaveCount(1);
  await expect(timeline.getByText('Session reset to the seeded state.', { exact: true })).toBeVisible();

  // ── step 1 can be performed again immediately, no reload, no repair ─────
  await atlasRow.getByRole('checkbox', { name: 'Select Atlas Freight' }).click();
  await authority.getByRole('button', { name: 'nextAction', exact: true }).click();
  await authority.getByRole('button', { name: /^Delegate \d+ fields? on \d+ customers?$/ }).click();
  await expect(authority.getByText(/^active · v1$/)).toBeVisible();

  const stageRowAgain = toolRow(registeredGroup, 'mandate_stage_customer_update');
  await expect(stageRowAgain).toBeVisible();
  const schemaAgain = await readToolSchema(stageRowAgain);
  const propsAgain = schemaAgain.properties as Record<string, { enum?: unknown[] }>;
  expect(propsAgain.customerId.enum).toEqual(['c-atlas']);
  expect(propsAgain.field.enum).toEqual(['status']);
});
