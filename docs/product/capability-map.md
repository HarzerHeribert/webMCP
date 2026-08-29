Mandate — Implementation Capability Map

> Authoritative. This describes the product. Process belongs in `docs/process/`.
> Work in this order. Tick a box only when the behaviour was observed; record the
> evidence on the line below the phase in `EVIDENCE:` form.

Idea

Mandate turns a human's explicit, temporary browser-session intent into a live,
bounded WebMCP capability surface. Relay CRM is the host demo — not the product.

The authority principle:

> **Selection proposes. Delegation grants. The backend enforces.**

The schema principle:

> **A tool schema communicates authority. It never confers it.**

The apply principle:

> **The agent stages. The human applies. There is no agent apply path, at any layer.**

The demo principle:

> **This is a proof of concept. Internals may be rough; the idea must be pristine.
> Every state the product can be in has a designed, labelled, legible appearance.**

Fixed architectural requirements

- React client + a same-origin TypeScript service. The service is authoritative
  for sessions, CRM data, mandates, changes, validation, revisions, and audit.
- Domain logic is pure and storage-agnostic, behind one storage port, so the
  deployment target is a late decision and never a rewrite.
- No LLM, model proxy, agent harness, API key, remote MCP server, browser
  extension, OAuth, or accounts (D-003, D-009).
- WebMCP access goes through one adapter module. No other file may reference
  `navigator.modelContext` (RISK: API churn).

────────

Implementation Order

Phase M0 — Foundation

☑ Build as a single npm project: Vite + React + TypeScript, one dev server, one origin.
    EVIDENCE: `npm run build` green; one Vite project, one origin.
☑ Serve the application service from the same origin as the client under `/api`.
    EVIDENCE: `vite.config.ts` mounts the Hono app as dev middleware; `server/node.ts` serves both in preview.
☑ Provide `npm run dev`, `npm run build`, `npm run check` with no external service required.
    EVIDENCE: all three run with no external service.
☑ Establish the design tokens, type scale, and colour roles from `docs/15_DESIGN_SYSTEM.md` in one stylesheet.
    EVIDENCE: `src/styles/tokens.css`; authority amber is used by nothing but authority.
☑ Create an isolated anonymous session on first load, with a session id the client carries on every call. (FR-001)
    EVIDENCE: manual: loading the page opens `s-…` and the header shows it.
☑ Seed each new session with deterministic Relay CRM demo data. (FR-001)
    EVIDENCE: `smoke.test.ts > seeds a session deterministically`.
☑ Provide a reset that restores the deterministic seed and clears all mandates and changes. (FR-001)
    EVIDENCE: `smoke.test.ts > seeds a session deterministically and resets back to it`.
☑ Isolate sessions: no request may read or write another session's data. (FR-001, SEC)
    EVIDENCE: `app.test.ts > session A's id cannot read/write session B's data` — a forged id 404s rather than being served another session.

Phase M1 — Relay CRM, human side

☑ Render the customer workbench: list, per-customer fields, and the currently selected customers.
    EVIDENCE: manual: six seeded customers, fields, selection state.
☑ Let the human edit a customer field directly, as a staged change, with no mandate present. (FR-005)
    EVIDENCE: manual: clicking a value stages a DRAFT with `actor: human`, `mandateVersion: null`.
☑ Show a provenance timeline of every event in the session. (FR-008)
    EVIDENCE: manual: fresh session shows only SESSION_CREATED; a full walk produced ordered rows with distinct human/agent/system marks and collapsed detail.
☑ Record session revision on the server and surface it in the header. (CON-001)
    EVIDENCE: manual: header readout `r1`, pulses on change.
☑ Make selection visually distinct from delegation, with persistent language. (FR-002, D-004)
    EVIDENCE: manual: cool rail + checkbox for selection, amber ring + `delegated` chip for scope; legend states both.

Phase M2 — Mandate: delegation and enforcement

☑ Let the human create a mandate over the selected customers and a chosen field set. (FR-003)
    EVIDENCE: manual: composer requires customers *and* fields before it will delegate.
☑ Give every mandate an id, version, status, expiry, customer ids, and allowed fields. (FR-003)
    EVIDENCE: `server/core/types.ts :: Mandate`; rendered in the active panel.
☑ Display the active mandate's exact scope as chips, always visible. (FR-004)
    EVIDENCE: manual: one chip per customer and per field, never a summary count.
☑ Let the human revoke a mandate, immediately. (FR-007)
    EVIDENCE: manual: revoke flips status and the tool surface withdraws in the same round trip.
☑ Expire a mandate at its `expiresAt` without any client action. (FR-003)
    EVIDENCE: `service.test.ts > advancing the clock past expiresAt marks the mandate EXPIRED on the next read` — injected clock, no client call between.
☑ Enforce on the server: every agent-path mutation checks active, unexpired, in-scope, current-version. (SEC-002)
    EVIDENCE: `server/core/policy.ts :: authorize`, called by every agent-path service method.
☑ GATE: a customer that is selected but not delegated cannot be written through the agent path. (M2 gate, FR-002)
    EVIDENCE: `smoke.test.ts > M2 GATE` — selected `c-kestrel`, delegated only `c-atlas`, agent stage rejected `OUT_OF_SCOPE`.

Phase M3 — WebMCP surface and inspector

☑ Register WebMCP tools through one adapter, only when the API is available, with lifecycle cleanup. (MCP-001)
    EVIDENCE: `src/webmcp/adapter.ts` — the only module naming `navigator.modelContext`; feature-detects, prefers `provideContext` for atomic replace, always returns a safe cleanup.
☑ Register `mandate_get_workspace` and `mandate_get_capabilities` as read-only tools. (WEBMCP CONTRACT)
    EVIDENCE: manual: both read-only tools are registered with no mandate present.
☑ Derive every tool's input schema from the current mandate, so the schema narrows as scope narrows. (MCP-002)
    EVIDENCE: manual: delegating `status` on one record narrows the resourceId and field enums to exactly that pair; narrowing again re-derives them.
☑ Never register an apply, delete, mandate-administration, export-all, or raw-data tool. (SEC-004)
    EVIDENCE: `app.test.ts > no compiled tool descriptor's name matches /apply/i`; `NEVER_REGISTERED` is rendered as an explicit absent-by-design section.
☑ Render a capability inspector that mirrors the registered tools' name, description, inputs, and availability. (D-005)
    EVIDENCE: manual: the inspector renders name, description, input schema and availability for every descriptor, with a reason on each withheld one.
☑ GATE: the inspector's contents equal the actual registrations, and change when the mandate changes. (M3 gate)
    EVIDENCE: manual: the inspector cross-checks each registered descriptor against the provider's own `toolNames`; registered count went 2 → 5 on delegation.
☑ Show a `WEBMCP_UNAVAILABLE` state with a working human fallback when the API is absent. (RISK)
    EVIDENCE: manual: with no `navigator.modelContext` the header reads `unavailable`, the inspector says so plainly, and every human path still works.

Phase M4 — Staging tools and shared edits

☑ Register the host's compiled stage tool, accepting an absolute in-scope field value. (WEBMCP CONTRACT)
    EVIDENCE: manual: staged an absolute value on a delegated customer through the tool implementation.
☑ Register `mandate_validate_changes`. (WEBMCP CONTRACT)
    EVIDENCE: manual: registered and callable while a mandate is active.
☑ Require the mandate version on every mutating tool call. (SEC-002)
    EVIDENCE: `policy.ts :: authorize` refuses any `mandateVersion` other than the current one; the schema carries it as a `const`.
☑ Store every change with before, after, base revision, actor, and mandate version. (FR-005, DOMAIN)
    EVIDENCE: `server/core/types.ts :: Change`; every field is rendered in the staged-changes row.
☑ Let the human and the agent edit the same staged change entity, with visible provenance for each. (FR-005, D-006)
    EVIDENCE: manual: a human edit and an agent edit of the same (customer, field) land in one change marked co-edited, with both marks.
☑ Return `OUT_OF_SCOPE` for a customer or field outside the mandate. (SEC, API)
    EVIDENCE: `service.test.ts > another customer outside the mandate is refused OUT_OF_SCOPE` and the non-delegated-field case.
☑ Return `POLICY_CHANGED` for a call carrying a stale mandate version. (SEC-003)
    EVIDENCE: `service.test.ts > narrowing the mandate refuses a call made against the old version with POLICY_CHANGED`.
☑ GATE: a revoked or narrowed mandate makes an in-flight agent call fail server-side, not client-side. (M4 gate)
    EVIDENCE: `service.test.ts > revoke after discovery: the next agent call is refused NO_ACTIVE_MANDATE` — thrown by `policy.ts`, reached by calling the service directly, so no client code could have intervened.
☑ Provide a simulated caller that invokes the real registered tool implementations, so the surface is demonstrable without a live agent. (RISK: demo fragility; not an agent, no model)
    EVIDENCE: manual: the simulated caller staged on a delegated customer and was refused a legible OUT_OF_SCOPE on an undelegated one, with `status === 'unavailable'` throughout.

Phase M5 — Conflicts and rebase

☑ Simulate a deterministic external update that advances the session revision. (RISK)
    EVIDENCE: manual: the Demo instrument strip advances the revision and adds an EXTERNAL_UPDATE row.
☑ Detect a stale base revision on validate/apply and mark the change `STALE`. (CON-001)
    EVIDENCE: `service.test.ts > an external revision bump marks staged work STALE and validate throws REVISION_CONFLICT`, and `> a revision bump between validate and apply is detected, not silently applied over`.
☑ Return `REVISION_CONFLICT` with the current value and the smallest safe recovery. (API)
    EVIDENCE: `service.test.ts` asserts `details.currentRevision` and that `recovery` names rebasing.
☑ Register `mandate_rebase_changes`, producing a fresh `DRAFT` that preserves the absolute intended value. (WEBMCP CONTRACT)
    EVIDENCE: manual: registered while a mandate is active; `service.test.ts > rebase restores a DRAFT with after unchanged and touchedBy intact`.
☑ Show the conflict and its recovery in a dedicated panel, in the product's own words. (UX)
    EVIDENCE: manual: the conflict panel shows the server's own recovery copy, a working Rebase button for REVISION_CONFLICT, and an explicit no-automatic-action line for every other code.
☑ GATE: after a rebase the intended target value and its provenance both survive. (M5 gate)
    EVIDENCE: `service.test.ts > rebase restores a DRAFT with `after` unchanged and touchedBy intact — the M5 gate`.

Phase M6 — Human apply and audit

☑ Validate staged changes into `VALIDATED`, and gate apply on validation. (FR-006)
    EVIDENCE: `service.test.ts > apply refuses to commit a change that is not VALIDATED, including a STALE one`.
☑ Make apply a human-only server route that refuses any agent-path caller. (SEC-004, D-006)
    EVIDENCE: `app.test.ts > POST /tools/apply 404s`; `MandateService` has one apply-shaped method and it takes no actor.
☑ Present apply as a visually isolated human action, disabled while work is invalid or stale. (UX, D-005)
    EVIDENCE: manual: apply sits in its own bar on its own surface, disabled until every staged change is VALIDATED.
☑ Make applied changes immutable; a correction is a new change. (DOMAIN)
    EVIDENCE: `service.ts :: discardChange` refuses an APPLIED change; apply stamps `appliedAt` and the row renders settled.
☑ Append every mandate, tool call, edit, conflict, rebase, validation, and apply to the timeline. (FR-008)
    EVIDENCE: manual: mandate, tool call, refusal, edit, validation, conflict, rebase and apply each produce a row.
☑ GATE: no route and no registered tool can apply, and a human apply is audited. (M6 gate)
    EVIDENCE: `app.test.ts` route + descriptor absence, and `service.test.ts > a human apply is recorded in the timeline as an audited human action`.

Phase M7 — The demo, and the polish that carries it

☑ Cover every UX state in `docs/02_UX_SPEC.md` with a designed, labelled appearance.
    EVIDENCE: manual: NO_MANDATE, ACTIVE_MANDATE, DRAFT, VALIDATED, READY_FOR_APPLY, STALE, REVISION_CONFLICT, POLICY_CHANGED, APPLIED and WEBMCP_UNAVAILABLE each render distinctly; a mandate *ending* got its own state, because reverting silently to the composer was the one thing the interface failed to say.
☑ Pair every state colour with a text label; never rely on colour alone. (D-015)
    EVIDENCE: manual: every chip carries its label; the two rail colours are named in the customer legend; provenance uses three distinct marks, not three shades.
☑ Write the fixed eval script: the nine minimum cases from `docs/08_EVAL_AND_TEST_PLAN.md`.
    EVIDENCE: `tests/unit/service.test.ts` + `tests/integration/app.test.ts` — all nine `docs/08` cases as named deterministic tests, plus session isolation and expiry.
☑ Add browser tests for delegation, inspector narrowing, co-edit, conflict, rebase, apply, and reset.
    EVIDENCE: `e2e/` — 11 chromium tests, three consecutive clean runs: inspector narrowing, the simulated caller in and out of scope, revoke mid-flight, the injected note, co-edit, conflict/rebase, apply, and the reset gate.
☑ Add a guided demo mode that walks the three-minute script from `docs/09_DEMO_AND_SUBMISSION.md`.
    EVIDENCE: `src/components/DemoGuide.tsx` — eight beats derived from session state, never from clicks, so it follows the user rather than leading them; dismissible and persistent; manual: walked all eight forward and two backward (revoke drops it to Delegate, discard drops it to Stage).
☑ GATE: a fresh reset replays the whole demo with no manual repair.
    EVIDENCE: `e2e/reset-gate.spec.ts > reset replays the whole demo end to end, with no manual repair` — one uninterrupted test through delegate → narrow → stage → refusal → co-edit → conflict → rebase → apply (r1→r3) → revoke → Reset, then re-delegates and re-reads the narrowed schema with no reload.
☑ Verify the demo runs in a browser without the WebMCP flag, through the simulated caller. (SUBMISSION: judges may not have the flag)
    EVIDENCE: `e2e/inspector.spec.ts > no WebMCP flag is needed` — plain chromium, header reads `unavailable`, and all eleven tests drive the real tool implementations through the simulated caller.

Phase M7B — Submission artifacts

> `https://webmcp.devpost.com/` — deadline 2026-09-03 13:00 PDT. Judged on WebMCP
> leverage, execution as a coherent product, potential impact, and ambition.

☑ Publish an OSS licence visible in the repository's About section. (SUBMISSION)
    EVIDENCE: `LICENSE` (MIT) at the repository root.
☑ Write the README as the submission's text description: why WebMCP fits, what the human and the agent can do together that was not previously feasible, and the implementation approach. (SUBMISSION)
    EVIDENCE: `README.md` — the problem, why WebMCP specifically, the schema-communicates-authority claim, the implementation, and what this is not.
☑ Write the <3-minute video script, beat by beat, against the running demo. (SUBMISSION)
    EVIDENCE: `docs/17_DEMO_SCRIPT.md` — sixteen beats with timings, written against the running app, plus an explicit do-not-claim list.
☑ Record the limitations honestly: no identity attestation, no production CRM, no model. (D-009, `docs/09`)
    EVIDENCE: `docs/18_LIMITATIONS.md`, linked from the README — the security claim stated precisely, what the schema does and does not do, no model anywhere, and what has not been tested.

Phase M8 — Deployment

☑ Choose and record the deployment target and the storage adapter it uses.
    EVIDENCE: D-011 in `docs/12_DECISIONS.md` — Vercel, one origin, Upstash Redis behind `SessionStore`.
☑ Implement `RedisSessionStore` behind the existing `SessionStore` port, with the in-memory adapter still used for tests and local dev.
    EVIDENCE: `server/core/redis-store.ts` — one fetch against Upstash's REST API; the in-memory adapter still backs every test.
☑ Add the Vercel function entry and build config so `/api/*` and the static client share one origin.
    EVIDENCE: `api/[[...route]].ts` + `vercel.json` — one function under `/api`, warns loudly if it falls back to process memory.
☑ Deploy one HTTPS origin, with a deterministic reset and no credentials in the repo.
    EVIDENCE: `scripts/verify-live.mjs https://webmcp-weld.vercel.app` — 12/12, including a deterministic reset back to the seed. No credentials in the repo; the store is bound by platform env.
☑ Verify the live URL works in Chrome with WebMCP enabled **and** degrades correctly where it is not. (SUBMISSION)
    EVIDENCE: manual, both paths. Unflagged (headless Chromium, live origin): the rail reads `WebMCP required`, the gate explains WEBMCP_UNAVAILABLE, the override runs the demo, an undelegated customer is refused. Flagged (Chrome 152, `--enable-features=WebMCP`): registration is real, the schema enums are the live scope, `executeTool` stages, and out-of-scope is refused — `docs/19_DEPLOYMENT_RECORD.md`, `docs/20_WEBMCP_FIELD_NOTES.md`.
☑ Verify no cross-session leakage and no internal error text on the deployed origin.
    EVIDENCE: `scripts/verify-live.mjs` — session B cannot see session A's selection, a forged id returns 404 `NOT_FOUND`, and no reply matches /stack|node_modules|TypeError/.
☑ Record deployed URL, commit SHA, browser and version, and the stated limitations.
    EVIDENCE: `docs/19_DEPLOYMENT_RECORD.md`.

Phase M9 — Telling it (submission surface)

☑ Say what is missing in terms of the host the reader is actually in, not one remedy for everybody.
    EVIDENCE: `src/webmcp/host.ts` + the gate's three branches; `docs/20_WEBMCP_FIELD_NOTES.md` §7 — ChatGPT site tools are desktop-only, version- and permission-gated, and disabled on Luna, so "enable a Chrome flag" is unactionable there. Two browser tests drive the gate under ChatGPT desktop and mobile user agents.
☑ Open the video on the problem, not on the software.
    EVIDENCE: `demo/cards.html` — three cards in the product's own tokens (the key, the sentence, the gap), driven by the same beat clock as the demo and recorded in the same pass.
☑ Separate the instrument from the product on screen, rather than only claiming they are separate.
    EVIDENCE: `src/lib/mode.tsx` + the header's switch. The product form has no panel at all — `e2e/layer.spec.ts` asserts `.layer` has zero elements in it — and still cannot hide an active mandate. `src/components/MinimalLayer.tsx`: a pill, a grant popover anchored to it, and an approval popover anchored to the record.
☑ Make the host and the product different materials, not the same one with labels.
    EVIDENCE: `src/styles/app.css` — the palette rescoped to `.layer, .pop, .pill`. Relay CRM is bright enterprise white with a live pipeline/at-risk/owners bar, working status filters, owner avatars and per-account health; Mandate is a dark instrument on top of it. Amber stays reserved for authority and reads louder on that ground.
☑ Approve in language a person can act on.
    EVIDENCE: `RowApproval` in `src/components/MinimalLayer.tsx` — the field is a label not a schema key, the state says "the record moved on — redo this" rather than `stale`, the base-revision and mandate-version provenance stays with the audit, and one button checks and commits. Two browser tests cover the commit and the refusal.
☑ Record a submission video, under three minutes, on the flagged path. (SUBMISSION)
    EVIDENCE: `demo/mandate-demo.mp4` — 2:50, 1600×1000, recorded in Chrome 152 with `--enable-features=WebMCP`; every agent action is a real `document.modelContext.executeTool` call and the recorder refuses to film otherwise. Pipeline and its sync model in `docs/21_DEMO_VIDEO.md`.
☑ Show that the mechanism is not a CRM feature.
    EVIDENCE: `server/core/domains.ts` — two hosts. `Customer` no longer exists; a `Resource` carries `values: Record<string, string>`, `policy.ts` takes the delegatable set from the session's domain, and `capabilities.ts` compiles the enums, the prose and the tool's own name from it (`mandate_stage_account_update` in Relay CRM, `mandate_stage_service_update` in Northstar Deploy). All 35 unit and integration tests passed through the refactor unchanged, which is the evidence that the enforcement core was always generic. `scripts/verify-live.mjs` checks the rename and the new host's undelegatable field on the deployed origin.
