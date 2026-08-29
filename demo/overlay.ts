import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';

const durations: Record<string, number> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'durations.json'), 'utf8'),
);

/**
 * The two things a screen recording of a web app is always missing.
 *
 * Playwright drives the page directly, so nothing on camera shows *where* the
 * interaction happened — controls change state with no visible cause, which
 * reads as a video of software doing things by itself. And a WebMCP call made
 * through `document.modelContext` is invisible by construction: its only trace
 * is the effect it has.
 *
 * So the recording injects two pieces of overlay chrome, both deliberately
 * styled as video furniture rather than as part of the product: a pointer that
 * travels to whatever is about to be clicked, and a lower third that names the
 * call being made. Neither is in the app; neither is in `src/`.
 */
const OVERLAY = `
  #__demo-cursor {
    position: fixed; left: 0; top: 0; z-index: 2147483647; width: 26px; height: 26px;
    pointer-events: none; opacity: 0; transform: translate(-100px, -100px);
    transition: transform 520ms cubic-bezier(.33,.02,.2,1), opacity 200ms linear;
    filter: drop-shadow(0 2px 4px rgba(8,15,26,.45));
  }
  #__demo-ring {
    position: fixed; left: 0; top: 0; z-index: 2147483646; width: 34px; height: 34px;
    margin: -17px 0 0 -17px; border-radius: 50%; pointer-events: none; opacity: 0;
    border: 2px solid #0b6bcb;
  }
  #__demo-ring.pulse { animation: __demo-pulse 620ms cubic-bezier(.2,.6,.3,1); }
  @keyframes __demo-pulse {
    0%   { opacity: .9; transform: scale(.35); }
    100% { opacity: 0;  transform: scale(1.5); }
  }
  #__demo-caption {
    position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(8px);
    z-index: 2147483647; pointer-events: none; max-width: 78%;
    background: rgba(12,18,28,.93); color: #f4f7fb; border: 1px solid rgba(255,255,255,.10);
    border-radius: 9px; padding: 11px 18px; box-shadow: 0 8px 28px rgba(8,15,26,.35);
    font: 500 15px/1.35 ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: .1px; text-align: center; opacity: 0;
    transition: opacity 260ms linear, transform 260ms cubic-bezier(.33,.02,.2,1);
  }
  #__demo-caption.on { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

/** Installed once per page load; every later call is a cheap DOM poke. */
export async function installOverlay(page: Page): Promise<void> {
  await page.evaluate((css) => {
    if (document.getElementById('__demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);

    const ring = document.createElement('div');
    ring.id = '__demo-ring';
    const cursor = document.createElement('div');
    cursor.id = '__demo-cursor';
    cursor.innerHTML =
      '<svg viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 2 L3 19.5 L7.9 15.2 L11 22.5 L14.2 21 L11.2 14 L17.5 13.6 Z" ' +
      'fill="#ffffff" stroke="#16202c" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const caption = document.createElement('div');
    caption.id = '__demo-caption';

    document.body.append(ring, cursor, caption);
  }, OVERLAY);
}

/** Slides the pointer to the centre of `target` and waits for it to arrive. */
export async function point(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('point(): target has no box — it is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(
    ({ x, y }) => {
      const c = document.getElementById('__demo-cursor');
      const r = document.getElementById('__demo-ring');
      if (!c || !r) return;
      c.style.opacity = '1';
      c.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
    },
    { x, y },
  );
  await page.waitForTimeout(560);
}

/** Moves the pointer there, flashes a click ring, then actually clicks. */
export async function click(page: Page, target: Locator): Promise<void> {
  await point(page, target);
  await page.evaluate(() => {
    const r = document.getElementById('__demo-ring');
    if (!r) return;
    r.classList.remove('pulse');
    void r.offsetWidth;
    r.classList.add('pulse');
  });
  await page.waitForTimeout(160);
  await target.click();
  await page.waitForTimeout(240);
}

export async function caption(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const el = document.getElementById('__demo-caption');
    if (!el) return;
    el.classList.remove('on');
    window.setTimeout(() => {
      el.textContent = t;
      el.classList.add('on');
    }, 180);
  }, text);
  await page.waitForTimeout(320);
}

/**
 * Runs one beat and holds the shot for at least as long as its narration takes
 * to say, so the cut lines up with the voice track without anyone editing to a
 * waveform. `demo/durations.json` is written by `scripts/demo-narrate.py`.
 */
/**
 * When each beat actually began, measured from the moment the page opened.
 * `scripts/demo-assemble.sh` delays each narration clip by these offsets, which
 * is what keeps the voice on the picture without hand-editing to a waveform.
 */
export const timings: { id: string; at: number }[] = [];
let origin = 0;
export function setOrigin(t: number): void {
  origin = t;
  timings.length = 0;
}

export async function beat(
  page: Page,
  id: string,
  text: string,
  body: () => Promise<void>,
): Promise<void> {
  const started = Date.now();
  timings.push({ id, at: (started - origin) / 1000 });
  await caption(page, text);
  await body();
  const spoken = (durations[id] ?? 4) * 1000;
  const remaining = spoken + 900 - (Date.now() - started);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

/**
 * A real WebMCP call: the tool object comes from `getTools()` and the arguments
 * go over as a JSON *string*, which is what Chrome actually accepts
 * (`docs/20_WEBMCP_FIELD_NOTES.md` §4). This is the agent path, not a
 * simulation — the page's own registered `execute` runs and hits the server.
 */
export async function agentCall(
  page: Page,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return page.evaluate(
    async ({ name, args }) => {
      type Mc = { getTools(): Promise<{ name: string }[]>; executeTool(t: unknown, a: string): Promise<unknown> };
      const mc = (document as unknown as { modelContext?: Mc }).modelContext;
      if (!mc) throw new Error('no document.modelContext — recording needs flagged Chrome');
      const tools = await mc.getTools();
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`tool not registered: ${name}`);
      return mc.executeTool(tool, JSON.stringify(args));
    },
    { name, args },
  );
}
