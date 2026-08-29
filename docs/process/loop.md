# The loop

Adapted from Glasshouse's spec-to-evidence process, cut down to what a
three-day demo can actually pay for.

## Roles

| role | who | does | never |
|---|---|---|---|
| **orchestrator** | Opus, main checkout | order, design, packets, reads every diff, ticks boxes, commits | boilerplate a worker could do |
| **implementer** | Sonnet, isolated worktree | one disjoint slice, with tests | commit, tick a box, edit map/handoff |
| **recon** | any tier, read-only | inventory, answer one question | edit anything |

## One pass

1. **Orient** — `scripts/status.sh`. Open lines, live worktrees, last commits.
2. **Slice** — pick the next open lines. Partition by *the files they touch*.
   Two workers must never be able to touch the same file.
3. **Packet** — `scripts/packet.sh <name>`. Fill it in. It quotes the box lines
   verbatim so the worker never opens the map.
4. **Dispatch** — `scripts/worker.sh <name>` creates `.worktrees/<name>` on
   branch `w/<name>`. Run workers in parallel; three to four is the useful range.
5. **Integrate** — `scripts/integrate.sh a b c` in **one** call. Serial
   integration hides exactly what integration is for: the interactions between
   patches that no single worker can see.
6. **Judge** — read every diff. Run `scripts/check.sh`. Run the demo script in a
   browser. Only then tick boxes, write the handoff, commit.

## Proof, at PoC weight

A box closes when someone **saw the behaviour**, not when code exists. For each
box, one line in the map's evidence column:

- a test name (`policy.spec.ts > rejects out-of-scope field`), or
- a browser step (`e2e: revoke-mid-flight`), or
- `manual: <what was observed>` when it is genuinely visual.

A test that would still pass with the production code deleted is not evidence.
Security lines (`SEC-*`) require a **negative** test — a forged call that is
refused — never only a happy path.

## Slicing rules that were paid for elsewhere

- Map order is a priority, not a mutex. Dispatch disjoint work concurrently.
- Name the other live workers' files in every packet's `FORBIDDEN FILES`.
- A tests-only worker has no tracked changes; `integrate.sh` copies untracked
  files for exactly that reason.
- Once a change names a file, run its tests. Do not read them and decide.
