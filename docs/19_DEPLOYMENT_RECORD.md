# Deployment record

**Live URL** — https://webmcp-weld.vercel.app
(also `webmcp-holdpoint-deployment.vercel.app`)

**Repository** — https://github.com/HarzerHeribert/webMCP (public, MIT)

**Commit** — `9d1951c958ad37cf3f284dfe33d0ad8d1881313b`

**Platform** — Vercel, one origin: the Vite build as static assets, the whole
service as a single bundled Node function under `/api`. Sessions in Redis over
`REDIS_URL`, thirty-minute TTL.

**Verified with** — Chromium (Playwright bundled build) and Google Chrome 152
with `--enable-features=WebMCP`, both against the live origin, and
`node scripts/verify-live.mjs https://webmcp-weld.vercel.app` (12/12).

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

## The flagged path, verified

Google Chrome 152.0.7977.64 launched with `--enable-features=WebMCP`, driving
the live origin. `docs/20_WEBMCP_FIELD_NOTES.md` records the API as measured;
the short version is that it is `document.modelContext`, and probing only
`navigator` — as the spec pack and every write-up say — reports "no WebMCP" in a
browser that has it.

- registration is real: two read-only tools before delegating, five after;
- the schema an agent reads is the live scope — `customerId` enum exactly
  `["c-northwind"]`, `field` enum exactly `["status","nextAction"]`,
  `mandateVersion` `const 1`;
- a real `executeTool` staged a change that appeared in the UI;
- an undelegated customer was refused `OUT_OF_SCOPE` through the browser API;
- narrowing mid-flight refused a v1 call `POLICY_CHANGED`; revoking refused it
  `NO_ACTIVE_MANDATE`;
- a co-edit landed on one change entity, `touchedBy: ["agent","human"]`;
- a stale apply gave `REVISION_CONFLICT`, rebase returned `{rebased:1}`, and
  re-validation was clean;
- the injection prop's requested actions were refused;
- no horizontal scroll or overlap at any of the four tested widths.

## What was not verified

**The ChatGPT desktop app's built-in browser.** The challenge names it as a test
surface and it supports WebMCP out of the box, but no run inside it is recorded
here. The page detects it and states the site-tools remedy (`docs/20`, §7); what
is unverified is a live registration on that host. A run in ChatGPT's *mobile*
in-app browser did happen, and correctly reported no WebMCP — site tools are
desktop-only.

**A real model driving it.** Every tool call above was issued by the page or by
hand through `executeTool`, not by an agent choosing to make it. Nothing in this
repo calls a model, by design (`docs/12_DECISIONS.md`).

**Withdrawal.** This browser offers no way to unregister a tool, so the claim
that a revoked surface *disappears from the registry* could not be verified —
because it is not true here. The product does not depend on it; the server
refuses the call either way, and the inspector says so rather than implying a
withdrawal it cannot perform.

Everything else in `docs/18_LIMITATIONS.md` still applies.
