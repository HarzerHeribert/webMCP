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
    EVIDENCE: manual: delegating `status` on one customer narrows the customerId and field enums to exactly that pair; narrowing again re-derives them.
☑ Never register an apply, delete, mandate-administration, export-all, or raw-data tool. (SEC-004)
    EVIDENCE: `app.test.ts > no compiled tool descriptor's name matches /apply/i`; `NEVER_REGISTERED` is rendered as an explicit absent-by-design section.
☑ Render a capability inspector that mirrors the registered tools' name, description, inputs, and availability. (D-005)
    EVIDENCE: manual: the inspector renders name, description, input schema and availability for every descriptor, with a reason on each withheld one.
☑ GATE: the inspector's contents equal the actual registrations, and change when the mandate changes. (M3 gate)
    EVIDENCE: manual: the inspector cross-checks each registered descriptor against the provider's own `toolNames`; registered count went 2 → 5 on delegation.
☑ Show a `WEBMCP_UNAVAILABLE` state with a working human fallback when the API is absent. (RISK)
    EVIDENCE: manual: with no `navigator.modelContext` the header reads `unavailable`, the inspector says so plainly, and every human path still works.

Phase M4 — Staging tools and shared edits

☑ Register `mandate_stage_customer_update` accepting an absolute in-scope field value. (WEBMCP CONTRACT)
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

☐ Cover every UX state in `docs/02_UX_SPEC.md` with a designed, labelled appearance.
☐ Pair every state colour with a text label; never rely on colour alone. (D-015)
☑ Write the fixed eval script: the nine minimum cases from `docs/08_EVAL_AND_TEST_PLAN.md`.
    EVIDENCE: `tests/unit/service.test.ts` + `tests/integration/app.test.ts` — all nine `docs/08` cases as named deterministic tests, plus session isolation and expiry.
☐ Add browser tests for delegation, inspector narrowing, co-edit, conflict, rebase, apply, and reset.
☐ Add a guided demo mode that walks the three-minute script from `docs/09_DEMO_AND_SUBMISSION.md`.
☐ GATE: a fresh reset replays the whole demo with no manual repair.
☐ Verify the demo runs in a browser without the WebMCP flag, through the simulated caller. (SUBMISSION: judges may not have the flag)

Phase M7B — Submission artifacts

> `https://webmcp.devpost.com/` — deadline 2026-09-03 13:00 PDT. Judged on WebMCP
> leverage, execution as a coherent product, potential impact, and ambition.

☑ Publish an OSS licence visible in the repository's About section. (SUBMISSION)
    EVIDENCE: `LICENSE` (MIT) at the repository root.
☐ Write the README as the submission's text description: why WebMCP fits, what the human and the agent can do together that was not previously feasible, and the implementation approach. (SUBMISSION)
☐ Write the <3-minute video script, beat by beat, against the running demo. (SUBMISSION)
☐ Record the limitations honestly: no identity attestation, no production CRM, no model. (D-009, `docs/09`)

Phase M8 — Deployment

☑ Choose and record the deployment target and the storage adapter it uses.
    EVIDENCE: D-011 in `docs/12_DECISIONS.md` — Vercel, one origin, Upstash Redis behind `SessionStore`.
☐ Implement `RedisSessionStore` behind the existing `SessionStore` port, with the in-memory adapter still used for tests and local dev.
☐ Add the Vercel function entry and build config so `/api/*` and the static client share one origin.
☐ Deploy one HTTPS origin, with a deterministic reset and no credentials in the repo.
☐ Verify the live URL works in Chrome with WebMCP enabled **and** degrades correctly where it is not. (SUBMISSION)
☐ Verify no cross-session leakage and no internal error text on the deployed origin.
☐ Record deployed URL, commit SHA, browser and version, and the stated limitations.
