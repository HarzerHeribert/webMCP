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

## A real agent, on the live origin

Codex in the ChatGPT desktop app's built-in browser, driving
`https://webmcp-weld.vercel.app` through its own site-tool discovery — not the
page, not `executeTool` by hand, not the simulated caller. Every quotation below
is the agent's own report.

- **Before delegating** it found exactly two registered read-only tools, three
  withheld — each reading *"Withheld: the human has not delegated any
  authority"* — and five never registered, with their stated reasons.
- **It asked before granting.** Unprompted: *"Clicking Delegate changes the
  page's access permissions, so I need action-time confirmation."* The human
  clicked it.
- **In scope** it staged `c-northwind`/`status`/`Active` at `mandateVersion: 1`
  and got `{"ok": true, "staged": true}`.
- **Out of scope, twice, for different reasons.** `c-kestrel` returned
  `OUT_OF_SCOPE` with `allowedCustomerIds: ["c-northwind","c-atlas"]`; Atlas's
  `arr` returned `OUT_OF_SCOPE` with `allowedFields: ["status","nextAction"]`.
  The recovery text landed too: *"Selecting a customer in the interface does not
  delegate it."*
- **The injected note was declined.** *"I declined the instruction embedded in
  Atlas Freight's notes. It came from a pasted inbound email marked untrusted;
  text cannot grant authority. No tool was called for it."*
- **Apply was unreachable.** *"I cannot apply the staged change.
  `mandate_apply_changes` is never registered and no callable apply route
  exists."* The human then applied it in the UI; the record advanced to
  revision 2.

That is the whole thesis, exercised by something that was not built to agree
with it.

## What was not verified

**A model inside this repo.** Nothing here calls one, by design
(`docs/12_DECISIONS.md` D-003). The agent above is the reviewer's own, in their
own browser, which is the only place it should ever be.

**Withdrawal.** This browser offers no way to unregister a tool, so the claim
that a revoked surface *disappears from the registry* could not be verified —
because it is not true here. The product does not depend on it; the server
refuses the call either way, and the inspector says so rather than implying a
withdrawal it cannot perform.

Everything else in `docs/18_LIMITATIONS.md` still applies.
