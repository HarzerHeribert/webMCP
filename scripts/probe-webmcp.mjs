/**
 * Probe a real browser's WebMCP surface and print what is actually there.
 * Findings are written up in `docs/20_WEBMCP_FIELD_NOTES.md`.
 *
 *   node scripts/probe-webmcp.mjs [url]
 *
 * Needs Google Chrome installed. The flag is `--enable-features=WebMCP`; the
 * API only appears on a secure origin, so `about:blank` reports nothing.
 */
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-features=WebMCP'] });
const p = await b.newPage();
await p.goto(process.argv[2] ?? 'https://webmcp-weld.vercel.app/', { waitUntil: 'domcontentloaded' });
const out = await p.evaluate(async () => {
  const mc = document.modelContext;
  globalThis.__calls = [];
  await mc.registerTool({
    name: 'echo_probe',
    description: 'Echoes.',
    inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
    async execute(input) {
      globalThis.__calls.push(input);
      return { content: [{ type: 'text', text: `got ${JSON.stringify(input)}` }] };
    },
  });
  const tools = await mc.getTools();
  const t = tools.find((x) => x.name === 'echo_probe');
  const log = { registered: !!t, toolShape: t ? Object.getOwnPropertyNames(t) : null };
  try {
    const res = await mc.executeTool(t, { x: 'hello' });
    log.executeOk = true;
    log.result = JSON.stringify(res).slice(0, 240);
  } catch (e) {
    log.executeThrew = String(e).slice(0, 240);
    // Maybe it wants the args wrapped differently.
    try { const r2 = await mc.executeTool(t, JSON.stringify({ x: 'hello' })); log.altOk = JSON.stringify(r2).slice(0,160); }
    catch (e2) { log.altThrew = String(e2).slice(0, 160); }
  }
  log.executeCallbackFired = globalThis.__calls.length;
  log.callbackSaw = globalThis.__calls[0] ?? null;
  return log;
});
console.log(JSON.stringify(out, null, 2));
await b.close();
