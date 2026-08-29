import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-features=WebMCP', '--unsafely-treat-insecure-origin-as-secure=http://localhost:5173'] });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.workbench');
await p.getByRole('button', { name: 'Open the Mandate capability layer' }).click();
await p.waitForTimeout(300);
await p.locator('.customer__pick input').nth(0).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: /^Delegate/ }).click(); await p.waitForTimeout(900);
const out = await p.evaluate(async () => {
  const tools = await document.modelContext.getTools();
  const stage = tools.find((t) => t.name === 'mandate_stage_customer_update');
  return {
    typeofSchema: typeof stage.inputSchema,
    ctor: stage.inputSchema?.constructor?.name,

    schemaText: String(stage.inputSchema),

    title: stage.title, origin: stage.origin,
  };
});
console.log(JSON.stringify(out, null, 2));
await b.close();
