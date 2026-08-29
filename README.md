# Mandate

**Mandate turns a human's explicit, temporary browser-session intent into a live,
bounded WebMCP capability surface.**

Relay CRM is the host demo. Mandate is the product.

---

## The problem

An agent that can act inside your web app needs authority. Today that authority
comes from an API key, an OAuth grant, or a service account — credentials issued
once, scoped broadly, and valid until somebody remembers to revoke them. The
agent gets everything the token allows, forever, whether or not the human is
watching.

That is the wrong shape for the thing people actually want, which is smaller and
much more specific:

> *For the next ten minutes, on these three accounts, you may change the status
> and the next action. Nothing else. And you still don't get to commit it.*

That sentence has no representation in an API key. It has a very natural one in
a browser session, because the browser is where the human's live intent already
lives — the selection, the draft, the page they are looking at.

## What Mandate does

Mandate makes delegation a first-class, visible, temporary act inside the page:

1. **Selection proposes.** Clicking customers in Relay CRM narrows what you
   *could* delegate. It grants nothing, and the interface says so — a selected
   row and a delegated row never look the same.
2. **Delegation grants.** The human names the customers, the fields, and a
   duration. That produces a versioned, revocable, expiring **mandate**.
3. **The capability surface is compiled from that mandate.** The page registers
   WebMCP tools whose schemas are derived from the live scope: the customer id
   enum contains exactly the delegated customers, the field enum exactly the
   delegated fields. Narrow the mandate and the tools narrow with it. Revoke it
   and they disappear.
4. **The agent stages. The human applies.** There is no apply tool, no apply
   route reachable from the tool path, and no `actor: 'agent'` argument that
   could reach the apply method. The most consequential act in the product is
   structurally human-only.
5. **Both edit the same thing.** A human edit and an agent edit land in the same
   staged change, with provenance for each. A change touched by both says so.

## Why WebMCP specifically

A remote MCP server would have to reconstruct, from the outside, what the user
is currently looking at, has selected, and has half-finished — and then be handed
credentials broad enough to cover every case it might need. WebMCP inverts that:
the tools live in the page, so they already have the session, the selection and
the draft, and the authority behind them can be as small and as short-lived as
the moment that produced it.

That makes something possible that a broad API genuinely could not do: **the
scope of what the agent may do is a thing the human sets, sees, and takes back,
in the same interface where the work is happening** — and the tool schema the
agent reads is a live readout of that decision.

## The thing this project is careful about

**A schema communicates authority. It never confers it.**

Every narrowed enum in this app is a courtesy to a well-behaved caller. The
enforcement is `server/core/policy.ts`, which re-checks the mandate — active,
unexpired, the version the caller claims, the customer, the field — on every
single mutating call. A caller that ignores the schema entirely gets exactly as
far as a caller that respects it: nowhere.

This is also why the demo shows the refusals. A revoked mandate producing
`POLICY_CHANGED` server-side, and an undelegated customer producing
`OUT_OF_SCOPE`, are the app working, not the app failing.

CRM notes are treated as untrusted external content and rendered as such. One
seeded record contains a prompt-injection attempt; it changes no authority,
because authority does not come from text.

## Implementation

One npm project, one origin.

```
server/core/     the authoritative domain: sessions, mandates, changes,
                 revisions, validation, audit. Pure, storage-agnostic.
  policy.ts        the enforcement point — every agent-path mutation
  capabilities.ts  the capability compiler: mandate → tool descriptors
  store.ts         the storage port (in-memory adapter for the demo)
server/app.ts    the Hono service; human routes and tool routes, one service
src/webmcp/      the only place `navigator.modelContext` is mentioned
src/components/  the workbench
```

- The service runs *inside* the Vite dev server, so a tool registered by the
  page calls exactly the URL a human click does. There is no second port and no
  proxy hiding a difference that production would expose.
- The capability compiler is the single source for both the registered tools and
  the inspector, so "the inspector shows what is actually registered" holds by
  construction rather than by discipline.
- No LLM, no model proxy, no API key, no remote MCP server, no accounts, no
  browser extension. The simulated caller in the interface invokes the *real*
  tool implementations — it is a test harness, not an agent, and it is labelled
  as one.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, unit + integration tests
npm run test:e2e   # browser tests
```

The WebMCP API is behind a flag in Chrome. Without it the app reports
`WEBMCP_UNAVAILABLE`, stays completely usable by hand, and the built-in
simulated caller drives the same tool implementations — so the whole demo runs
either way.

## What this is not

- Not identity attestation. A WebMCP caller is an untrusted tool caller, not a
  cryptographically identified individual agent. Mandate bounds *what may be
  done in this session*, not *who is doing it*.
- Not a production CRM. Relay CRM is a seeded, resettable demo.
- Not an autonomous agent, and not an agent harness.

## Licence

MIT — see [LICENSE](LICENSE).

Specification pack: [`docs/`](docs/00_PRODUCT_THESIS.md). How this repository is
built: [`docs/process/loop.md`](docs/process/loop.md).
