import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { customerRow, panelByLabel, panelByTitle } from '../e2e/helpers';
import { agentCall, beat, caption, click, installOverlay, point, setOrigin, timings } from './overlay';

/**
 * Records the demo. Not a test: it asserts only enough to fail loudly rather
 * than film the wrong thing.
 *
 * Every agent action below is a real `document.modelContext.executeTool` call
 * against the page's own registered tools — the flagged-Chrome path, not the
 * simulated caller. The beats and their narration are `demo/narration.json`;
 * the pacing comes from how long each line actually takes to say.
 *
 *   .venv-tts/bin/python scripts/demo-narrate.py     # voice + durations
 *   npx playwright test -c playwright.demo.config.ts # picture
 *   scripts/demo-assemble.sh                         # cut them together
 */
const script: { beats: { id: string; caption: string; say: string }[] } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'narration.json'), 'utf8'),
);
const line = (id: string) => script.beats.find((b) => b.id === id)!.caption;

const V1 = 1;

test('record the demo', async ({ page }) => {
  // Playwright starts the video when the page is created, a moment before this
  // line, so this is the video's zero to within a few milliseconds.
  setOrigin(Date.now());
  await page.goto('/');
  await page.waitForSelector('.workbench');
  await installOverlay(page);
  await page.waitForTimeout(900);

  // The flag has to have taken, or the whole recording is the fallback path.
  const live = await page.evaluate(() => typeof (document as never as { modelContext?: object }).modelContext);
  expect(live, 'flagged Chrome must expose document.modelContext').toBe('object');

  await beat(page, 'host', line('host'), async () => {
    await point(page, page.getByRole('button', { name: 'Open the Mandate capability layer' }));
  });

  await beat(page, 'problem', line('problem'), async () => {
    await click(page, page.getByRole('button', { name: 'Open the Mandate capability layer' }));
    await page.getByRole('heading', { name: 'Authority', exact: true }).waitFor();
  });

  const inspector = panelByLabel(page, 'Capability inspector');

  await beat(page, 'select', line('select'), async () => {
    await click(page, customerRow(page, 'Northwind Logistics').locator('.customer__pick input'));
    await click(page, customerRow(page, 'Atlas Freight').locator('.customer__pick input'));
    await point(page, inspector);
  });

  await beat(page, 'delegate', line('delegate'), async () => {
    const authority = panelByTitle(page, 'Authority');
    for (const field of ['status', 'nextAction']) {
      const chip = authority.getByRole('button', { name: field, exact: true });
      if ((await chip.getAttribute('aria-pressed')) !== 'true') await click(page, chip);
    }
    const ten = authority.getByRole('button', { name: '10 min', exact: true });
    if ((await ten.getAttribute('aria-pressed')) !== 'true') await click(page, ten);
    await click(page, authority.getByRole('button', { name: /^Delegate / }));
  });

  await beat(page, 'compiled', line('compiled'), async () => {
    await point(page, inspector);
    const row = inspector.locator('li.webmcp-tool').filter({ hasText: 'mandate_stage_customer_update' });
    await row.locator('details').evaluate((el) => ((el as HTMLDetailsElement).open = true));
    await point(page, row);
  });

  await click(page, page.getByRole('button', { name: 'Dismiss' }));

  await beat(page, 'stage', line('stage'), async () => {
    await agentCall(page, 'mandate_stage_customer_update', {
      customerId: 'c-northwind',
      field: 'status',
      value: 'Active',
      mandateVersion: V1,
    });
    await point(page, panelByTitle(page, 'Staged changes'));
  });

  await beat(page, 'refuse', line('refuse'), async () => {
    await agentCall(page, 'mandate_stage_customer_update', {
      customerId: 'c-kestrel',
      field: 'status',
      value: 'Active',
      mandateVersion: V1,
    });
    await point(page, panelByTitle(page, 'Timeline'));
  });

  await beat(page, 'injection', line('injection'), async () => {
    await point(page, customerRow(page, 'Atlas Freight'));
    // A *different* refusal from the one above, or the beat proves nothing new:
    // Atlas is inside the mandate, and `arr` still is not. Scope is two-dimensional.
    await agentCall(page, 'mandate_stage_customer_update', {
      customerId: 'c-atlas',
      field: 'arr',
      value: '999999',
      mandateVersion: V1,
    });
    await point(page, panelByTitle(page, 'Timeline'));
  });

  await beat(page, 'narrow', line('narrow'), async () => {
    const authority = panelByTitle(page, 'Authority');
    await click(page, authority.getByRole('button', { name: 'Narrow scope' }));
    await click(page, authority.getByRole('button', { name: 'nextAction', exact: true }));
    await click(page, authority.getByRole('button', { name: 'Publish narrowed mandate' }));
    await agentCall(page, 'mandate_stage_customer_update', {
      customerId: 'c-northwind',
      field: 'status',
      value: 'Churned',
      mandateVersion: V1,
    });
    await point(page, panelByTitle(page, 'Timeline'));
  });

  await beat(page, 'revoke', line('revoke'), async () => {
    await click(page, panelByTitle(page, 'Authority').getByRole('button', { name: 'Revoke now' }));
    await agentCall(page, 'mandate_stage_customer_update', {
      customerId: 'c-northwind',
      field: 'status',
      value: 'Churned',
      mandateVersion: V1,
    });
    await point(page, panelByTitle(page, 'Timeline'));
  });

  await beat(page, 'noapply', line('noapply'), async () => {
    // The claim is that apply is absent at every layer, so the shot has to be
    // the "never registered" fold itself, not the top of the inspector.
    const fold = inspector.locator('details.webmcp-absent-fold');
    await fold.evaluate((el) => (el as HTMLDetailsElement).open = true);
    await fold.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await point(page, fold.locator('summary'));
  });

  await beat(page, 'apply', line('apply'), async () => {
    const staged = panelByTitle(page, 'Staged changes');
    await click(page, staged.getByRole('button', { name: 'Validate', exact: true }));
    await click(page, staged.getByRole('button', { name: /^Apply / }));
    await point(page, customerRow(page, 'Northwind Logistics'));
  });

  await beat(page, 'close', line('close'), async () => {
    await click(page, page.getByRole('button', { name: 'Close the Mandate capability layer' }));
    await page.waitForTimeout(1200);
    await caption(page, 'Mandate — human intent, compiled into a live WebMCP contract');
  });

  await page.waitForTimeout(1600);

  writeFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'timings.json'),
    JSON.stringify(timings, null, 2) + '\n',
  );
});
