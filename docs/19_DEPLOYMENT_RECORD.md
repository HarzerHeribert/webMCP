# Deployment record

**Live URL** — https://webmcp-weld.vercel.app
(also `webmcp-holdpoint-deployment.vercel.app`)

**Repository** — https://github.com/HarzerHeribert/webMCP (public, MIT)

**Commit** — `edba45efb12be9f2718fa6a705df698b464c303b`

**Platform** — Vercel, one origin: the Vite build as static assets, the whole
service as a single bundled Node function under `/api`. Sessions in Redis over
`REDIS_URL`, thirty-minute TTL.

**Verified with** — Chromium (Playwright bundled build) against the live origin,
and `node scripts/verify-live.mjs https://webmcp-weld.vercel.app` (12/12).

## What was verified on the deployed origin

- the client and the service share one origin;
- a session seeds six accounts and compiles five tool descriptors;
- a session survives a later invocation — the production log line reads
  `session store: _RedisSocketStore`, so this is Redis and not a warm lambda;
- session B cannot read session A's data, and a forged session id returns a
  `NOT_FOUND` envelope that discloses nothing internal;
- an undelegated customer is refused `OUT_OF_SCOPE`; a stale mandate version is
  refused `POLICY_CHANGED`;
- `POST /api/tools/apply` does not exist, and no compiled descriptor is named
  apply;
- reset restores the seed and clears authority;
- in a browser: the layer stays shut and reads `WebMCP required`, the gate
  explains `WEBMCP_UNAVAILABLE`, the labelled override runs the demo, delegation
  works, and an undelegated customer is refused in the live UI.

## What was not verified

**The flagged path.** No browser with `navigator.modelContext` was available
here, so real registration with a page-level agent is covered by unit-level
tests and the adapter's feature detection — not by a live run. A judge with the
flag enabled is exercising a path this record does not cover.

Everything else in `docs/18_LIMITATIONS.md` still applies.
