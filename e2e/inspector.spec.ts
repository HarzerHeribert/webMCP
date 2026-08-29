import { test, expect } from '@playwright/test';
import { panelByLabel, panelByTitle, readout, readToolSchema, toolRow, openMandateLayer } from './helpers';

/**
 * The capability inspector: `docs/15_DESIGN_SYSTEM.md`'s claim that the
 * inspector mirrors exactly what the mandate makes available, at every step
 * of the mandate's life — none, granted, narrowed, revoked.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await openMandateLayer(page);
  await expect(panelByTitle(page, 'Accounts').getByRole('heading', { name: 'Accounts' })).toBeVisible();
});

test('the inspector narrows exactly to what the mandate grants, and reverts to withheld on revoke', async ({ page }) => {
  const authority = panelByTitle(page, 'Authority');
  const inspector = panelByLabel(page, 'Capability inspector');

  // ── with no mandate: two registered read-only tools, three withheld with a
  //    stated reason each ────────────────────────────────────────────────
  // `.filter({ hasText })` matches case-insensitively, which would also pick
  // up the "Never registered" group; anchor on the heading's own exact start
  // so only the "Registered N" / "Withheld N" groups match.
  const registeredGroup = inspector
    .locator('.webmcp-group')
    .filter({ has: page.getByRole('heading', { level: 3, name: /^Registered\s/ }) });
  const withheldGroup = inspector
    .locator('.webmcp-group')
    .filter({ has: page.getByRole('heading', { level: 3, name: /^Withheld\s/ }) });
  await expect(registeredGroup.locator('li.webmcp-tool')).toHaveCount(2);
  await expect(toolRow(registeredGroup, 'mandate_get_workspace')).toBeVisible();
  await expect(toolRow(registeredGroup, 'mandate_get_capabilities')).toBeVisible();

  await expect(withheldGroup.locator('li.webmcp-tool')).toHaveCount(3);
  for (const name of ['mandate_stage_account_update', 'mandate_validate_changes', 'mandate_rebase_changes']) {
    const row = toolRow(withheldGroup, name);
    await expect(row).toBeVisible();
    // each withheld tool states why — not just that it is withheld
    await expect(row.getByText(/^Withheld: /)).toBeVisible();
  }

  // ── delegate `status` on Atlas Freight ──────────────────────────────────
  const atlasRow = panelByTitle(page, 'Accounts').getByRole('listitem').filter({ hasText: 'Atlas Freight' });
  await atlasRow.getByRole('checkbox', { name: 'Select Atlas Freight' }).click();
  await authority.getByRole('button', { name: 'nextAction', exact: true }).click(); // leave only `status` delegated
  await authority.getByRole('button', { name: /^Delegate \d+ fields? on \d+ / }).click();
  await expect(authority.getByText(/^active · v1$/)).toBeVisible();

  // ── mandate_stage_account_update becomes registered, and its rendered
  //    input schema names exactly that customer id and that field ────────
  // An active mandate — whatever its scope — registers all three mutating
  // tools at once (`mandate_validate_changes` and `mandate_rebase_changes`
  // operate over "whatever is staged", not a specific field, so they need no
  // narrower a scope than "a mandate exists"); it is `mandate_stage_account_update`'s
  // *schema*, not its registration, that narrows to the exact grant.
  await expect(registeredGroup.locator('li.webmcp-tool')).toHaveCount(5);
  await expect(withheldGroup.locator('li.webmcp-tool')).toHaveCount(0);
  const stageRow = toolRow(registeredGroup, 'mandate_stage_account_update');
  await expect(stageRow).toBeVisible();
  let schema = await readToolSchema(stageRow);
  let props = schema.properties as Record<string, { enum?: unknown[]; const?: unknown }>;
  expect(props.resourceId.enum).toEqual(['c-atlas']);
  expect(props.field.enum).toEqual(['status']);
  expect(props.mandateVersion.const).toBe(1);

  // ── narrow the mandate: the schema changes again ────────────────────────
  await authority.getByRole('button', { name: 'Narrow scope' }).click();
  const narrow = page.locator('.narrow');
  await narrow.getByRole('button', { name: 'status', exact: true }).click(); // drop status
  await narrow.getByRole('button', { name: 'nextAction', exact: true }).click(); // add nextAction
  await page.getByRole('button', { name: 'Publish narrowed mandate' }).click();
  await expect(authority.getByText(/^active · v2$/)).toBeVisible();
  expect(await readout(page, 'mandate ver.')).toBe('v2');

  schema = await readToolSchema(stageRow);
  props = schema.properties as Record<string, { enum?: unknown[]; const?: unknown }>;
  expect(props.resourceId.enum).toEqual(['c-atlas']);
  expect(props.field.enum).toEqual(['nextAction']);
  expect(props.mandateVersion.const).toBe(2);

  // ── revoke: back to withheld ─────────────────────────────────────────────
  await authority.getByRole('button', { name: 'Revoke now' }).click();
  // The status chip alone is ambiguous — the panel now carries one in its head
  // and one in the notice explaining what just ended. Assert the sentence, which
  // is the thing a person actually reads.
  await expect(authority.getByText(/Mandate v\d+ was revoked/)).toBeVisible();
  await expect(registeredGroup.locator('li.webmcp-tool')).toHaveCount(2);
  await expect(withheldGroup.locator('li.webmcp-tool')).toHaveCount(3);
  await expect(toolRow(withheldGroup, 'mandate_stage_account_update')).toBeVisible();
});

test('no WebMCP flag is needed: the header reads unavailable, and the simulated caller still drives the real tools', async ({ page }) => {
  // This suite runs in plain Chromium with no WebMCP flag, exactly the
  // browser a judge is likely to have. `webmcp.status` must therefore be
  // `unavailable` — and every other test in this suite, which all drive the
  // same simulated caller against the real tool implementations, is the
  // proof that the demo is unaffected by that.
  expect(await readout(page, 'webmcp')).toBe('unavailable');

  const inspector = panelByLabel(page, 'Capability inspector');
  await expect(inspector.getByText('WebMCP unavailable')).toBeVisible();
  await expect(inspector.getByText('WEBMCP_UNAVAILABLE')).toBeVisible();
});
