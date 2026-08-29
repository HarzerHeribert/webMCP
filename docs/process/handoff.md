# Handoff

Written so a session that replaces this one needs nothing that is not here or
one link away. Read this, then `CLAUDE.md`, then stop reading and work.

## What this is

**WebMCP Mandate Compiler.** A human's explicit, temporary delegation is
compiled into a live, bounded WebMCP tool contract. Relay CRM is the host demo;
the compiler is the product. Submission for
`https://webmcp.devpost.com/` — **deadline 2026-09-03 13:00 PDT**.

- Live: **https://webmcp-weld.vercel.app**
- Repo: **https://github.com/HarzerHeribert/webMCP** (public, MIT)
- Vercel project `webmcp`, team `holdpoint-deployment`. **Pushing to `main` is
  the deploy.**

`docs/product/capability-map.md` is authoritative and reads 66/66. That number
means "every line has evidence recorded", not "nothing is left" — see below.

## The five things that cost the most time

**1. The WebMCP API is not where the spec says.** It is
`document.modelContext`, not `navigator.modelContext`. There is no
`provideContext`. `inputSchema` reads back as a JSON *string*. There is **no way
to unregister a tool**. All measured in Chrome 152 and written up in
`docs/20_WEBMCP_FIELD_NOTES.md` — **read that before touching `src/webmcp/`.**

**1b. There are two WebMCP hosts, not one.** Chrome behind a flag
(`chrome://flags/#enable-webmcp-testing`, or `--enable-features=WebMCP`), and
**the ChatGPT desktop app's built-in browser**, where it is a product feature
called *site tools* — gated on app version, on `Settings › Browser ›
Permissions › Enable site tools`, and on the model (Sol or Terra; disabled on
Luna), and **absent from the mobile app**. `docs/20_WEBMCP_FIELD_NOTES.md` §7.
`src/webmcp/host.ts` picks which remedy the gate names; it is a hint for copy
only, and `adapter.ts` still decides what is live by asking the browser.

**2. Vercel does not bundle `api/*.ts`.** It transpiles the entry and leaves
relative imports as runtime paths that were never shipped. The function is
therefore bundled by `scripts/build-api.mjs` into a **committed** `api/index.js`,
and `scripts/check.sh` rebuilds it and fails if it was stale.

**3. Vercel prefers `export default` and reads it as `(req, res)`,** ignoring a
returned `Response` — every request hung to the 300s timeout. `server/vercel-entry.ts`
exports named methods and **must not** gain a default export.

**4. The habit that actually caught these:** copy `api/index.js` somewhere with
no `node_modules` and import it. A green local suite proves nothing about the
artefact that deploys.

**5. Half-switching off a viewport-height layout overlaps content.** A column
with `overflow: visible` while still sized to `1fr` spills over whatever
follows. All responsive rules now live in one ordered section at the end of
`src/styles/app.css`; keep them there.

## How it is built

`CLAUDE.md` and `docs/process/loop.md`. Capability map → task packets
(`scripts/packet.sh`) → isolated worktrees (`scripts/worker.sh`) → one
`scripts/integrate.sh` call for the whole batch → orchestrator reads every diff
→ tick boxes, commit. `scripts/status.sh` orients in one screen.

**The gate is `scripts/check.sh [--full]`.** There is no CI.

Verification tools worth knowing:
- `node scripts/verify-live.mjs <origin>` — 12 checks against a deployed URL
- `node scripts/probe-webmcp.mjs [url]` — what a real browser's WebMCP exposes
- `node scripts/probe-webmcp-schema.mjs` — the schema an agent actually reads
- flagged Chrome: `chromium.launch({ channel: 'chrome', args: ['--enable-features=WebMCP'] })`,
  and for localhost add `--unsafely-treat-insecure-origin-as-secure=http://localhost:5173`

## What is left

1. **Upload the video.** It is made: `demo/mandate-demo.mp4`, 2:46, 1600×1000,
   recorded in flagged Chrome so every agent action on camera is a real
   `document.modelContext.executeTool` call. `docs/21_DEMO_VIDEO.md` explains
   the three-command pipeline and how to re-cut it after a UI change. What is
   left is human: watch it with sound (the narration is synthesised locally and
   nobody has listened to it yet), then put it on public YouTube.

   It opens with three problem cards (`demo/cards.html`) and closes by flipping
   to **User** mode, which is the answer to "why does this take two-thirds of a
   screen?" — most of the layer is instrumentation for the argument, and the
   switch shows the product underneath rather than claiming it exists.
2. **Submit on Devpost**: live URL, repo, video, description (the README is
   written to be that text).
3. An independent Fable verifier drove the live origin in flagged Chrome and
   returned **submittable**: every demo beat and every claimed enforcement
   behaviour works there. Its three findings (gate copy naming the wrong API
   location, the guide claiming the conflict beat after a revoke, and panels
   clipping text with no scroll affordance) are fixed as of `245e88c`'s
   successor. Re-run it after any material change.

**A defect of copy is rarely alone.** The verifier found `navigator.modelContext`
on the gate; the same sentence was also in the capability inspector, and in the
README — which *is* the submission's text description. `7f7b675` fixed both, and
one worse thing beside them: the README promised that revoking makes the tools
"disappear", which this browser cannot do (field notes §6), so a judge revoking
in flagged Chrome could have falsified the pitch by looking at the registry. If
you change a user-facing claim about the API, grep the whole tree for the old
one — `docs/`, `README.md` and `src/components/` all state it independently.

## Known gaps, honestly

- `HUMAN_CONFIRMATION_REQUIRED` is in `docs/16` and never thrown.
- The quota (`server/core/quota.ts`) fingerprints on `x-forwarded-for` and is
  **not** a security boundary; it keeps a free-tier store available, nothing more.
- The RESP client (`server/core/redis-socket-store.ts`) is hand-written because
  node-redis cannot be bundled. Its tests need a Redis on 6380
  (`docker run -d --rm -p 6380:6379 redis:7-alpine`); without one they skip.
- `docs/18_LIMITATIONS.md` is the full list and is meant to stay honest. Do not
  quietly upgrade a claim in it.

## Locked decisions

`docs/12_DECISIONS.md`. In particular: no LLM/model/agent harness anywhere
(D-003), the schema communicates and the backend enforces (D-005), the agent
stages and only the human applies (D-006). The simulated caller is a test
harness, not an agent, and is labelled as one everywhere it appears.
