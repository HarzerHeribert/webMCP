# Mandate — agent instructions

Mandate is a **demo/PoC**. The idea must land pristinely; the internals may have
rough edges. UX/UI is the deliverable, not the substrate.

## Sources of truth, in order

1. `docs/product/capability-map.md` — **authoritative**, ordered checkboxes. Work
   in its order. A box is ticked only by the orchestrator, only after the
   behaviour was seen working.
2. `docs/*.md` (the numbered spec pack) — the frozen product spec. `docs/12_DECISIONS.md`
   is locked; never silently override it.
3. `docs/process/handoff.md` — the current checkpoint and next exact action.
4. `docs/process/loop.md` — how this repo is built.

## If you are a worker

Read **only**: this file, your packet, `docs/process/loop.md`, and the spec
sections your packet names. Do not read the whole spec pack. Do not read the
capability map to find work — your packet quotes your lines.

Never: commit, edit the capability map or handoff, touch another worker's
`FORBIDDEN FILES`, add an LLM/model call, API key, remote MCP server, browser
extension, OAuth, accounts, or a third-party integration.

## Local due diligence — there is no CI

`scripts/check.sh` is the gate. Run it before reporting. It runs typecheck,
lint, unit + integration tests, and the browser tests. A red gate is a report of
"FAIL", not something to work around.

## Orchestrator only

Integrate with `scripts/integrate.sh <name>...` — pass **every** finished worker
in one call. Read every applied diff. Then tick boxes, update the handoff, commit.
