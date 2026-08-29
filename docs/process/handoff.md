# Handoff

## Where this stands

M0–M6 complete. 51/66. The product works end to end: delegate a scope, watch the
tool schemas narrow to it, stage through the tool path, get refused out of scope,
co-edit with the agent, hit a conflict, rebase, and apply as a human.

Batch 1 (three parallel workers, one integrate call) landed the WebMCP adapter +
inspector + simulated caller, the timeline + conflict panel, and the full test
suite. Integration surfaced two things neither worker could see alone:

- the `tests` worker found a real defect — `applyAsHuman` trusted the VALIDATED
  flag and would commit over an external update. Fixed; the skipped regression is
  now live. `CHANGE_VERSION_CONFLICT` was defined and never thrown; it now guards
  the co-edit race.
- its `applyAsHuman.length === 1` assertion broke on the fix's optional
  parameter. Arity is not a security property; the assertion now checks the shape
  that actually carries the claim.

## Next action

The integrator's pass, then M7:

1. **Layout.** The right column carries four panels and the middle is dead space.
   Restructure to the narrative order — customers | authority + inspector +
   caller | staged work + apply + timeline.
2. **Root-cause the flex bug** the `webmcp` worker worked around: `.panel` needs
   `flex-shrink: 0` in `app.css`; then drop its `max-height` mitigations.
3. Then: every UX state from `docs/02` (line 163), guided demo mode, browser
   tests for the agent-side selectors that did not exist during batch 1.

## Live workers

None. `.worktrees/{webmcp,timeline,tests}` are integrated and can be closed with
`scripts/close-worker.sh webmcp timeline tests`.

## Loose ends

- `HUMAN_CONFIRMATION_REQUIRED` is defined in the error model and never thrown.
  Either give it a use or say in `docs/16` that it is reserved.
- Browser tests do not yet cover the inspector, the simulated caller, or the
  timeline — those selectors did not exist when the `tests` packet was written.
- Deployment: the user must connect the Upstash store to the Vercel project after
  the first deploy creates it.
