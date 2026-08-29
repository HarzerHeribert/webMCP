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
☐ Isolate sessions: no request may read or write another session's data. (FR-001, SEC)

Phase M1 — Relay CRM, human side

☑ Render the customer workbench: list, per-customer fields, and the currently selected customers.
    EVIDENCE: manual: six seeded customers, fields, selection state.
☑ Let the human edit a customer field directly, as a staged change, with no mandate present. (FR-005)
    EVIDENCE: manual: clicking a value stages a DRAFT with `actor: human`, `mandateVersion: null`.
☐ Show a provenance timeline of every event in the session. (FR-008)
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
☐ Expire a mandate at its `expiresAt` without any client action. (FR-003)
☑ Enforce on the server: every agent-path mutation checks active, unexpired, in-scope, current-version. (SEC-002)
    EVIDENCE: `server/core/policy.ts :: authorize`, called by every agent-path service method.
☑ GATE: a customer that is selected but not delegated cannot be written through the agent path. (M2 gate, FR-002)
    EVIDENCE: `smoke.test.ts > M2 GATE` — selected `c-kestrel`, delegated only `c-atlas`, agent stage rejected `OUT_OF_SCOPE`.

Phase M3 — WebMCP surface and inspector

☐ Register WebMCP tools through one adapter, only when the API is available, with lifecycle cleanup. (MCP-001)
☐ Register `mandate_get_workspace` and `mandate_get_capabilities` as read-only tools. (WEBMCP CONTRACT)
☐ Derive every tool's input schema from the current mandate, so the schema narrows as scope narrows. (MCP-002)
☐ Never register an apply, delete, mandate-administration, export-all, or raw-data tool. (SEC-004)
☐ Render a capability inspector that mirrors the registered tools' name, description, inputs, and availability. (D-005)
☐ GATE: the inspector's contents equal the actual registrations, and change when the mandate changes. (M3 gate)
☐ Show a `WEBMCP_UNAVAILABLE` state with a working human fallback when the API is absent. (RISK)

Phase M4 — Staging tools and shared edits

☐ Register `mandate_stage_customer_update` accepting an absolute in-scope field value. (WEBMCP CONTRACT)
☐ Register `mandate_validate_changes`. (WEBMCP CONTRACT)
☐ Require the mandate version on every mutating tool call. (SEC-002)
☐ Store every change with before, after, base revision, actor, and mandate version. (FR-005, DOMAIN)
☐ Let the human and the agent edit the same staged change entity, with visible provenance for each. (FR-005, D-006)
☐ Return `OUT_OF_SCOPE` for a customer or field outside the mandate. (SEC, API)
☐ Return `POLICY_CHANGED` for a call carrying a stale mandate version. (SEC-003)
☐ GATE: a revoked or narrowed mandate makes an in-flight agent call fail server-side, not client-side. (M4 gate)
☐ Provide a simulated caller that invokes the real registered tool implementations, so the surface is demonstrable without a live agent. (RISK: demo fragility; not an agent, no model)

Phase M5 — Conflicts and rebase

☐ Simulate a deterministic external update that advances the session revision. (RISK)
☐ Detect a stale base revision on validate/apply and mark the change `STALE`. (CON-001)
☐ Return `REVISION_CONFLICT` with the current value and the smallest safe recovery. (API)
☐ Register `mandate_rebase_changes`, producing a fresh `DRAFT` that preserves the absolute intended value. (WEBMCP CONTRACT)
☐ Show the conflict and its recovery in a dedicated panel, in the product's own words. (UX)
☐ GATE: after a rebase the intended target value and its provenance both survive. (M5 gate)

Phase M6 — Human apply and audit

☐ Validate staged changes into `VALIDATED`, and gate apply on validation. (FR-006)
☐ Make apply a human-only server route that refuses any agent-path caller. (SEC-004, D-006)
☐ Present apply as a visually isolated human action, disabled while work is invalid or stale. (UX, D-005)
☐ Make applied changes immutable; a correction is a new change. (DOMAIN)
☐ Append every mandate, tool call, edit, conflict, rebase, validation, and apply to the timeline. (FR-008)
☐ GATE: no route and no registered tool can apply, and a human apply is audited. (M6 gate)

Phase M7 — The demo, and the polish that carries it

☐ Cover every UX state in `docs/02_UX_SPEC.md` with a designed, labelled appearance.
☐ Pair every state colour with a text label; never rely on colour alone. (D-015)
☐ Write the fixed eval script: the nine minimum cases from `docs/08_EVAL_AND_TEST_PLAN.md`.
☐ Add browser tests for delegation, inspector narrowing, co-edit, conflict, rebase, apply, and reset.
☐ Add a guided demo mode that walks the three-minute script from `docs/09_DEMO_AND_SUBMISSION.md`.
☐ GATE: a fresh reset replays the whole demo with no manual repair.

Phase M8 — Deployment

☐ Choose and record the deployment target and the storage adapter it uses. (D-010 does not cover this; record in `docs/12_DECISIONS.md`)
☐ Deploy one HTTPS origin, with a deterministic reset and no credentials in the repo.
☐ Verify no cross-session leakage and no internal error text on the deployed origin.
☐ Record deployed URL, commit SHA, browser and version, and the stated limitations.
