import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
/** The CRM host's compiled name for the mutating tool (`domains.ts` noun). */
const STAGE = 'mandate_stage_account_update';

test('record the demo', async ({ page }) => {
  // Playwright starts the video when the page is created, a moment before this
  // line, so this is the video's zero to within a few milliseconds.
  setOrigin(Date.now());
  // ── the problem, before any software ─────────────────────────────────────
  // Three cards, same tokens as the product, driven by the same beat clock. A
  // demo that opens by using the thing assumes the viewer already knows why it
  // should exist.
  const cards = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'cards.html')).href;
  await page.goto(cards);
  await page.waitForTimeout(700);

  for (const [n, id] of [['1', 'card-key'], ['2', 'card-sentence'], ['3', 'card-gap']] as const) {
    await beat(page, id, '', async () => {
      await page.evaluate((card) => document.body.setAttribute('data-card', card), n);
      for (const step of ['1', '2', '3']) {
        await page.evaluate((s) => document.body.setAttribute('data-step', s), step);
        await page.waitForTimeout(2100);
      }
    });
    await page.evaluate(() => document.body.setAttribute('data-step', '0'));
  }

  // ── and now the software ─────────────────────────────────────────────────
  await page.goto('/');
  await page.waitForSelector('.workbench');
  await installOverlay(page);
  await page.waitForTimeout(900);

  // The flag has to have taken, or the whole recording is the fallback path.
  const live = await page.evaluate(() => typeof (document as never as { modelContext?: object }).modelContext);
  expect(live, 'flagged Chrome must expose document.modelContext').toBe('object');

  await beat(page, 'host', line('host'), async () => {
    // The app opens as the product: a CRM, and a pill. Show that first, then
    // switch to the instrument for the rest of the explanation.
    await point(page, page.getByRole('button', { name: 'Mandate — delegated authority' }));
    await page.waitForTimeout(2000);
    await click(page, page.getByRole('button', { name: 'Technical', exact: true }));
    await page.waitForTimeout(700);
    const rail = page.getByRole('button', { name: 'Open the Mandate capability layer' });
    if (await rail.isVisible().catch(() => false)) await click(page, rail);
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
    const row = inspector.locator('li.webmcp-tool').filter({ hasText: STAGE });
    await row.locator('details').evaluate((el) => ((el as HTMLDetailsElement).open = true));
    await point(page, row);
  });

  await click(page, page.getByRole('button', { name: 'Dismiss' }));

  await beat(page, 'stage', line('stage'), async () => {
    await agentCall(page, STAGE, {
      resourceId: 'c-northwind',
      field: 'status',
      value: 'Active',
      mandateVersion: V1,
    });
    await point(page, panelByTitle(page, 'Staged changes'));
  });

  await beat(page, 'refuse', line('refuse'), async () => {
    await agentCall(page, STAGE, {
      resourceId: 'c-kestrel',
      field: 'status',
      value: 'Active',
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

  await beat(page, 'usermode', line('usermode'), async () => {
    await click(page, page.getByRole('button', { name: 'Product', exact: true }));
    await page.waitForTimeout(1000);
    await point(page, customerRow(page, 'Northwind Logistics'));
    await page.waitForTimeout(600);
    // The pill is all that is left of the product on screen, and it is still
    // saying what authority exists. Open it: the grant has somewhere to live
    // without a panel.
    await click(page, page.getByRole('button', { name: 'Mandate — delegated authority' }));
    await page.waitForTimeout(600);
  });

  await beat(page, 'hosts', line('hosts'), async () => {
    // The genericity claim, pressed rather than asserted. `customerRow` is
    // scoped to the CRM's collection name, so the row is located directly.
    await click(page, page.getByRole('button', { name: 'Northstar Deploy', exact: true }));
    await page.waitForTimeout(1200);
    await point(page, page.locator('.customers li').filter({ hasText: 'checkout-api' }));
    await page.waitForTimeout(900);

    // And the tool the agent is offered has renamed itself.
    await click(page, page.getByRole('button', { name: 'Technical', exact: true }));
    await page.waitForTimeout(700);
    const rail = page.getByRole('button', { name: 'Open the Mandate capability layer' });
    if (await rail.isVisible().catch(() => false)) await click(page, rail);
    const insp = panelByLabel(page, 'Capability inspector');
    const renamed = insp.locator('li.webmcp-tool').filter({ hasText: 'mandate_stage_service_update' });
    await renamed.scrollIntoViewIfNeeded();
    await point(page, renamed);
  });

  await beat(page, 'close', line('close'), async () => {
    // Close on the *second* host, in the product form: an ordinary application
    // with a pill in the corner, which is the strongest statement of D-002 and
    // of the fact that none of this was ever about CRMs.
    await click(page, page.getByRole('button', { name: 'Product', exact: true }));
    await page.waitForTimeout(1400);
    await point(page, page.locator('.customers li').filter({ hasText: 'event-ingest' }));
    await page.waitForTimeout(900);
    await caption(page, 'Mandate — human intent, compiled into a live WebMCP contract');
  });

  await page.waitForTimeout(1600);

  writeFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'timings.json'),
    JSON.stringify(timings, null, 2) + '\n',
  );
});
