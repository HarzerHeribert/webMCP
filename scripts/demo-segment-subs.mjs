/**
 * Subtitles for the hand-captured segment.
 *
 * The Playwright beats render their own subtitles in the page. The ChatGPT clip
 * cannot — it is finished footage — so each cue is rendered to a transparent PNG
 * in the same style and overlaid on its own time window. Split and styling match
 * demo/overlay.ts and scripts/demo-subtitles.py, so all three agree.
 *
 *   node scripts/demo-segment-subs.mjs <raw.mp4> <out.mp4> <beat-id>
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , raw, out, beatId] = process.argv;
const script = JSON.parse(readFileSync('demo/narration.json', 'utf8'));
const durations = JSON.parse(readFileSync('demo/durations.json', 'utf8'));
const beat = script.beats.find((b) => b.id === beatId);
if (!beat) throw new Error(`no beat ${beatId}`);

const MAX = 84;
const cues = [];
for (let part of beat.say.trim().split(/(?<=[.:?])\s+/)) {
  while (part.length > MAX) {
    let cut = part.lastIndexOf(' ', MAX);
    for (const mark of [' — ', ', ']) {
      const at = part.lastIndexOf(mark, MAX);
      if (at > MAX / 2) { cut = at + (mark === ', ' ? 2 : 1); break; }
    }
    cues.push(part.slice(0, cut).trim());
    part = part.slice(cut).trim();
  }
  if (part) cues.push(part);
}

const dir = mkdtempSync(join(tmpdir(), 'segsubs-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 260 }, deviceScaleFactor: 1 });
const files = [];
for (const [i, text] of cues.entries()) {
  await page.setContent(`<body style="margin:0;background:transparent">
    <div id="c" style="
      display:inline-block; max-width:1240px;
      background:rgba(12,18,28,.93); color:#f4f7fb;
      border:1px solid rgba(255,255,255,.10); border-radius:9px;
      padding:12px 20px; box-shadow:0 8px 28px rgba(8,15,26,.35);
      font:480 19px/1.42 -apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,system-ui,sans-serif;
      letter-spacing:.1px; text-align:center;">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></body>`);
  const file = join(dir, `c${i}.png`);
  await page.locator('#c').screenshot({ path: file, omitBackground: true });
  files.push(file);
}
await browser.close();

// Each cue holds for its share of the spoken line, weighted by length.
const spoken = durations[beatId];
const chars = cues.reduce((n, c) => n + c.length, 0);
let at = 0;
const spans = cues.map((c) => {
  const from = at;
  at += (spoken * c.length) / chars;
  return [from, at];
});

const inputs = files.flatMap((f) => ['-i', f]);
const chain = spans
  .map(([a, b], i) => {
    const src = i === 0 ? '[0:v]' : `[v${i - 1}]`;
    const dst = i === spans.length - 1 ? '[v]' : `[v${i}]`;
    return `${src}[${i + 1}:v]overlay=x=(W-w)/2:y=H-h-26:format=auto:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'${dst}`;
  })
  .join(';');

execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, ...inputs,
  '-filter_complex', chain, '-map', '[v]',
  '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', out]);
console.log(`${cues.length} cues burnt into ${out}`);
