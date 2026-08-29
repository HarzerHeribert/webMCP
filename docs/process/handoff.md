# Handoff

## Where this stands

**66/66.** The demo is live, public, and verified on the deployed origin:
https://webmcp-weld.vercel.app — see `docs/19_DEPLOYMENT_RECORD.md`.

35 unit/integration tests, 14 browser tests, and `scripts/verify-live.mjs`
(12 checks against the live URL). `scripts/check.sh --full` is green.

## What is left before submitting (deadline 2026-09-03 13:00 PDT)

1. **Record the video.** `docs/17_DEMO_SCRIPT.md`, beat by beat, under three
   minutes, public YouTube, with audio. Record at 1600×1000 or larger — the
   workbench is dense below that.
2. **Fill in the Devpost form**: live URL, repo, video, and the text description
   (the README is written to be that text).
3. Optional: verify once in a browser with `#web-machine-learning-model-context`
   enabled. Nothing here has ever run against a real `navigator.modelContext`,
   and that gap is stated in the deployment record rather than hidden.

## What bit, and what now guards it

The deploy shipped broken three times while every local check stayed green,
because nothing in the gate had ever touched the production artefact:

- a `.ts` import specifier the platform does not rewrite;
- then an extensionless one, because Vercel does not bundle `api/*.ts` at all;
- then `export default`, which Vercel reads as the Node `(req, res)` signature
  and whose returned `Response` it ignores — every request hung to 300s;
- and a store that silently fell back to process memory because the REST pair it
  wanted was never bound.

Now: the function is bundled by `scripts/build-api.mjs` into a committed
`api/index.js`; `scripts/check.sh` rebuilds it and fails if it was stale;
`tests/integration/vercel-entry.test.ts` drives the real entry; and the habit
that actually caught things was **running the bundle from a directory with no
`node_modules`**.

## Loose ends

- `HUMAN_CONFIRMATION_REQUIRED` is defined in `docs/16` and never thrown.
- The RESP client (`server/core/redis-socket-store.ts`) is deliberately minimal.
  Its tests need a Redis on 6380 (`docker run -d --rm -p 6380:6379 redis:7-alpine`);
  without one they skip, and only the parser tests run.
- `.mcp.json` adds chrome-devtools-mcp; it needs a session restart to load.
