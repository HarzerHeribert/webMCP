# WebMCP as it actually ships — field notes

Measured against **Google Chrome 152.0.7977.64**, launched with
`--enable-features=WebMCP`, on a secure (`https:`) origin, on 2026-08-29.
Reproduce with `scripts/probe-webmcp.mjs`.

These notes exist because every assumption taken from the specification was
wrong in a way that silently disabled the product.

## 1. It is on `document`, not `navigator`

```js
navigator.modelContext   // undefined
document.modelContext    // ModelContext          ← the real one
window.modelContext      // undefined
```

The spec pack and every write-up says `navigator.modelContext`. Chrome ships it
on `document`. A page that probes only `navigator` reports "this browser has no
WebMCP" **in a browser that does**, and cannot tell that apart from a browser
that genuinely doesn't. This is what a run inside ChatGPT's in-app browser hit.

`src/webmcp/adapter.ts` therefore probes `navigator`, `window` **and**
`document`, keeps probing briefly in case the host injects late, and reports
which location answered.

Globals that appear with the flag: `ModelContext`, `WebMCPEvent`. Neither is
present without it, so their absence is a reliable negative.

## 2. The surface

```
document.modelContext.registerTool(descriptor)  → Promise<void>
document.modelContext.getTools()                → RegisteredTool[]
document.modelContext.executeTool(tool, args)   → Promise<result>
document.modelContext.ontoolchange              → event handler
```

There is **no `provideContext`**, which most write-ups present as the primary
call.

A `RegisteredTool` read back from `getTools()` is
`{ name, title, description, inputSchema, origin, window }` — note it does *not*
carry the `execute` function back.

## 3. The descriptor shape works as written

`{ name, description, inputSchema, execute }` registers, and **`execute` is
really called**: it receives the parsed arguments object (`{x: 'hello'}`) and
its return value is serialised back to the caller. Verified end to end.

## 4. `executeTool` takes the tool object and a JSON *string*

```js
mc.executeTool(tool, { x: 'hello' })              // UnknownError: Failed to parse input arguments
mc.executeTool(tool, JSON.stringify({ x: 'hi' })) // works
```

The first argument is the `RegisteredTool` from `getTools()`, not its name.
This matters only for driving it from the page; an agent calls it itself.

## 5. `inputSchema` comes back as a JSON **string**

`getTools()[n].inputSchema` is a `String`, not an object. Reading it with
`schema.properties?.customerId?.enum` silently yields `undefined` — it has to be
`JSON.parse`d first. A probe that forgets this concludes the schema carries
nothing.

Parsed, it is exactly what the page registered. With one customer and two fields
delegated, the tool an agent sees carries:

```json
{ "customerId":     { "enum": ["c-northwind"] },
  "field":          { "enum": ["status", "nextAction"] },
  "mandateVersion": { "const": 1 } }
```

**This is the product's central claim, verified in a real browser:** the schema
an agent reads is a live readout of what the human delegated, narrowed to
exactly that scope and nothing wider.

## 6. **There is no way to unregister a tool**

No `unregisterTool`, `removeTool`, `clearTools`, `setTools`, or
`provideContext`. And re-registering the same name is **ignored** — the first
registration wins, so a narrowed schema cannot replace a broader one either.

### Why this does not break the product, and what it proves

The demo says: narrow the mandate and the tool surface narrows; revoke and it is
gone. On this browser the *registry* cannot be narrowed at all.

That would be fatal to a design where the schema is the security boundary. It is
not fatal here, and the reason is the whole thesis:

> **The schema communicates authority. The backend enforces it.**

A tool that outlives the mandate that produced it is still refused —
`POLICY_CHANGED` if the mandate moved on, `NO_ACTIVE_MANDATE` if it was revoked
— by `server/core/policy.ts`, on every call. The stale registration is a
courtesy that has gone out of date, not a key that still opens the door.

So the honest claim, and the one the interface makes, is:

- the *compiled* surface narrows immediately and the inspector shows it;
- the *browser registry* may retain stale entries, because this browser offers
  no way to withdraw them;
- and neither fact changes what a caller can actually do, because that was never
  decided on the client.

### Consequences for the code

- `adapter.ts` prefers `provideContext` when a browser offers it (atomic
  replace, the shape MCP-001 wants) and falls back to `registerTool`.
- When only `registerTool` exists, the adapter reports `canUnregister: false`
  and the interface says so rather than implying a withdrawal it cannot perform.
- Nothing about enforcement changes in either case.

## 7. The other host: ChatGPT's built-in browser

Chrome behind a flag is not the only door, and it is not the one the challenge
leads with. WebMCP also ships in **the ChatGPT desktop app's built-in browser**,
where it is a product feature named **site tools** rather than an experiment.
That changes what "no WebMCP here" means, and therefore what the gate should
say. Sourced from `https://learn.chatgpt.com/docs/webmcp` and the challenge's
own instructions, not measured here:

- it is the **desktop app only**. The mobile app has no site tools, so there is
  nothing a reader there can switch on — the honest advice is "open it on
  desktop", not "check your settings";
- it requires the latest app version;
- the user can turn it off: `Settings › Browser › Permissions › Enable site
  tools`;
- it depends on the model — **GPT-5.6 Sol** or **Terra**; site tools are
  disabled on **Luna**;
- when it is on, an arrow appears in the address bar;
- the API is the same `document.modelContext.registerTool`, and the documented
  detection is `typeof document.modelContext?.registerTool === "function"` —
  which is what `adapter.ts` already does.

The challenge names the Chrome flag as `chrome://flags/#enable-webmcp-testing`.
`--enable-features=WebMCP` is the equivalent this repo actually measured; both
are named wherever the page or the docs tell someone how to enable it.

### What this changed in the product

The gate used to give one remedy — relaunch Chrome with a flag — to everybody,
including a judge reading it inside the ChatGPT app, where it is not something
they can do. `src/webmcp/host.ts` now picks the remedy from the host, and
`src/components/MandateLayer.tsx` states it. The detection is a **hint for copy
only**: `adapter.ts` still decides what is live by asking the browser, so a
wrong guess costs specificity and nothing else.

## 8. The primitive that is missing

Everything above is something a page can measure. This is the thing a page
cannot have.

The compiled tool surface has no apply, and the server has no agent route to
one. Neither fact stops an agent, because the human's Apply button is still a
button and `event.isTrusted` is true for a synthesised click. Only the browser
or the agent host knows which input it made up — so only host chrome can tell a
person's decision from an agent's.

What is missing is **a grant and a confirmation rendered by the host, from scope
descriptors the page supplies**: the page declares what is being asked for and
what it would touch, the host draws it in its own chrome — in the conversation,
where the agent has no reach — and the human answers there. For a non-technical
person that is also the clearer reading of the event. A button on a page is a
control they are operating. A request in the conversation is what it actually
is: *the agent is asking you for something.*

Such a prompt has two answers, and the second is the interesting one:

- *yes, this once* — an approval; one action, spent when it is used;
- *yes, and stop asking me for the next ten minutes* — a **mandate**: bounded in
  scope, bounded in time, revocable, and precisely the object this project
  compiles.

So Mandate is not a stand-in for the missing primitive. It is the descriptor
that primitive would consume. This repository builds the half that has to live
in the page, because the page is the only half a page can build.

The trade is one trust boundary for a better one, not the removal of a boundary:
it asks the human to trust the agent host's chrome, the way an OS permission
dialog is already trusted. That is a boundary worth having, and no WebMCP host
offers it yet.
