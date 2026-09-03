# WebMCP Mandate Compiler

**A compiler from human intent to a live, bounded WebMCP tool contract.**

A person says what an agent may touch, on which records, for how long. That
sentence is compiled into the page's WebMCP capability surface — tool schemas
derived from the mandate, narrowing when it narrows — and the server enforces
that same mandate on every call that arrives, so a tool that outlives the
mandate that produced it is refused rather than honoured.

Relay CRM is the host demo. The compiler is the product.

---

## Opening it

**Live — https://webmcp-weld.vercel.app**

Two hosts expose WebMCP to a page today, and Mandate reports which one it is in
rather than assuming:

- **the ChatGPT desktop app's built-in browser**, where WebMCP arrives as *site
  tools*, supported out of the box. It needs the latest app version,
  `Settings › Browser › Permissions › Enable site tools`, and GPT-5.6 Sol or
  Terra — site tools are disabled on Luna. They are **not** available in the
  ChatGPT mobile app.
- **Chrome**, with `chrome://flags/#enable-webmcp-testing` — equivalently
  `--enable-features=WebMCP`, the form this repo measured against Chrome 152.
  The API only appears on a secure origin.

Anywhere else the layer refuses to present itself as live, says what is missing
*for the host you are actually in*, and offers a built-in simulated caller that
runs the same tool implementations with arguments you type. Every enforcement
claim below holds on that path too, because none of it is decided on the client.

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

0. **The layer is not the app.** Relay CRM runs at full width with Mandate shut;
   a docked rail is all that remains. Without WebMCP the layer will not even
   present itself as live — it names what is missing and offers the built-in
   simulated caller as an explicit override, because a capability layer with no
   `document.modelContext` has nothing to compile into.
1. **Selection proposes.** Clicking customers in Relay CRM narrows what you
   *could* delegate. It grants nothing, and the interface says so — a selected
   row and a delegated row never look the same.
2. **Delegation grants.** The human names the customers, the fields, and a
   duration. That produces a versioned, revocable, expiring **mandate**.
3. **The capability surface is compiled from that mandate.** The page registers
   WebMCP tools whose schemas are derived from the live scope: the customer id
   enum contains exactly the delegated customers, the field enum exactly the
   delegated fields. Narrow the mandate and the compiled surface narrows with
   it; revoke it and the surface is empty. Chrome ships no way to *withdraw* a
   registration, so a stale entry can outlive its mandate in the browser's
   registry — the inspector says so plainly, and it changes nothing, because a
   call the mandate no longer covers is refused by the server.
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

## The primitive this is missing

Apply is a button on a page, and a browser-driving agent presses a button
exactly as easily as a person does — `event.isTrusted` is true for both. We
watched ChatGPT's agent do it, against a page that said *"Apply is a human
action"* on the button and *"Staging never commits: only the human can apply"*
in the tool description the page had already handed it. Two statements, in two
channels, and neither one was a boundary.

No amount of page-side work fixes that, because only the browser or the agent
host knows which input it synthesised. The confirmation has to be rendered **by
the host, in the conversation** — where a non-technical person reads it as what
it is, *the agent is asking you for something*, and where the agent cannot reach
it to answer on their behalf.

Such a prompt has two answers. *Yes, this once* is an approval. *Yes, and stop
asking me for ten minutes* is a **mandate** — which is exactly what this project
compiles. Mandate is not a substitute for that primitive; it is the scope
descriptor that primitive would consume. We built the half that has to live in
the page, because a page is the only half a page can build.

This trades one trust boundary for a better one rather than removing it: it asks
you to trust the agent host's chrome, the way an OS permission dialog is already
trusted. That is a boundary worth having, and it does not exist in any WebMCP
host today. The full argument is
[`docs/20_WEBMCP_FIELD_NOTES.md`](docs/20_WEBMCP_FIELD_NOTES.md) §8.

## Verified in a real browser

Chrome 152 with `--enable-features=WebMCP` (equivalently
`chrome://flags/#enable-webmcp-testing`), driving the page's own registered
tools through `document.modelContext.executeTool` — not a simulation:

- before delegating, two read-only tools are registered; after, five;
- the `mandate_stage_account_update` schema an agent reads carries
  `resourceId: ["c-northwind"]`, `field: ["status","nextAction"]`,
  `mandateVersion: 1` — exactly the scope the human granted;
- a real tool call stages a change, and it appears in the interface;
- a call naming an undelegated customer is refused `OUT_OF_SCOPE` by the server.

Everything measured about the shipping API — including that it lives on
`document`, not `navigator`, and that Chrome offers **no way to unregister a
tool** — is written up in
[`docs/20_WEBMCP_FIELD_NOTES.md`](docs/20_WEBMCP_FIELD_NOTES.md). That last
finding would break a design where the schema is the security boundary. It does
not break this one, and the reason is the whole point: a tool that outlives its
mandate is still refused by the server.

## Implementation

One npm project, one origin.

```
server/core/     the authoritative domain: sessions, mandates, changes,
                 revisions, validation, audit. Pure, storage-agnostic.
  policy.ts        the enforcement point — every agent-path mutation
  capabilities.ts  the capability compiler: mandate → tool descriptors
  store.ts         the storage port (in-memory adapter for the demo)
server/app.ts    the Hono service; human routes and tool routes, one service
server/core/domains.ts  what the host application *is*, as data
src/webmcp/      the only place the WebMCP API is touched
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

Deployed as a single Vercel function under `/api` with the built client on the
same origin. Import specifiers carry no `.ts` extension: the platform transpiles
the function entry without rewriting them, and a `.ts` specifier becomes a
runtime module path that does not exist in the lambda.

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

The full, honest list is [`docs/18_LIMITATIONS.md`](docs/18_LIMITATIONS.md) —
including the sentence about delegation that is convenient and slightly false,
and the accurate one that replaces it.

## Licence

MIT — see [LICENSE](LICENSE).

Specification pack: [`docs/`](docs/00_PRODUCT_THESIS.md). How this repository is
built: [`docs/process/loop.md`](docs/process/loop.md).
