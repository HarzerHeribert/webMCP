# Handoff

## Where this stands

M0–M2 closed except three lines. The foundation is real: one Vite project serving
a Hono service on one origin, the authoritative domain in `server/core/`, the
design system in `src/styles/`, and the three panels that carry the product's
central distinction — selection proposes, delegation grants, the server enforces.

17/58 boxes.

## Next action

Batch 1, three disjoint workers:
  `webmcp`   — the WebMCP adapter, the inspector, the simulated caller (M3, M4 tools)
  `timeline` — the provenance timeline and the conflict/recovery panel (M1, M5 UI)
  `tests`    — unit, integration incl. forged calls, and the browser suite (gate evidence)

Then integrate all three in one `scripts/integrate.sh` call and read every diff.

## Live workers

None yet.

## Loose ends

- Deployment target undecided until M8; `server/core/store.ts` is the port.
- `.agent-runtime/shot.mjs` renders a screenshot of the running dev server —
  the browser extension is not connected in this environment, so visual checks
  go through Playwright.
